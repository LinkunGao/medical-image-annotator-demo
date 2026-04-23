from pathlib import Path
from dotenv import load_dotenv
import os
import sys


def is_running_in_docker() -> bool:
    """Detect if the application is running inside a Docker container."""
    if Path("/.dockerenv").exists():
        return True
    if os.environ.get("RUNNING_IN_DOCKER", "").lower() in ("true", "1", "yes"):
        return True
    try:
        with open("/proc/1/cgroup", "r") as f:
            return "docker" in f.read()
    except (FileNotFoundError, PermissionError):
        pass
    return False


class Config:
    METADATA_PATH = "manifest.xlsx"
    SAMPLES_METADATA_PATH = "samples.xlsx"
    SUBJECTS_METADATA_PATH = "subjects.xlsx"
    INPUTS = ["contrast_pre", "contrast_1", "contrast_2", "contrast_3", "contrast_4", "registration_pre",
              "registration_1", "registration_2", "registration_3", "registration_4"]
    OUTPUTS = ["mask_meta_json", "mask_layer1_nii", "mask_layer2_nii", "mask_layer3_nii", "mask_layer4_nii", "mask_obj",
               "mask_glb"]

    # MinIO SDK credentials (for private bucket access)
    # Local dev default: minioadmin/minioadmin @ localhost:9000 (MinIO native port)
    # Docker: injected via docker-compose environment from MINIO_SERVER_ACCESS_KEY/SECRET_KEY
    MINIO_ENDPOINT = os.environ.get("MINIO_ENDPOINT", "localhost:9000")
    MINIO_ACCESS_KEY = os.environ.get("MINIO_ACCESS_KEY", "minioadmin")
    MINIO_SECRET_KEY = os.environ.get("MINIO_SECRET_KEY", "minioadmin")
    MINIO_SECURE = os.environ.get("MINIO_SECURE", "false").lower() in ("true", "1")


class TumourData:
    volume: 0
    extent: 0
    skin: 0
    ribcage: 0
    nipple: 0
