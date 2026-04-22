import json
import pprint
import time
import pandas as pd
from .setup import Config
from pathlib import Path
from zipfile import ZipFile
from io import BytesIO
from models.db_model import User, Assay, Case, CaseInput, CaseOutput
import os
import numpy as np
import nibabel as nib


def get_metadata():
    """
    :return: df format metadata
    """
    metadata_path = Config.BASE_PATH / Config.METADATA_PATH
    if metadata_path.is_file() and metadata_path.suffix == ".xlsx":
        Config.METADATA = pd.read_excel(metadata_path, sheet_name="Sheet1")


def get_all_case_names(except_case: list = None):
    """
    :return: get each case name, the patient id for user to switch cases
    """
    if except_case is None:
        except_case = []
    if Config.METADATA is not None:
        case_names = list(set(Config.METADATA["Additional Metadata"]) - set(except_case))
        Config.CASE_NAMES = case_names
        return case_names
    return []


def check_file_exist(patient_id, filetype, filename):
    """
    :param patient_id: case name
    :param filename: mask.json mask.obj
    :return: if there is a mask.json file return true, else create a mask.json and return false
    """
    file_path = get_file_path(patient_id, filetype, filename)
    if file_path is not None:
        if filetype == "json":
            # Create the directory and all parent directories if they don't exist
            file_path.parent.mkdir(parents=True, exist_ok=True)
            if file_path.name != filename:
                new_file_path = file_path.parent / filename
                new_file_path.touch()
            else:
                if file_path.exists():
                    if file_path.stat().st_size != 0:
                        return True
                else:
                    return False
        else:
            return file_path.exists()
    return False


def get_file_path(patient_id, file_type, file_name):
    """
    :param patient_id: case name
    :param file_type: json, nrrd, nii
    :return: file full path via pathlib
    """
    if Config.METADATA is not None:
        file_df = Config.METADATA[
            (Config.METADATA["Additional Metadata"] == patient_id) & (Config.METADATA["file type"] == file_type)]
        # index = mask_json_df.index.tolist()
        # path = mask_json_df.loc[index[0], 'filename']
        paths = list(file_df['filename'])
        new_paths = []
        for path in paths:
            new_paths.append(Config.BASE_PATH / path)
        file_path_arr = [path for path in new_paths if path.name == file_name]
        if len(file_path_arr) > 0:
            file_path_full = file_path_arr[0]
            return file_path_full
    return None


def get_category_files(patient_id, file_type, categore, except_file_name=[]):
    """
        :param patient_id: case name
        :param file_type: json, nrrd, nii
        :return: file full path via pathlib
        """
    if Config.METADATA is not None:
        file_df = Config.METADATA[
            (Config.METADATA["Additional Metadata"] == patient_id) & (Config.METADATA["file type"] == file_type)]
        paths = list(file_df['filename'])
        new_paths = []
        for path in paths:
            file_path = Config.BASE_PATH / path
            if file_path.name not in except_file_name:
                new_paths.append(file_path)

        file_path_arr = [str(path).replace("\\", "/") for path in new_paths if
                         path.parent.name == categore and path.exists()]
        if len(file_path_arr) > 0:
            return file_path_arr
    return []


def save_sphere_points_to_json(patient_id, data):
    sphere_json_path = get_file_path(patient_id, "json", "sphere_points.json")
    if sphere_json_path is None:
        return False
    sphere_json_path = Path(sphere_json_path)
    if not sphere_json_path.parent.exists():
        sphere_json_path.mkdir(parents=True, exist_ok=True)

    with open(sphere_json_path, "w") as json_file:
        json.dump(data, json_file)
    return True


def selectNrrdPaths(patient_id, file_type, limit):
    """
    :param patient_id: name
    :param file_type: nrrd / nii / json
    :param limit: file parent folder name
    :return:
    """
    all_nrrd_paths = []
    nrrds_df = Config.METADATA[
        (Config.METADATA["file type"] == file_type) & (Config.METADATA["Additional Metadata"] == patient_id)]
    all_nrrd_paths.extend(list(nrrds_df["filename"]))
    selected_paths = []
    for file_path in all_nrrd_paths:
        if Path(file_path).parent.name == limit:
            selected_paths.append(file_path)
    return selected_paths


def getReturnedJsonFormat(path):
    """
    :param path:
    :return: returns BytesIO for response to frontend
    """
    with open(path, mode="rb") as file:
        file_contents = file.read()
    return BytesIO(file_contents)


def getJsonData(path):
    """
    get json core
    :param path:
    :return:
    """
    with open(path, 'rb') as file:
        # Load the JSON data from the file into a Python object
        return json.loads(file.read().decode('utf-8'))


