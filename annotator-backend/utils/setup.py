from pathlib import Path
from dotenv import load_dotenv
import os
import sys


# def get_base_from_env():
#     env_path = Path('.') / '.env'
#     load_dotenv(dotenv_path=env_path)
#
#     if sys.platform.startswith('linux') or sys.platform.startswith('darwin'):
#         return os.environ["BASE"]
#     elif sys.platform.startswith('win'):
#         return os.environ["BASE_DUKE_locally"]
#         # return os.environ["BASE_locally"]
#     return os.environ["BASE"]


class Config:
    METADATA_PATH = "manifest.xlsx"
    SAMPLES_METADATA_PATH = "samples.xlsx"
    SUBJECTS_METADATA_PATH = "subjects.xlsx"
    INPUTS = ["contrast-pre", "contrast-1", "contrast-2", "contrast-3", "contrast-4", "registration-pre",
              "registration-1", "registration-2", "registration-3", "registration-4"]
    OUTPUTS = ["mask-meta-json", "mask-layer1-nii", "mask-layer2-nii", "mask-layer3-nii", "mask-obj", "mask-glb"]


class TumourData:
    volume: 0
    extent: 0
    skin: 0
    ribcage: 0
    nipple: 0
