from utils import convert_to_nii_sigel_channel, tools, convert
from utils.ws_manager import manager
from utils.setup import TumourData
import io
import asyncio
from models.db_model import SessionLocal, Case, CaseInput, CaseOutput
from pathlib import Path


def obj_converter(case_id: str, layer_id: str = "layer1"):
    """
    Convert a NIfTI mask layer to OBJ 3D mesh format.

    This function runs in a background task and:
    1. Clears the existing OBJ file
    2. Reads the specified layer's NIfTI file
    3. Generates a 3D mesh using marching cubes
    4. Writes the mesh to OBJ format
    5. Updates the database
    6. Notifies the frontend via WebSocket

    :param case_id: ID of the case to process
    :param layer_id: Layer to convert ('layer1', 'layer2', or 'layer3')
    """
    with SessionLocal() as session:
        case = session.query(Case).filter(Case.id == case_id).first()  # type: ignore
        case_output = session.query(CaseOutput).filter(CaseOutput.case_id == case_id).first()  # type: ignore

        assert isinstance(case_output, CaseOutput)
        assert isinstance(case.input, CaseInput)

        # Clear current OBJ file
        mesh_obj_path = Path(case_output.mask_obj_path)
        if mesh_obj_path.exists():
            mesh_obj_path.write_text("")
            case_output.mask_obj_size = mesh_obj_path.stat().st_size

        # Convert NIfTI layer to OBJ
        print(f"Starting conversion of {layer_id} to OBJ for case {case_id}")
        convert.convert_nii_to_obj(case_output, layer_id)

        # Commit changes to database
        session.commit()
        session.refresh(case_output)

        print(f"Conversion complete for case {case_id}, {layer_id}")

        # Send notification to frontend via WebSocket
        asyncio.run(notify_frontend(case_id))


async def notify_frontend(case_id: str):
    """Send completion notification to the connected frontend via WebSocket."""
    await manager.send_notification(case_id, {
        "status": "complete",
        "case_id": case_id,
        "action": "reload_obj",
        "volume": TumourData.volume
    })
    print(f"Sent notification to frontend for case {case_id}")


def gltf_converter(case_id: str, layer_id: str = "layer1"):
    """
    Convert a NIfTI mask layer to GLTF 3D mesh format with channel-specific colors.

    This function runs in a background task and:
    1. Reads the specified layer's NIfTI file
    2. For each channel (1-8), generates a separate 3D mesh using marching cubes
    3. Assigns distinct colors to each channel mesh based on CHANNEL_COLORS
    4. Exports all meshes to a single GLTF file with materials
    5. Updates the database
    6. Notifies the frontend via WebSocket

    :param case_id: ID of the case to process
    :param layer_id: Layer to convert ('layer1', 'layer2', or 'layer3')
    """
    with SessionLocal() as session:
        case = session.query(Case).filter(Case.id == case_id).first()  # type: ignore
        case_output = session.query(CaseOutput).filter(CaseOutput.case_id == case_id).first()  # type: ignore

        assert isinstance(case_output, CaseOutput)
        assert isinstance(case.input, CaseInput)

        print(f"Starting GLTF conversion of {layer_id} for case {case_id}")

        # Convert NIfTI layer to GLTF with channel colors
        glb_path = convert.convert_nii_to_gltf(case_output, layer_id)

        if glb_path:
            print(f"GLTF conversion complete for case {case_id}, {layer_id}")
            print(f"GLTF file created at: {glb_path}")

            # Commit changes to database if needed
            session.commit()
            session.refresh(case_output)

            # Send notification to frontend via WebSocket
            asyncio.run(notify_frontend_gltf(case_id, str(glb_path)))
        else:
            print(f"GLTF conversion failed for case {case_id}, {layer_id}")


async def notify_frontend_gltf(case_id: str, gltf_path: str):
    """Send GLTF completion notification to the connected frontend via WebSocket."""
    await manager.send_notification(case_id, {
        "status": "complete",
        "case_id": case_id,
        "action": "reload_gltf",
        "gltf_path": gltf_path,
        "volume": TumourData.volume
    })
    print(f"Sent GLTF notification to frontend for case {case_id}")

