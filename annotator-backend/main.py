# terminial-> venv/Scripts/activate.bat

import uvicorn
from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from pathlib import Path
import io
import os
from router import tumour_segmentation
from dotenv import load_dotenv
from typing import List
from sqlalchemy.orm import Session
from models.api_models import ToolConfigRequest
from models.db_model import User, Assay, Case, CaseInput, CaseOutput
from services.minio_service import MinIOService
from database.database import get_db, init_db
from utils.setup import Config
from contextlib import asynccontextmanager


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    load_dotenv()
    init_db()
    print("starting lifespan")
    yield
    # Shutdown
    print("ending lifespan")
    pass


app = FastAPI(title="Medical Image Annotator", verison="1.0.0", lifespan=lifespan)
app.include_router(tumour_segmentation.router)

expose_headers = ["x-volume", "x-file-name", "Content-Disposition"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=expose_headers
)


@app.get('/')
async def root():
    return "Welcome to segmentation backend"


@app.post('/api/tool-config')
async def get_tool_config(request: ToolConfigRequest, db: Session = Depends(get_db)):
    print(f"Received tool config for user: {request.user_info.uuid}")

    # 1. Validation & Resolution
    minio_service = MinIOService()

    # 1.1 Validate Minio public path
    minio_public_path = request.system.minio.public_path
    minio_service.validate_public_path(minio_public_path)

    datasets = request.assay_info.datasets
    cohorts = request.assay_info.cohorts
    required_inputs = Config.INPUTS  # e.g. ["contrast-1"]

    # 1.2 - 1.4 Validate datasets, cohorts, and resolve inputs
    try:
        # returns { cohort_name: { input_type: full_url } }
        resolved_results = minio_service.validate_and_resolve_inputs(
            public_path=minio_public_path,
            datasets=datasets,
            cohorts=cohorts,
            required_inputs=required_inputs
        )
    except ValueError as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=400, detail=str(e))

    # Transactional DB updates
    try:
        # 1. User
        user = db.query(User).filter(User.uuid == request.user_info.uuid).first()  # type: ignore
        if not user:
            user = User(uuid=request.user_info.uuid)
            db.add(user)
            db.commit()
            db.refresh(user)

        # 2. Assay
        # Check if assay exists by UUID
        assay = db.query(Assay).filter(
            Assay.uuid == request.assay_info.uuid  # type: ignore
        ).first()

        if not assay:
            assay = Assay(
                uuid=request.assay_info.uuid,
                user_uuid=user.uuid,
                name=request.assay_info.name,
                minio_public_path=minio_public_path,
                datasets_config=datasets,
                cohorts_config=cohorts
            )
            db.add(assay)
            db.commit()
            db.refresh(assay)

        # 3. Cases (Cohorts)
        # "cohort name is case name"
        for cohort in cohorts:
            # Check if case exists for this assay
            case = db.query(Case).filter(Case.assay_uuid == assay.uuid, Case.name == cohort).first()  # type: ignore
            if not case:
                case = Case(
                    assay_uuid=assay.uuid,
                    user_uuid=user.uuid,
                    name=cohort,
                    is_current=False
                )
                db.add(case)
                db.commit()
                db.refresh(case)

            # 4. Inputs
            # "update to case_inputs table"
            # We have resolved_results[cohort]['contrast-pre'] -> url
            contrast_pre_url = resolved_results[cohort].get("contrast-pre")
            contrast_1_url = resolved_results[cohort].get("contrast-1")
            contrast_2_url = resolved_results[cohort].get("contrast-2")
            contrast_3_url = resolved_results[cohort].get("contrast-3")
            contrast_4_url = resolved_results[cohort].get("contrast-4")
            registration_pre_url = resolved_results[cohort].get("registration-pre")
            registration_1_url = resolved_results[cohort].get("registration-1")
            registration_2_url = resolved_results[cohort].get("registration-2")
            registration_3_url = resolved_results[cohort].get("registration-3")
            registration_4_url = resolved_results[cohort].get("registration-4")

            if not case.input:
                case_input = CaseInput(case_id=case.id, 
                                        contrast_pre_path=contrast_pre_url, 
                                        contrast_1_path=contrast_1_url, 
                                        contrast_2_path=contrast_2_url, 
                                        contrast_3_path=contrast_3_url, 
                                        contrast_4_path=contrast_4_url, 
                                        registration_pre_path=registration_pre_url, 
                                        registration_1_path=registration_1_url, 
                                        registration_2_path=registration_2_url, 
                                        registration_3_path=registration_3_url, 
                                        registration_4_path=registration_4_url)
                db.add(case_input)
            else:
                case.input.contrast_pre_path = contrast_pre_url
                case.input.contrast_1_path = contrast_1_url
                case.input.contrast_2_path = contrast_2_url
                case.input.contrast_3_path = contrast_3_url
                case.input.contrast_4_path = contrast_4_url
                case.input.registration_pre_path = registration_pre_url
                case.input.registration_1_path = registration_1_url
                case.input.registration_2_path = registration_2_url
                case.input.registration_3_path = registration_3_url
                case.input.registration_4_path = registration_4_url

            # 5. Output (ensure it exists)
            if not case.output:
                # Create output directory: outputs/{user_uuid}/{assay_uuid}/medical-image-annotator-outputs
                output_dir = Path(
                    "outputs") / request.user_info.uuid / request.assay_info.uuid / "medical-image-annotator-outputs"
                output_dir.mkdir(parents=True, exist_ok=True)

                # Create case-specific folder
                case_folder = output_dir / cohort
                case_folder.mkdir(parents=True, exist_ok=True)

                file_info = {}

                for idx, output_type in enumerate(Config.OUTPUTS):
                    # Create legacy JSON mask file for backward compatibility
                    filename = output_type
                    if "json" in output_type and not filename.endswith(".json"):
                        filename += ".json"
                    elif "nii" in output_type and not filename.endswith(".nii.gz") and not filename.endswith(".nii"):
                        filename += ".nii.gz"  # Common in medical imaging, but let's stick to simple .nii if specified or no ext
                    elif "obj" in output_type and not filename.endswith(".obj"):
                        filename += ".obj"

                    sam_folder = output_dir / cohort / f"sam-{idx + 1}"
                    sam_folder.mkdir(exist_ok=True, parents=True)
                    file_path = sam_folder / filename

                    # Create empty file
                    if not file_path.exists():
                        file_path.touch()

                    # Get size
                    file_size = file_path.stat().st_size

                    file_info[output_type] = {
                        "path": str(file_path),
                        "size": file_size
                    }

                # Update case_output with fields matching Config.OUTPUTS
                case_output = CaseOutput(
                    case_id=case.id,
                    # Config.OUTPUTS[0]: mask-meta-json
                    mask_meta_json_path=file_info.get("mask-meta-json", {}).get("path"),
                    mask_meta_json_size=file_info.get("mask-meta-json", {}).get("size"),
                    # Config.OUTPUTS[1-3]: mask-layer1-nii, mask-layer2-nii, mask-layer3-nii
                    mask_layer1_nii_path=file_info.get("mask-layer1-nii", {}).get("path"),
                    mask_layer1_nii_size=file_info.get("mask-layer1-nii", {}).get("size"),
                    mask_layer2_nii_path=file_info.get("mask-layer2-nii", {}).get("path"),
                    mask_layer2_nii_size=file_info.get("mask-layer2-nii", {}).get("size"),
                    mask_layer3_nii_path=file_info.get("mask-layer3-nii", {}).get("path"),
                    mask_layer3_nii_size=file_info.get("mask-layer3-nii", {}).get("size"),
                    # Config.OUTPUTS[4]: mask-obj
                    mask_obj_path=file_info.get("mask-obj", {}).get("path"),
                    mask_obj_size=file_info.get("mask-obj", {}).get("size"),

                    temp_dataset_name="medical-image-annotator-outputs",
                )

                db.add(case_output)


        db.commit()
        return {"status": "success", "assay_id": assay.id}

    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")


