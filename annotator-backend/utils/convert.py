import numpy as np
import json
import SimpleITK as sitk
from skimage.measure import marching_cubes
import nibabel as nib
from .tools import get_file_path, getJsonData
from .setup import Config, TumourData
from models.db_model import CaseOutput
from pathlib import Path
import requests
import tempfile
import os

try:
    import trimesh
    TRIMESH_AVAILABLE = True
except ImportError:
    TRIMESH_AVAILABLE = False
    print("Warning: trimesh not installed. GLTF export will not be available.")
    print("Install with: pip install trimesh")


# Channel color mapping (RGB values 0-255)
# Matches frontend MASK_CHANNEL_COLORS for consistency
CHANNEL_COLORS = {
    0: [0, 0, 0, 0],           # Transparent (not used in mesh)
    1: [0, 255, 0, 255],       # Green
    2: [255, 0, 0, 255],       # Red
    3: [0, 0, 255, 255],       # Blue
    4: [255, 255, 0, 255],     # Yellow
    5: [255, 0, 255, 255],     # Magenta
    6: [0, 255, 255, 255],     # Cyan
    7: [255, 165, 0, 255],     # Orange
    8: [128, 0, 128, 255],     # Purple
}


def convert_nii_to_obj(case_output: CaseOutput, layer_id: str = "layer1"):
    """
    Convert NIfTI mask file to OBJ 3D mesh file.

    Reads the specified layer's NIfTI file, extracts all non-zero voxels
    (any channel value > 0), and generates a 3D mesh using marching cubes.

    :param case_output: CaseOutput database model instance
    :param layer_id: Layer to convert ('layer1', 'layer2', or 'layer3')
    :return: None (updates case_output.mask_obj_size in-place)
    """
    dest = Path(case_output.mask_obj_path)

    # Get the NIfTI path for the specified layer
    nii_path_attr = f"mask_{layer_id}_nii_path"
    nii_path = getattr(case_output, nii_path_attr)

    if not nii_path:
        print(f"Error: {layer_id} path not configured in database")
        return

    nii_file = Path(nii_path)
    if not nii_file.exists():
        print(f"Error: {layer_id} NIfTI file not found: {nii_path}")
        return

    try:
        # Load the NIfTI file using nibabel
        img = nib.load(str(nii_file))
        data = img.get_fdata().astype(np.uint8)
        affine = img.affine

        # Extract spacing and origin from affine matrix
        spacing = [abs(affine[0, 0]), abs(affine[1, 1]), abs(affine[2, 2])]
        origin = [affine[0, 3], affine[1, 3], affine[2, 3]]

        # Create binary mask: any non-zero value (any channel > 0) becomes 255
        # This handles multiple channels (0-8) by treating any value > 0 as mask
        binary_mask = np.zeros_like(data, dtype=np.uint8)
        binary_mask[data > 0] = 255

        # Calculate volume (mm³) of non-zero voxels
        count = np.count_nonzero(binary_mask > 0)
        TumourData.volume = count * spacing[0] * spacing[1] * spacing[2]

        print(f"Converting {layer_id} to OBJ: {count} non-zero voxels, volume = {TumourData.volume:.2f} mm³")

        # Check if there's any data to convert
        if count == 0:
            print(f"Warning: {layer_id} has no mask data (all zeros), creating empty OBJ file")
            # Create empty OBJ file
            dest.write_text("")
            case_output.mask_obj_size = dest.stat().st_size
            TumourData.volume = 0
            return

        # Apply marching cubes to generate 3D mesh
        # Note: marching_cubes expects (x, y, z) order
        verts, faces, normals, values = marching_cubes(binary_mask, level=127)

        # Transform voxel grid coordinates to world coordinates
        # verts are in (x, y, z) format, multiply by spacing and add origin
        verts = verts * spacing + origin

        # OBJ format uses 1-indexed faces
        faces = faces + 1

        # Flip normals (medical imaging convention)
        for idx, normal in enumerate(normals):
            normals[idx] = [-n for n in normal]

        # Write OBJ file
        with open(dest, 'w') as out_file:
            # Write vertices
            for item in verts:
                out_file.write("v {0} {1} {2}\n".format(item[0], item[1], item[2]))
            # Write normals
            for item in normals:
                out_file.write("vn {0} {1} {2}\n".format(item[0], item[1], item[2]))
            # Write faces
            for item in faces:
                out_file.write("f {0}//{0} {1}//{1} {2}//{2}\n".format(item[0], item[1], item[2]))

        # Update file size in database
        case_output.mask_obj_size = dest.stat().st_size

        print(f"Finished converting {layer_id} to OBJ: {verts.shape[0]} vertices, {faces.shape[0]} faces")
        print(f"OBJ file size: {case_output.mask_obj_size} bytes")

    except RuntimeError as e:
        # Marching cubes failed (usually because no surface was found)
        print(f"RuntimeError during marching cubes: {e}")
        try:
            if dest.exists():
                dest.unlink()
            TumourData.volume = 0
            Config.Updated_Mesh = True
            print(f"{dest.name} file deleted successfully!")
        except OSError as e:
            print(f"Failed to delete file: {e}")

    except Exception as e:
        print(f"Error converting {layer_id} to OBJ: {e}")
        import traceback
        print(traceback.format_exc())