def replace_data_to_json(case_output: CaseOutput, slice_json):
    """
    :param case_output: CaseOutput
    :param slice_json: a single slice mask pixels
    """
    json_path = Path(case_output.mask_json_path)
    index = slice_json.sliceId
    label = slice_json.label
    if json_path.exists():
        mask_json = getJsonData(json_path)
        mask_json[label][index]["data"] = slice_json.mask
        mask_json["hasData"] = True
        save_mask_data(case_output, mask_json)
    else:
        print("replace failed: mask json file does not exist")


def save_mask_data(case_output: CaseOutput, masks):
    """
    save mask.json to local drive
    """
    json_path = Path(case_output.mask_json_path)

    json_path.parent.mkdir(parents=True, exist_ok=True)

    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(masks, f, ensure_ascii=False)

    case_output.mask_json_size = json_path.stat().st_size


def init_tumour_position_json(path):
    tumour_position = {
        "nipple": {
            "position": None,
            "distance": "0",
            "start": "000000",
            "end": "000000",
            "duration": "000000"
        },
        "skin": {
            "position": None,
            "distance": "0",
            "start": "000000",
            "end": "000000",
            "duration": "000000"
        },
        "ribcage": {
            "position": None,
            "distance": "0",
            "start": "000000",
            "end": "000000",
            "duration": "000000"
        },
        "clock_face": {
            "face": "",
            "start": "000000",
            "end": "000000",
            "duration": "000000"
        },
        "start": "000000",
        "end": "000000",
        "total_duration": "000000",
        "spacing": None,
        "origin": None,
        "complete": False,
        "assisted": False
    }
    with open(path, 'w') as json_file:
        json.dump(tumour_position, json_file, indent=4)


def save_mask_meta_json(case_output: CaseOutput, dimensions, spacing, origin):
    """
    Save mask metadata (dimensions, spacing, origin) to JSON file
    and update the database size field.

    :param case_output: CaseOutput database model instance
    :param dimensions: List of [width, height, depth]
    :param spacing: List of [sx, sy, sz] voxel spacing
    :param origin: List of [ox, oy, oz] space origin
    """
    meta_json_path = Path(case_output.mask_meta_json_path)

    # Create parent directory if it doesn't exist
    meta_json_path.parent.mkdir(parents=True, exist_ok=True)

    # Prepare metadata
    metadata = {
        "dimensions": dimensions,
        "spacing": spacing,
        "origin": origin
    }

    # Write to JSON file
    with open(meta_json_path, "w", encoding="utf-8") as f:
        json.dump(metadata, f, ensure_ascii=False, indent=2)

    # Update database size field
    case_output.mask_meta_json_size = meta_json_path.stat().st_size


def create_nifti_file(file_path, dimensions, spacing, origin):
    """
    Create an empty NIfTI file with specified dimensions, spacing, and origin.
    Uses nibabel to ensure compatibility with nifti-reader-js.

    :param file_path: Path object or string path to the .nii or .nii.gz file
    :param dimensions: List of [width, height, depth]
    :param spacing: List of [sx, sy, sz] voxel spacing in mm
    :param origin: List of [ox, oy, oz] space origin in mm
    :return: File size in bytes
    """
    file_path = Path(file_path)

    # Create parent directory if it doesn't exist
    file_path.parent.mkdir(parents=True, exist_ok=True)

    # Create empty volume (all zeros, Uint8)
    width, height, depth = dimensions
    empty_data = np.zeros((width, height, depth), dtype=np.uint8)

    # Create affine matrix with RAI→LPS conversion.
    # NRRD uses RAI (Right-Anterior-Inferior) space [-172.9, -150.6, -60.3],
    # NIfTI uses LPS (Left-Posterior-Superior) [172.9, 150.6, -60.3].
    # The first two axes must be negated.
    affine = np.diag([-spacing[0], -spacing[1], spacing[2], 1.0])
    affine[:3, 3] = [-origin[0], -origin[1], origin[2]]

    # Create NIfTI-1 image (most compatible format)
    img = nib.Nifti1Image(empty_data, affine)

    # Explicitly set data type to uint8
    img.set_data_dtype(np.uint8)

    # Save to file (nibabel handles .nii.gz compression automatically)
    nib.save(img, str(file_path))

    # Return file size
    return file_path.stat().st_size


