from fastapi import APIRouter
import json
import time
from fastapi import Query, BackgroundTasks, WebSocket, HTTPException, Depends, Request
from fastapi.responses import FileResponse, StreamingResponse
from utils import tools
from utils.ws_manager import manager
from models import model
from task import task_oi
from pathlib import Path
from models.api_models import UserAuth
from sqlalchemy.orm import Session
from models.db_model import User, Assay, Case, CaseInput, CaseOutput
from services.minio_service import MinIOService
from database.database import get_db
from utils.sds import SDSDataset
import asyncio

router = APIRouter()

layers = ["layer1", "layer2", "layer3", "layer4"]


@router.websocket('/ws/{case_id}')
async def websocket_endpoint(websocket: WebSocket, case_id: str):
    """WebSocket endpoint for receiving OBJ conversion completion notifications.

    Args:
        websocket: The WebSocket connection
        case_id: The case ID to associate with this connection
    """
    await manager.connect(case_id, websocket)
    try:
        while True:
            # Keep connection alive, just wait for messages
            await websocket.receive_text()
    except Exception as e:
        print(f"WebSocket closed for case {case_id}: {e}")
    finally:
        manager.disconnect(case_id)


@router.websocket('/ws/sds/{assay_uuid}')
async def websocket_sds(websocket: WebSocket, assay_uuid: str):
    """WebSocket endpoint for SDS generation progress notifications."""
    ws_key = f"sds_{assay_uuid}"
    await manager.connect(ws_key, websocket)
    try:
        while True:
            await websocket.receive_text()
    except Exception as e:
        print(f"SDS WebSocket closed for assay {assay_uuid}: {e}")
    finally:
        manager.disconnect(ws_key)