def convert_nii_to_gltf(case_output: CaseOutput, layer_id: str = "layer1", glb_path: str = None):
    """
    Convert NIfTI mask file to GLTF 3D mesh file with channel-specific colors.

    Each channel (1-8) in the NIfTI file is converted to a separate mesh
    with its own color/material. This allows visualization of multi-label
    segmentation data with distinct colors for each label.

    :param case_output: CaseOutput database model instance
    :param layer_id: Layer to convert ('layer1', 'layer2', or 'layer3')
    :param glb_path: Optional custom output path for GLTF file
    :return: Path to the generated GLTF file, or None on error
    """
    if not TRIMESH_AVAILABLE:
        print("Error: trimesh library is required for GLTF export")
        print("Install with: pip install trimesh")
        return None

    # Determine output path - use .glb extension for single binary file
    if glb_path is None:
        # Default: use mask_obj_path but change extension to .glb (binary GLTF)
        print(case_output.mask_glb_path)
        glb_path = Path(case_output.mask_glb_path)
        dest = glb_path.with_suffix('.glb')
    else:
        dest = Path(glb_path)
        # Ensure .glb extension for single-file output
        if dest.suffix.lower() not in ['.glb', '.gltf']:
            dest = dest.with_suffix('.glb')

    # Get the NIfTI path for the specified layer
    nii_path_attr = f"mask_{layer_id}_nii_path"
    nii_path = getattr(case_output, nii_path_attr)

    if not nii_path:
        print(f"Error: {layer_id} path not configured in database")
        return None

    nii_file = Path(nii_path)
    if not nii_file.exists():
        print(f"Error: {layer_id} NIfTI file not found: {nii_path}")
        return None

    try:
        # Load the NIfTI file using nibabel
        img = nib.load(str(nii_file))
        data = img.get_fdata().astype(np.uint8)
        affine = img.affine

        # Extract spacing and origin from affine matrix
        spacing = np.array([abs(affine[0, 0]), abs(affine[1, 1]), abs(affine[2, 2])])
        origin = np.array([affine[0, 3], affine[1, 3], affine[2, 3]])

        print(f"Converting {layer_id} to GLTF with multi-channel colors")
        print(f"Volume shape: {data.shape}, spacing: {spacing}, origin: {origin}")

        # Collect meshes for all non-zero channels
        meshes = []
        total_volume = 0

        # Process each channel (1-8, skip 0 which is transparent/background)
        for channel_id in range(1, 9):
            # Create binary mask for this specific channel
            channel_mask = np.zeros_like(data, dtype=np.uint8)
            channel_mask[data == channel_id] = 255

            # Count voxels for this channel
            voxel_count = np.count_nonzero(channel_mask > 0)

            if voxel_count == 0:
                # Skip empty channels
                continue

            # Calculate volume for this channel
            channel_volume = voxel_count * spacing[0] * spacing[1] * spacing[2]
            total_volume += channel_volume

            print(f"  Channel {channel_id}: {voxel_count} voxels, volume = {channel_volume:.2f} mm³")

            try:
                # Apply marching cubes to generate 3D mesh for this channel
                verts, faces, normals, values = marching_cubes(channel_mask, level=127)

                # Transform voxel grid coordinates to world coordinates
                verts = verts * spacing + origin

                # Create trimesh object
                mesh = trimesh.Trimesh(
                    vertices=verts,
                    faces=faces,
                    vertex_normals=normals,
                    process=False  # Don't auto-process to preserve our normals
                )

                # Assign color to this mesh based on channel
                color = CHANNEL_COLORS.get(channel_id, [255, 255, 255, 255])
                # Convert to 0-1 range for trimesh
                mesh.visual.vertex_colors = [c / 255.0 for c in color]

                meshes.append(mesh)
                print(f"  Channel {channel_id} mesh: {len(verts)} vertices, {len(faces)} faces")

            except RuntimeError as e:
                print(f"  Channel {channel_id}: marching cubes failed - {e}")
                continue

        # Check if we have any meshes to export
        if len(meshes) == 0:
            print(f"Warning: {layer_id} has no non-zero channel data, creating empty GLB file")
            TumourData.volume = 0
            # Create an empty GLTF scene
            scene = trimesh.Scene()
            # Export as GLB 2.0 (binary GLTF 2.0)
            try:
                export_data = scene.export(file_type='glb')
                with open(dest, 'wb') as f:
                    f.write(export_data)
            except Exception as e:
                print(f"Warning: GLB export failed: {e}")
                scene.export(str(dest), file_type='gltf')

            # Update database with file size and path
            case_output.mask_glb_path = str(dest)
            case_output.mask_glb_size = dest.stat().st_size

            return dest

        # Combine all channel meshes into a single scene
        scene = trimesh.Scene()
        for i, mesh in enumerate(meshes):
            scene.add_geometry(mesh, node_name=f"channel_{i+1}")

        # Export to GLB 2.0 format (binary GLTF 2.0)
        # Using explicit GLTF 2 export to ensure Three.js compatibility
        try:
            # Method 1: Try direct GLB export (should be GLTF 2.0 by default in modern trimesh)
            export_data = scene.export(file_type='glb')
            with open(dest, 'wb') as f:
                f.write(export_data)
        except Exception as e:
            print(f"Warning: GLB export failed, trying alternative method: {e}")
            # Method 2: Fallback to GLTF text format export
            scene.export(str(dest), file_type='gltf')

        # Update database with file size and path
        case_output.mask_glb_path = str(dest)
        case_output.mask_glb_size = dest.stat().st_size

        # Update volume in global state
        TumourData.volume = total_volume

        print(f"Finished converting {layer_id} to GLB:")
        print(f"  Total channels: {len(meshes)}")
        print(f"  Total volume: {total_volume:.2f} mm³")
        print(f"  GLB file: {dest}")
        print(f"  File size: {case_output.mask_glb_size} bytes")

        return dest

    except Exception as e:
        print(f"Error converting {layer_id} to GLTF: {e}")
        import traceback
        print(traceback.format_exc())
        return None