def write_nifti_file(file_path, data, spacing, origin):
    """
    Write data to a NIfTI file with specified spacing and origin metadata.
    Uses nibabel to ensure compatibility with nifti-reader-js.

    :param file_path: Path object or string path to the .nii or .nii.gz file
    :param data: numpy array of shape (width, height, depth)
    :param spacing: List of [sx, sy, sz] voxel spacing in mm
    :param origin: List of [ox, oy, oz] space origin in mm
    :return: File size in bytes
    """
    file_path = Path(file_path)

    # Create parent directory if it doesn't exist
    file_path.parent.mkdir(parents=True, exist_ok=True)

    # Create affine matrix with RAI→LPS conversion (NRRD→NIfTI).
    affine = np.diag([-spacing[0], -spacing[1], spacing[2], 1.0])
    affine[:3, 3] = [-origin[0], -origin[1], origin[2]]

    # Create NIfTI-1 image
    img = nib.Nifti1Image(data.astype(np.uint8), affine)

    # Explicitly set data type to uint8
    img.set_data_dtype(np.uint8)

    # Save to file
    nib.save(img, str(file_path))

    # Return file size
    return file_path.stat().st_size


def read_nifti_file(file_path):
    """
    Read a NIfTI file and return the data array and metadata.
    Uses nibabel to ensure compatibility with nifti-reader-js.

    :param file_path: Path object or string path to the .nii or .nii.gz file
    :return: Dictionary with 'data', 'spacing', 'origin', 'dimensions'
    """
    file_path = Path(file_path)

    if not file_path.exists():
        raise FileNotFoundError(f"NIfTI file not found: {file_path}")

    # Read the image
    img = nib.load(str(file_path))

    # Get data array
    data = img.get_fdata().astype(np.uint8)

    # Get affine matrix
    affine = img.affine

    # Extract spacing from diagonal of affine matrix
    spacing = [abs(affine[0, 0]), abs(affine[1, 1]), abs(affine[2, 2])]

    # Extract origin from last column of affine matrix
    origin = [affine[0, 3], affine[1, 3], affine[2, 3]]

    # Get dimensions
    dimensions = list(data.shape)

    return {
        "data": data,
        "spacing": spacing,
        "origin": origin,
        "dimensions": dimensions
    }


def update_nifti_slice(file_path, slice_data, slice_index, axis, width, height):
    """
    Update a specific slice in a NIfTI file.

    :param file_path: Path object or string path to the .nii or .nii.gz file
    :param slice_data: List of uint8 values (flattened 2D array from frontend)
    :param slice_index: Index of the slice to update
    :param axis: 'x', 'y', 'z' or 'sagittal', 'coronal', 'axial'
    :param width: Width of the slice
    :param height: Height of the slice
    :return: File size in bytes
    """
    file_path = Path(file_path)
    if not file_path.exists():
        raise FileNotFoundError(f"NIfTI file not found: {file_path}")

    # Read the existing NIfTI file
    img = nib.load(str(file_path))
    data = img.get_fdata().astype(np.uint8)
    affine = img.affine

    # Convert flattened slice_data to 2D array
    slice_array = np.array(slice_data, dtype=np.uint8).reshape(height, width)

    # Map axis name to dimension index
    # Axis mapping: 'x'/'sagittal' = 0, 'y'/'coronal' = 1, 'z'/'axial' = 2
    axis_map = {
        'x': 0, 'sagittal': 0,
        'y': 1, 'coronal': 1,
        'z': 2, 'axial': 2
    }

    axis_index = axis_map.get(axis.lower())
    if axis_index is None:
        raise ValueError(f"Invalid axis: {axis}. Must be 'x', 'y', 'z', 'sagittal', 'coronal', or 'axial'")

    # Validate slice_index
    if slice_index < 0 or slice_index >= data.shape[axis_index]:
        raise ValueError(f"Slice index {slice_index} out of range for axis {axis} (max: {data.shape[axis_index]-1})")

    # Update the slice based on axis
    # Note: slice_array is in (height, width) format from frontend
    # Need to transpose to match NIfTI data orientation
    if axis_index == 0:  # Sagittal (YZ plane)
        # data[slice_index, :, :] shape should be (height, depth)
        data[slice_index, :, :] = slice_array
    elif axis_index == 1:  # Coronal (XZ plane)
        # data[:, slice_index, :] shape should be (width, depth)
        data[:, slice_index, :] = slice_array.T
    else:  # axis_index == 2, Axial (XY plane)
        # data[:, :, slice_index] shape should be (width, height)
        data[:, :, slice_index] = slice_array.T

    # Create new NIfTI image with updated data
    new_img = nib.Nifti1Image(data, affine)
    new_img.set_data_dtype(np.uint8)

    # Save the updated file
    nib.save(new_img, str(file_path))

    # Return updated file size
    return file_path.stat().st_size