@router.post("/api/generate_sds")
async def generate_sds(auth: UserAuth, background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    assay = db.query(Assay).filter(Assay.uuid == auth.assay_uuid).first()  # type: ignore
    if not assay:
        raise HTTPException(status_code=404, detail="Assay not found")

    assay_uuid = auth.assay_uuid

    def _run_sds_generation():
        """Run SDS generation in background, zip result, notify via WS."""
        from database.database import SessionLocal
        bg_db = SessionLocal()
        ws_key = f"sds_{assay_uuid}"
        try:
            bg_assay = bg_db.query(Assay).filter(Assay.uuid == assay_uuid).first()
            if bg_assay:
                sds = SDSDataset(bg_assay, bg_db)
                sds.create_output_sds()
                zip_path = sds.zip_dataset()
                # Notify frontend via WS
                asyncio.run(manager.send_notification(ws_key, {
                    "status": "complete",
                    "action": "sds_ready",
                    "assay_uuid": assay_uuid,
                    "zip_path": str(zip_path),
                }))
        except Exception as e:
            print(f"SDS generation failed: {e}")
            try:
                asyncio.run(manager.send_notification(ws_key, {
                    "status": "error",
                    "action": "sds_error",
                    "assay_uuid": assay_uuid,
                    "error": str(e),
                }))
            except Exception:
                pass
        finally:
            bg_db.close()

    background_tasks.add_task(_run_sds_generation)
    return {
        "status": "processing",
        "assay_uuid": auth.assay_uuid,
        "message": "SDS generation started in background"
    }


@router.get("/api/download_sds")
async def download_sds(assay_uuid: str = Query(...), db: Session = Depends(get_db)):
    """Download the zipped SDS dataset for an assay."""
    assay = db.query(Assay).filter(Assay.uuid == assay_uuid).first()  # type: ignore
    if not assay:
        raise HTTPException(status_code=404, detail="Assay not found")

    zip_path = Path(assay.output_sds_path).parent / f"{Path(assay.output_sds_path).name}.zip"
    if not zip_path.exists():
        raise HTTPException(status_code=404, detail="SDS zip not found. Generate SDS first.")

    return FileResponse(
        zip_path,
        media_type="application/zip",
        filename=zip_path.name,
        headers={"Content-Disposition": f"attachment; filename={zip_path.name}"}
    )


@router.post('/api/cases')
async def get_cases_infos(auth: UserAuth, request: Request, db: Session = Depends(get_db)):
    res = {
        "names": [],
        "details": []
    }
    # get cases from db
    cases = db.query(Case).filter(Case.assay_uuid == auth.assay_uuid,  # type: ignore
                                  Case.user_uuid == auth.user_uuid).all()  # type: ignore
    # Construct base_url that works in both local dev and nginx-proxied Docker deploy.
    # In Docker behind nginx, request.base_url is the internal container address.
    # nginx passes X-Forwarded-Host + X-Forwarded-Proto, and PLUGIN_ROUTE_PREFIX is
    # injected as an env var so we can reconstruct the externally-accessible URL.
    import os
    route_prefix = os.environ.get("PLUGIN_ROUTE_PREFIX", "")
    forwarded_host = request.headers.get("x-forwarded-host")
    if forwarded_host and route_prefix:
        scheme = request.headers.get("x-forwarded-proto", "http")
        base_url = f"{scheme}://{forwarded_host}{route_prefix}"
    else:
        base_url = str(request.base_url).rstrip('/')

    for case in cases:
        res["names"].append(case.name)

        def proxy_url(file_type: str, path_val) -> str | None:
            """Return backend proxy URL if the path exists in DB, else None."""
            if not path_val:
                return None
            return f"{base_url}/api/files/{case.id}/{file_type}"

        res["details"].append({
            "id": case.id,
            "name": case.name,
            "assay_uuid": case.assay_uuid,
            "input": {
                "contrast_pre":     proxy_url("contrast_pre",     case.input.contrast_pre_path if case.input else None),
                "contrast_1":       proxy_url("contrast_1",       case.input.contrast_1_path if case.input else None),
                "contrast_2":       proxy_url("contrast_2",       case.input.contrast_2_path if case.input else None),
                "contrast_3":       proxy_url("contrast_3",       case.input.contrast_3_path if case.input else None),
                "contrast_4":       proxy_url("contrast_4",       case.input.contrast_4_path if case.input else None),
                "registration_pre": proxy_url("registration_pre", case.input.registration_pre_path if case.input else None),
                "registration_1":   proxy_url("registration_1",   case.input.registration_1_path if case.input else None),
                "registration_2":   proxy_url("registration_2",   case.input.registration_2_path if case.input else None),
                "registration_3":   proxy_url("registration_3",   case.input.registration_3_path if case.input else None),
                "registration_4":   proxy_url("registration_4",   case.input.registration_4_path if case.input else None),
            },
            "output": {
                # Config.OUTPUTS[0]: mask_meta_json
                "mask_meta_json_path": case.output.mask_meta_json_path if case.output else None,
                "mask_meta_json_size": case.output.mask_meta_json_size if case.output else None,
                # Config.OUTPUTS[1-4]: mask_layer*_nii
                "mask_layer1_nii_path": case.output.mask_layer1_nii_path if case.output else None,
                "mask_layer1_nii_size": case.output.mask_layer1_nii_size if case.output else None,
                "mask_layer2_nii_path": case.output.mask_layer2_nii_path if case.output else None,
                "mask_layer2_nii_size": case.output.mask_layer2_nii_size if case.output else None,
                "mask_layer3_nii_path": case.output.mask_layer3_nii_path if case.output else None,
                "mask_layer3_nii_size": case.output.mask_layer3_nii_size if case.output else None,
                "mask_layer4_nii_path": case.output.mask_layer4_nii_path if case.output else None,
                "mask_layer4_nii_size": case.output.mask_layer4_nii_size if case.output else None,
                # Config.OUTPUTS[5]: mask_obj
                "mask_obj_path": case.output.mask_obj_path if case.output else None,
                "mask_obj_size": case.output.mask_obj_size if case.output else None,
                "mask_glb_path": case.output.mask_glb_path if case.output else None,
                "mask_glb_size": case.output.mask_glb_size if case.output else None,
            }
        })
    return res


async def process_file(file_path: Path, headers: dict):
    if file_path.suffix == '.nrrd':
        return FileResponse(file_path, media_type="application/octet-stream", filename=file_path.name, headers=headers)
    elif file_path.suffix == '.json':
        file_object = tools.getReturnedJsonFormat(file_path)
        return StreamingResponse(file_object, media_type="application/json", headers=headers)
    elif file_path.suffix == '.obj':
        return FileResponse(file_path, media_type="application/octet-stream", filename=file_path.name, headers=headers)
    elif file_path.suffix == '.glb' or file_path.suffix == '.gltf':
        return FileResponse(file_path, media_type="application/octet-stream", filename=file_path.name, headers=headers)
    elif file_path.suffix == '.nii' or file_path.suffix == '.gz' or '.nii' in file_path.suffixes:
        # Handle NIfTI files (.nii and .nii.gz)
        return FileResponse(file_path, media_type="application/octet-stream", filename=file_path.name, headers=headers)
    else:
        return None


@router.get('/api/single-file')
async def send_single_file(path: str = Query(None)):
    file_path = Path(path)
    if file_path.exists():
        headers = {"x-file-name": file_path.name}
        response = await process_file(file_path, headers)
        if response:
            return response
        else:
            return "Unsupported file format!"
    else:
        return "No file exists!"


@router.post("/api/mask/init-layers")
async def init_mask(mask_layer: model.MaskInitRequest, db: Session = Depends(get_db)):
    """
    Initialize a single mask layer with metadata from frontend.
    Called when frontend initializes each layer individually.

    Steps:
    1. Save metadata (dimensions, spacing, origin) to mask_meta_json_path
    2. Create empty NIfTI file for the specified layer
    3. Update database sizes
    """
    case_output = db.query(CaseOutput).filter(CaseOutput.case_id == mask_layer.caseId).first()  # type: ignore
    if not case_output:
        raise HTTPException(status_code=404, detail="CaseOutput not found")

    print(f"Initializing {mask_layer.layerId} for case {mask_layer.caseId}")
    print(f"Dimensions: {mask_layer.dimensions}")
    print(f"Spacing: {mask_layer.voxelSpacing}")
    print(f"Origin: {mask_layer.spaceOrigin}")

    # Step 1: Save metadata to mask_meta_json_path
    if case_output.mask_meta_json_path:
        tools.save_mask_meta_json(
            case_output,
            dimensions=mask_layer.dimensions,
            spacing=mask_layer.voxelSpacing if mask_layer.voxelSpacing else [1.0, 1.0, 1.0],
            origin=mask_layer.spaceOrigin if mask_layer.spaceOrigin else [0.0, 0.0, 0.0]
        )

    # Step 2: Create empty NIfTI file for the specified layer
    # Validate layerId
    if mask_layer.layerId not in layers:
        raise HTTPException(status_code=400, detail="Invalid layerId. Must be layer1, layer2, or layer3")

    # Get the NIfTI path for this layer from database
    nii_path_attr = f"mask_{mask_layer.layerId}_nii_path"
    nii_size_attr = f"mask_{mask_layer.layerId}_nii_size"

    nii_path = getattr(case_output, nii_path_attr)

    if not nii_path:
        raise HTTPException(status_code=400, detail=f"{mask_layer.layerId} path not configured in database")

    # Create the empty NIfTI file
    file_size = tools.create_nifti_file(
        file_path=nii_path,
        dimensions=mask_layer.dimensions,
        spacing=mask_layer.voxelSpacing if mask_layer.voxelSpacing else [1.0, 1.0, 1.0],
        origin=mask_layer.spaceOrigin if mask_layer.spaceOrigin else [0.0, 0.0, 0.0]
    )

    # Update the size in database
    setattr(case_output, nii_size_attr, file_size)

    # Commit changes to database
    db.commit()
    db.refresh(case_output)

    return {
        "success": True,
        "dimensions": mask_layer.dimensions,
        "layer_initialized": mask_layer.layerId,
        "file_size": file_size
    }


@router.post("/api/mask/replace")
async def replace_mask(mask_update: model.MaskSliceUpdate, db: Session = Depends(get_db)):
    """
    Update a specific slice in a mask layer's NIfTI file.

    Receives a slice update from the frontend and writes it to the corresponding
    layer's NIfTI file, then updates the database size.

    Args:
        mask_update: Contains caseId, layerId, sliceIndex, axis, sliceData, width, height
        db: Database session

    Returns:
        Success status with updated file size
    """
    # Get the case output from database
    case_output = db.query(CaseOutput).filter(CaseOutput.case_id == mask_update.caseId).first()  # type: ignore
    if not case_output:
        raise HTTPException(status_code=404, detail="CaseOutput not found")

    # Validate layerId
    if mask_update.layerId not in layers:
        raise HTTPException(status_code=400, detail="Invalid layerId. Must be layer1, layer2, layer3, or layer4")

    # Get the NIfTI path for this layer from database
    nii_path_attr = f"mask_{mask_update.layerId}_nii_path"
    nii_size_attr = f"mask_{mask_update.layerId}_nii_size"

    nii_path = getattr(case_output, nii_path_attr)

    if not nii_path:
        raise HTTPException(status_code=400, detail=f"{mask_update.layerId} path not configured in database")

    nii_file = Path(nii_path)
    if not nii_file.exists():
        raise HTTPException(status_code=404, detail=f"{mask_update.layerId} NIfTI file not found: {nii_path}")

    try:
        # Update the slice in the NIfTI file
        updated_size = tools.update_nifti_slice(
            file_path=nii_path,
            slice_data=mask_update.sliceData,
            slice_index=mask_update.sliceIndex,
            axis=mask_update.axis,
            width=mask_update.width,
            height=mask_update.height
        )

        # Update the size in database
        setattr(case_output, nii_size_attr, updated_size)

        # Commit changes to database
        db.commit()
        db.refresh(case_output)

        return {
            "success": True,
            "layerId": mask_update.layerId,
            "sliceIndex": mask_update.sliceIndex,
            "axis": mask_update.axis,
            "file_size": updated_size
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to update mask slice: {str(e)}")


@router.get("/api/clearmesh")
async def clear_mesh(case_id: str = Query(None), db: Session = Depends(get_db)):
    case_output = db.query(CaseOutput).filter(CaseOutput.case_id == case_id).first()  # type: ignore
    if not case_output:
        raise HTTPException(status_code=404, detail="CaseOutput not found")

    assert isinstance(case_output, CaseOutput)
    mesh_obj_path = Path(case_output.mask_obj_path)
    if mesh_obj_path.exists():
        mesh_obj_path.write_text("")
        case_output.mask_obj_size = mesh_obj_path.stat().st_size

        db.commit()
        db.refresh(case_output)
        return True
    else:
        mesh_obj_path.mkdir(parents=True, exist_ok=True)
        print("No mesh obj exists!")
        return False


@router.get("/api/mask/save")
async def save_mask(
        case_id: str,
        layer_id: str = Query("layer1", description="Layer to convert to OBJ (layer1/layer2/layer3)"),
        background_tasks: BackgroundTasks = None,
        db: Session = Depends(get_db)
):
    """
    Convert a NIfTI mask layer to OBJ 3D mesh format.

    This endpoint triggers a background task that:
    1. Reads the specified layer's NIfTI file
    2. Generates a 3D mesh using marching cubes
    3. Writes the mesh to OBJ format
    4. Notifies the frontend via WebSocket when complete

    Args:
        case_id: ID of the case to process
        layer_id: Layer to convert ('layer1', 'layer2', or 'layer3'), defaults to 'layer1'
        background_tasks: FastAPI background tasks
        db: Database session

    Returns:
        Success status with layer information
    """
    # Validate case exists
    case_output = db.query(CaseOutput).filter(CaseOutput.case_id == case_id).first()  # type: ignore
    if not case_output:
        raise HTTPException(status_code=404, detail="CaseOutput not found")

    # Validate layer_id
    if layer_id not in ["layer1", "layer2", "layer3"]:
        raise HTTPException(status_code=400, detail="Invalid layer_id. Must be layer1, layer2, or layer3")

    # Check if layer has data
    nii_size_attr = f"mask_{layer_id}_nii_size"
    nii_size = getattr(case_output, nii_size_attr)

    if not nii_size or nii_size == 0:
        raise HTTPException(status_code=400, detail=f"{layer_id} has no data to convert")

    # Add background task to convert NIfTI to OBJ
    background_tasks.add_task(task_oi.obj_converter, case_id, layer_id)

    return {
        "success": True,
        "message": f"Started converting {layer_id} to OBJ for case {case_id}",
        "layer_id": layer_id
    }


@router.get("/api/mask/save-gltf")
async def save_mask_gltf(
        case_id: str,
        layer_id: str = Query("layer1", description="Layer to convert to GLTF (layer1/layer2/layer3)"),
        background_tasks: BackgroundTasks = None,
        db: Session = Depends(get_db)
):
    """
    Convert a NIfTI mask layer to GLTF 3D mesh format with channel-specific colors.

    This endpoint triggers a background task that:
    1. Reads the specified layer's NIfTI file
    2. For each channel (1-8), generates a separate 3D mesh using marching cubes
    3. Assigns distinct colors to each channel mesh
    4. Exports all meshes to a single GLTF file with materials
    5. Notifies the frontend via WebSocket when complete

    Unlike OBJ export which merges all channels into a single mesh,
    GLTF export preserves channel information with color-coded meshes.

    Args:
        case_id: ID of the case to process
        layer_id: Layer to convert ('layer1', 'layer2', or 'layer3'), defaults to 'layer1'
        background_tasks: FastAPI background tasks
        db: Database session

    Returns:
        Success status with layer information

    Example:
        GET /api/mask/save-gltf?case_id=123&layer_id=layer1
    """
    # Validate case exists
    case_output = db.query(CaseOutput).filter(CaseOutput.case_id == case_id).first()  # type: ignore
    if not case_output:
        raise HTTPException(status_code=404, detail="CaseOutput not found")

    # Validate layer_id
    if layer_id not in ["layer1", "layer2", "layer3"]:
        raise HTTPException(status_code=400, detail="Invalid layer_id. Must be layer1, layer2, or layer3")

    # Check if layer has data
    nii_size_attr = f"mask_{layer_id}_nii_size"
    nii_size = getattr(case_output, nii_size_attr)

    if not nii_size or nii_size == 0:
        raise HTTPException(status_code=400, detail=f"{layer_id} has no data to convert")

    # Add background task to convert NIfTI to GLTF
    background_tasks.add_task(task_oi.gltf_converter, case_id, layer_id)

    return {
        "success": True,
        "message": f"Started converting {layer_id} to GLTF with channel colors for case {case_id}",
        "layer_id": layer_id,
        "format": "gltf"
    }


@router.get("/api/breast_points")
async def get_breast_points(name: str = Query(None), filename: str = Query(None)):
    checked = tools.check_file_exist(name, "json", f"{filename}.json")
    if checked:
        path = tools.get_file_path(name, "json", f"{filename}.json")
        if "nipple" in filename:
            file_object = tools.getReturnedJsonFormat(path)
            return StreamingResponse(file_object, media_type="application/json")
        else:
            # file_object = tools.getReturnedJsonFormat(path)
            return FileResponse(path, media_type="application/json")
    else:
        return False


@router.get("/api/breast_model")
async def get_display_breast_model(name: str = Query(None)):
    breast_mesh_path = tools.get_file_path(name, "obj", "prone_surface.obj")
    if breast_mesh_path is not None and breast_mesh_path.exists():
        file_res = FileResponse(breast_mesh_path, media_type="application/octet-stream", filename="prone_surface.obj")
        return file_res
    else:
        return False


# =============================================================================
# Phase 0 - Data Persistence Strategy: New Mask APIs
# =============================================================================

@router.get("/api/mask/all/{case_id}")
async def get_all_masks(case_id: int, db: Session = Depends(get_db)):
    """
    Load all 3 mask layers for a case in a single request.
    Returns msgpack-encoded binary data for efficient transfer.
    
    Frontend usage: 
        const data = msgpack.decode(new Uint8Array(await response.arrayBuffer()))
        if (data.layer1) segmentationManager.setLayerData('layer1', new Uint8Array(data.layer1))
    """
    import msgpack
    from fastapi.responses import Response

    case_output = db.query(CaseOutput).filter(CaseOutput.case_id == case_id).first()  # type: ignore
    if not case_output:
        raise HTTPException(status_code=404, detail="CaseOutput not found")

    masks = {
        "shape": None,  # Will be populated from NIfTI header if data exists
    }

    # Load each layer's NIfTI file if it exists and has data
    for layer_idx in range(1, 4):
        layer_path_attr = f"mask_layer{layer_idx}_nii_path"
        layer_size_attr = f"mask_layer{layer_idx}_nii_size"

        layer_path = getattr(case_output, layer_path_attr)
        layer_size = getattr(case_output, layer_size_attr)

        if layer_path and layer_size and layer_size > 0:
            file_path = Path(layer_path)
            if file_path.exists() and file_path.stat().st_size > 0:
                # Read the raw bytes of the NIfTI file
                with open(file_path, "rb") as f:
                    masks[f"layer{layer_idx}"] = f.read()
            else:
                masks[f"layer{layer_idx}"] = None
        else:
            masks[f"layer{layer_idx}"] = None

    return Response(content=msgpack.packb(masks), media_type="application/msgpack")


@router.get("/api/mask/raw/{case_id}/{layer_id}")
async def get_mask_raw(case_id: int, layer_id: str, db: Session = Depends(get_db)):
    """
    Get raw Uint8Array data for a specific layer.
    Returns application/octet-stream with X-Mask-Shape header.
    
    Useful for AI model inference results that skip NIfTI encoding.
    """
    from fastapi.responses import Response

    case_output = db.query(CaseOutput).filter(CaseOutput.case_id == case_id).first()  # type: ignore
    if not case_output:
        raise HTTPException(status_code=404, detail="CaseOutput not found")

    # Validate layer_id
    if layer_id not in ["layer1", "layer2", "layer3"]:
        raise HTTPException(status_code=400, detail="Invalid layer_id. Must be layer1, layer2, or layer3")

    layer_path = getattr(case_output, f"mask_{layer_id}_nii_path")
    layer_size = getattr(case_output, f"mask_{layer_id}_nii_size")

    if not layer_path or not layer_size or layer_size == 0:
        raise HTTPException(status_code=404, detail=f"Layer {layer_id} has no data")

    file_path = Path(layer_path)
    if not file_path.exists() or file_path.stat().st_size == 0:
        raise HTTPException(status_code=404, detail=f"Layer {layer_id} file not found or empty")

    # Read the NIfTI file and extract raw data
    # For now, return the raw file bytes - frontend will parse NIfTI
    with open(file_path, "rb") as f:
        raw_data = f.read()

    return Response(
        content=raw_data,
        media_type="application/octet-stream",
        headers={"X-Layer-Id": layer_id}
    )


@router.post("/api/mask/delta")
async def apply_mask_delta(delta: model.MaskDeltaRequest, db: Session = Depends(get_db)):
    """
    Apply incremental delta updates to a specific layer.
    Only modifies changed voxels instead of replacing entire slices.
    
    This is much more efficient than the legacy /api/mask/replace endpoint
    which requires sending entire slice data.
    """
    import nibabel as nib
    import numpy as np

    case_output = db.query(CaseOutput).filter(CaseOutput.case_id == delta.caseId).first()  # type: ignore
    if not case_output:
        raise HTTPException(status_code=404, detail="CaseOutput not found")

    # Validate layer
    if delta.layer not in ["layer1", "layer2", "layer3"]:
        raise HTTPException(status_code=400, detail="Invalid layer. Must be layer1, layer2, or layer3")

    layer_path = getattr(case_output, f"mask_{delta.layer}_nii_path")
    if not layer_path:
        raise HTTPException(status_code=404, detail=f"Layer {delta.layer} path not configured")

    file_path = Path(layer_path)

    try:
        # Load existing NIfTI or create new if empty
        if file_path.exists() and file_path.stat().st_size > 0:
            img = nib.load(str(file_path))
            data = img.get_fdata().astype(np.uint8)
            affine = img.affine
        else:
            # Cannot apply delta to non-existent data
            raise HTTPException(
                status_code=400,
                detail=f"Layer {delta.layer} has no initialized data. Use /api/mask/init first."
            )

        # Apply delta changes
        for change in delta.changes:
            if 0 <= change.x < data.shape[0] and \
                    0 <= change.y < data.shape[1] and \
                    0 <= change.z < data.shape[2]:
                data[change.x, change.y, change.z] = change.value

        # Save updated NIfTI
        new_img = nib.Nifti1Image(data, affine)
        nib.save(new_img, str(file_path))

        # Update size in database
        setattr(case_output, f"mask_{delta.layer}_nii_size", file_path.stat().st_size)
        db.commit()
        db.refresh(case_output)

        return {"success": True, "changesApplied": len(delta.changes)}

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to apply delta: {str(e)}")


@router.post("/api/mask/init-layers")
async def init_mask_layers(request: model.MaskInitRequest, db: Session = Depends(get_db)):
    """
    Initialize empty NIfTI mask files for a new case.
    Called when all layer sizes are 0 (new case).
    
    Creates 3 empty Uint8Array volumes with the specified dimensions.
    """
    import nibabel as nib
    import numpy as np

    case_output = db.query(CaseOutput).filter(CaseOutput.case_id == request.caseId).first()  # type: ignore
    if not case_output:
        raise HTTPException(status_code=404, detail="CaseOutput not found")

    if len(request.dimensions) != 3:
        raise HTTPException(status_code=400, detail="Dimensions must be [width, height, depth]")

    width, height, depth = request.dimensions

    # Create affine matrix from spacing and origin
    if request.voxelSpacing and len(request.voxelSpacing) >= 3:
        spacing = request.voxelSpacing[:3]
    else:
        spacing = [1.0, 1.0, 1.0]  # Default 1mm spacing

    if request.spaceOrigin and len(request.spaceOrigin) >= 3:
        origin = request.spaceOrigin[:3]
    else:
        origin = [0.0, 0.0, 0.0]

    # RAI→LPS conversion: NRRD uses RAI [-172.9, -150.6, -60.3],
    # NIfTI uses LPS [172.9, 150.6, -60.3]. Negate X and Y.
    affine = np.diag([-spacing[0], -spacing[1], spacing[2], 1.0])
    affine[:3, 3] = [-origin[0], -origin[1], origin[2]]

    # Create empty volume
    empty_data = np.zeros((width, height, depth), dtype=np.uint8)

    # Initialize each layer
    for layer_idx in range(1, 4):
        layer_path = getattr(case_output, f"mask_layer{layer_idx}_nii_path")
        if layer_path:
            file_path = Path(layer_path)
            file_path.parent.mkdir(parents=True, exist_ok=True)

            # Create NIfTI image
            img = nib.Nifti1Image(empty_data.copy(), affine)
            nib.save(img, str(file_path))

            # Update size in database
            setattr(case_output, f"mask_layer{layer_idx}_nii_size", file_path.stat().st_size)

    db.commit()
    db.refresh(case_output)

    return {
        "success": True,
        "dimensions": request.dimensions,
        "layers_initialized": ["layer1", "layer2", "layer3"]
    }


# ---------------------------------------------------------------------------
# File proxy: maps file_type names to CaseInput column attributes
# ---------------------------------------------------------------------------
_FILE_TYPE_TO_ATTR = {
    "contrast_pre":     "contrast_pre_path",
    "contrast_1":       "contrast_1_path",
    "contrast_2":       "contrast_2_path",
    "contrast_3":       "contrast_3_path",
    "contrast_4":       "contrast_4_path",
    "registration_pre": "registration_pre_path",
    "registration_1":   "registration_1_path",
    "registration_2":   "registration_2_path",
    "registration_3":   "registration_3_path",
    "registration_4":   "registration_4_path",
}


@router.get("/api/files/{case_id}/{file_type}")
async def get_file_proxy(case_id: int, file_type: str, db: Session = Depends(get_db)):
    """
    Stream a MinIO object through the backend so the browser never needs to
    reach MinIO directly.  This avoids the presigned-URL host mismatch
    problem in Docker (internal minio:9000 vs external localhost:8004).
    """
    if file_type not in _FILE_TYPE_TO_ATTR:
        raise HTTPException(status_code=400, detail=f"Unknown file_type: {file_type}")

    case_input = db.query(CaseInput).filter(CaseInput.case_id == case_id).first()  # type: ignore
    if not case_input:
        raise HTTPException(status_code=404, detail="Case input not found")

    stored_url = getattr(case_input, _FILE_TYPE_TO_ATTR[file_type])
    if not stored_url:
        raise HTTPException(status_code=404, detail=f"No file for {file_type} in case {case_id}")

    try:
        minio_svc = MinIOService()
        bucket, object_path = minio_svc._extract_bucket_and_path(stored_url)
        stat = minio_svc.client.stat_object(bucket, object_path)
        response = minio_svc.client.get_object(bucket, object_path)
        filename = object_path.rsplit("/", 1)[-1]

        def iterfile():
            try:
                for chunk in response.stream(1024 * 64):  # 64 KB chunks
                    yield chunk
            finally:
                response.close()
                response.release_conn()

        return StreamingResponse(
            iterfile(),
            media_type="application/octet-stream",
            headers={
                "Content-Length": str(stat.size),
                "Content-Disposition": f"inline; filename={filename}",
                "x-file-name": filename,
            },
        )
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Failed to stream file from MinIO: {e}")


@router.websocket("/ws/mask/{case_id}")
async def websocket_mask(websocket: WebSocket, case_id: str):
    """
    WebSocket endpoint for real-time mask updates.
    Used for AI inference results to push mask data to frontend.
    
    Frontend connects and receives binary Uint8Array data when AI generates new masks.
    """
    await manager.connect(f"mask_{case_id}", websocket)
    try:
        while True:
            # Keep connection alive, can receive commands from frontend
            data = await websocket.receive_text()
            # Handle any frontend commands here if needed
            if data == "ping":
                await websocket.send_text("pong")
    except Exception as e:
        print(f"Mask WebSocket closed for case {case_id}: {e}")
    finally:
        manager.disconnect(f"mask_{case_id}")