@app.get("/data/users")
async def get_users(db: Session = Depends(get_db)):
    users = db.query(User).all()
    return users


@app.get("/data/assays")
async def get_assays(db: Session = Depends(get_db)):
    assays = db.query(Assay).all()
    return assays


@app.get("/data/cases")
async def get_cases(db: Session = Depends(get_db)):
    # Using simple join or eager load to show relationships could be useful, 
    # but basic query with SQLAlchemy usually returns nested objects if relationships are set up.
    # We might need to handle serialization carefully if they are circular, but fastAPI handles dicts well.
    cases = db.query(Case).all()
    # Return cases with inputs and outputs
    result = []
    for case in cases:
        result.append({
            "id": case.id,
            "name": case.name,
            "user_uuid": case.user_uuid,
            "assay_uuid": case.assay_uuid,
            "input": {
                "contrast_pre_path": case.input.contrast_pre_path if case.input.contrast_pre_path else None,
                "contrast_1_path": case.input.contrast_1_path if case.input else None,
                "contrast_2_path": case.input.contrast_2_path if case.input else None,
                "contrast_3_path": case.input.contrast_3_path if case.input else None,
                "contrast_4_path": case.input.contrast_4_path if case.input else None,
                "registration_pre_path": case.input.registration_pre_path if case.input else None,
                "registration_1_path": case.input.registration_1_path if case.input else None,
                "registration_2_path": case.input.registration_2_path if case.input else None,
                "registration_3_path": case.input.registration_3_path if case.input else None,
                "registration_4_path": case.input.registration_4_path if case.input else None,
            },
            "output": {
                "mask_json_path": case.output.mask_json_path if case.output else None,
                "mask_json_size": case.output.mask_json_size if case.output else None,
                "mask_obj_path": case.output.mask_obj_path if case.output else None,
                "mask_obj_size": case.output.mask_obj_size if case.output else None,
                "tumour_center_position_json_path": case.output.tumour_center_position_json_path if case.output else None,
            }
        })
    return result


@app.get("/api/test")
async def test():
    blob_content = b"This is the content of the blob."
    blob_stream = io.BytesIO(blob_content)

    # Create the response
    response = Response(content=blob_stream.getvalue())

    # Set the headers to indicate the file type and disposition
    response.headers["Content-Type"] = "application/octet-stream"
    response.headers["Content-Disposition"] = "attachment; filename=blob_file.txt"

    # Add the string data to the response headers
    response.headers["x-file-name"] = "This is a custom string."

    return response


if __name__ == '__main__':
    # uvicorn.run(app)
    uvicorn.run(app, port=8082)