def convert_to_nii(case_output: CaseOutput, pre_nrrd: str):
    """
    convert pixels to nii file
    :param case_output: CaseOutput
    :param pre_nrrd: str
    :return:
    """
    print("start converting mask to nii...")
    nrrd_path = pre_nrrd

    mask_path = Path(case_output.mask_json_path)
    nii_path = Path(case_output.mask_nii_path)

    if nrrd_path is None:
        print("contrast_0.nrrd path is None")
        return
    elif mask_path is None:
        print("mask.json path is None")
        return
    elif nii_path is None:
        print("mask.nii.gz path is None")
        return

    temp_file = None
    try:
        # Check if pre_nrrd is a URL
        if nrrd_path.startswith("http://") or nrrd_path.startswith("https://"):
            print(f"Downloading NRRD from {nrrd_path}...")
            response = requests.get(nrrd_path, stream=True)
            response.raise_for_status()
            
            # Create a temporary file with .nrrd extension
            temp_fd, temp_path = tempfile.mkstemp(suffix=".nrrd")
            with os.fdopen(temp_fd, 'wb') as f:
                for chunk in response.iter_content(chunk_size=8192):
                    f.write(chunk)
            
            nrrd_path = temp_path
            temp_file = temp_path
            print(f"Downloaded to temporary file: {temp_file}")

        origin_nrrd_image = sitk.ReadImage(nrrd_path)
        headerKeys = origin_nrrd_image.GetMetaDataKeys()

        with open(mask_path) as user_file:
            file_contents = user_file.read()
            parsed_json_mask = json.loads(file_contents)
        parsed_json = parsed_json_mask["label1"]
        parsed_json_2 = parsed_json_mask["label2"]
        parsed_json_3 = parsed_json_mask["label3"]
        for file_index in range(3):
            # Save the image as a NIfTI file
            if file_index == 0:
                convert_core(parsed_json, nii_path, headerKeys, origin_nrrd_image)
            # elif file_index == 1:
            #     convert_core(parsed_json_2, nii_path_2, headerKeys, origin_nrrd_image)
            # elif file_index == 2:
            #     convert_core(parsed_json_3, nii_path_3, headerKeys, origin_nrrd_image)
    
    finally:
        # Clean up temporary file if it was created
        if temp_file and os.path.exists(temp_file):
            try:
                os.remove(temp_file)
                print(f"Removed temporary file: {temp_file}")
            except OSError as e:
                print(f"Error removing temporary file {temp_file}: {e}")


def convert_core(parsed_json, nii_path, headerKeys, origin_nrrd_image):
    images = []
    width = parsed_json[0]["width"]
    height = parsed_json[0]["height"]
    depth = len(parsed_json)
    for i in range(len(parsed_json)):
        data = parsed_json[i]["data"]
        if len(data) == 0:
            data = [0] * width * height * 4
        images.append(data)
    try:
        pixels = np.array(images, dtype=np.uint8).reshape((depth, height, width, 4))
        # Take the average of the RGB values and use the Alpha value as the transparency
        merged_pixels = np.mean(pixels[:, :, :, :3], axis=3)
        # print(np.amax(merged_pixels))
        merged_pixels[merged_pixels > 50] = 255

        print(merged_pixels.shape)

        nii_image = sitk.GetImageFromArray(merged_pixels)
        for key in headerKeys:
            nii_image.SetMetaData(key, origin_nrrd_image.GetMetaData(key))
        spacing = parsed_json[0]["voxelSpacing"]
        origin = parsed_json[0]["spaceOrigin"]
        nii_image.SetSpacing(spacing)
        nii_image.SetOrigin(origin)

        sitk.WriteImage(nii_image, nii_path)
        img = nib.load(nii_path)
        img.affine[0:3, -1] = origin
        nib.save(img, nii_path)
        print("convert successfully!")
    except Exception as e:
        print("An error occurred: ", e)
        import traceback
        print(traceback.format_exc())


def convert_to_obj(patient_id):
    """
    convert nii file to obj file
    :param patient_id:
    :return:
    """
    source = get_file_path(patient_id, "nii.gz", "mask.nii.gz")
    dest = get_file_path(patient_id, "obj", "mask.obj")

    img = nib.load(source)
    spacing = img.header.get_zooms()
    arr = img.get_fdata()
    try:
        verts, faces, normals, values = marching_cubes(arr)
        # voxel grid coordinates to world coordinates: verts * voxel_size + origin
        verts = verts * spacing + img.affine[0:3, -1]
        # without spacing
        # verts = verts + img.affine[0:3, -1]

        faces = faces + 1

        for idx, normal in enumerate(normals):
            normal = [-n for n in normal]
            normals[idx] = normal

        with open(dest, 'w') as out_file:
            for item in verts:
                out_file.write("v {0} {1} {2}\n".format(item[0], item[1], item[2]))
            for item in normals:
                out_file.write("vn {0} {1} {2}\n".format(item[0], item[1], item[2]))
            for item in faces:
                out_file.write("f {0}//{0} {1}//{1} {2}//{2}\n".format(item[0], item[1], item[2]))
        out_file.close()
    except RuntimeError as e:
        try:
            dest.unlink()
            print(f"{dest.name} file delete successfully!")
        except OSError as e:
            print(f"fail to delete file!")


def convert_to_nii_sigel_channel(patient_id):
    nii_image = convert_json_data(patient_id)
    nii_path = get_file_path(patient_id, "nii.gz", "mask.nii.gz")
    # Save the image as a NIfTI file
    sitk.WriteImage(nii_image, nii_path)
    print("convert successfully!")


def convert_to_nrrd_sigel_channel(patient_id):
    nrrd_image = convert_json_data(patient_id)
    nrrd_path = get_file_path(patient_id, "nrrd", "mask.nrrd")
    # Save the image as a NRRD file
    sitk.WriteImage(nrrd_image, nrrd_path)
    print("convert successfully!")


def convert_json_data(patient_id):
    print("start converting...")

    nrrd_path = get_file_path(patient_id, "nrrd", "contrast_0.nrrd")
    mask_path = get_file_path(patient_id, "json", "mask.json")

    nrrd_image = sitk.ReadImage(nrrd_path)
    headerKeys = nrrd_image.GetMetaDataKeys()

    with open(mask_path) as user_file:
        file_contents = user_file.read()
        parsed_json_mask = json.loads(file_contents)
    images = []
    parsed_json = parsed_json_mask["label1"]
    width = parsed_json[0]["width"]
    height = parsed_json[0]["height"]
    depth = len(parsed_json)
    for i in range(len(parsed_json)):
        data = parsed_json[i]["data"]
        if len(data) == 0:
            data = [0] * width * height * 4
        images.append(data)

    try:
        pixels = np.array(images, dtype=np.uint8).reshape((depth, height, width, 4))

        # Take the average of the RGB values and use the Alpha value as the transparency
        # merged_pixels = np.mean(pixels[:, :, :, :3], axis=3)
        merged_pixels = pixels[:, :, :, 0] + pixels[:, :, :, 1] + pixels[:, :, :, 2] + pixels[:, :, :, 3]
        merged_pixels[merged_pixels > 0] = 255

        new_image = sitk.GetImageFromArray(merged_pixels)

        new_image.CopyInformation(nrrd_image)
        spacing = parsed_json[0]["voxelSpacing"]
        origin = parsed_json[0]["spaceOrigin"]
        new_image.SetSpacing(spacing)
        new_image.SetOrigin(origin)
        #
        # for key in headerKeys:
        #     new_image.SetMetaData(key, nrrd_image.GetMetaData(key))

        return new_image

    except Exception as e:
        print("An error occurred: ", e)
        import traceback
        print(traceback.format_exc())


def convert_to_nii_full_channels(patient_id):
    print("start converting...")
    mask_path = get_file_path(patient_id, "json", "mask.json")

    with open(mask_path) as user_file:
        file_contents = user_file.read()
        parsed_json = json.loads(file_contents)
    images = []
    width = parsed_json[0]["width"]
    height = parsed_json[0]["height"]
    for i in range(len(parsed_json)):
        data = parsed_json[i]["data"]
        if len(data) == 0:
            data = [0] * width * height * 4
        images.append(data)

    spacing = parsed_json[0]["voxelSpacing"]
    origin = parsed_json[0]["spaceOrigin"]
    try:
        rgba_pixels = np.array(images, dtype=np.uint8)  # Convert pixel data to a numpy array of uint8 type
        rgba_pixels = rgba_pixels.reshape((-1, 4))  # Reshape the pixel data to have 4 columns

        rgb_pixels = rgba_pixels[:, :-1]

        rgb_image = np.array(rgb_pixels, dtype=np.float32).reshape((len(parsed_json), height, width, 3))

        # Convert the RGB image to a grayscale image
        red_channel = sitk.VectorIndexSelectionCast(sitk.GetImageFromArray(rgb_image), 0)
        green_channel = sitk.VectorIndexSelectionCast(sitk.GetImageFromArray(rgb_image), 1)
        blue_channel = sitk.VectorIndexSelectionCast(sitk.GetImageFromArray(rgb_image), 2)
        nii = sitk.Compose(red_channel, green_channel, blue_channel)

        nii.SetSpacing(spacing)
        nii.SetOrigin(origin)

        nii_path = get_file_path(patient_id, "nii.gz", "mask.nii.gz")
        # Save the image as a NIfTI file
        sitk.WriteImage(nii, nii_path)
        print("convert successfully!")

    except Exception as e:
        print("An error occurred: ", e)
        import traceback
        print(traceback.format_exc())
