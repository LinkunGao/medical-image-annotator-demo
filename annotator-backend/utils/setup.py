from pathlib import Path
from dotenv import load_dotenv
from urllib.parse import urlparse, urlunparse
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


def get_external_base_url() -> str | None:
    """
    Build the external base URL for MinIO when running in Docker.

    Environment variables (passed from main app via docker-compose):
      - EXTERNAL_HOST: from PORTAL_BACKEND_HOST_IP (e.g. "localhost", "132.51.24.215")
      - EXTERNAL_PORT: from MINIO_PORT (e.g. "8004")
      - EXTERNAL_SCHEME: "http" or "https" (auto-detected if not set)

    Returns None if not in Docker or if EXTERNAL_HOST is not configured.
    """
    if not is_running_in_docker():
        return None

    host = os.environ.get("EXTERNAL_HOST")
    if not host:
        return None

    port = os.environ.get("EXTERNAL_PORT", "")
    scheme = os.environ.get("EXTERNAL_SCHEME", "")

    # Auto-detect scheme if not explicitly set
    if not scheme:
        if host in ("localhost", "127.0.0.1", "0.0.0.0"):
            scheme = "http"
        else:
            scheme = "https"

    netloc = f"{host}:{port}" if port else host
    return f"{scheme}://{netloc}"


def rewrite_url_for_docker(url: str | None, external_base: str | None) -> str | None:
    """
    Rewrite a MinIO URL to use the external base URL when running in Docker.

    Replaces the scheme + host + port of the original URL with `external_base`,
    keeping the path (and query/fragment) intact.

    If external_base is None or url is None, returns the original url unchanged.
    """
    if not external_base or not url:
        return url

    parsed = urlparse(url)
    ext_parsed = urlparse(external_base)
    # Replace scheme and netloc, keep path and everything after
    rewritten = urlunparse((
        ext_parsed.scheme,
        ext_parsed.netloc,
        parsed.path,
        parsed.params,
        parsed.query,
        parsed.fragment
    ))
    return rewritten


class Config:
    METADATA_PATH = "manifest.xlsx"
    SAMPLES_METADATA_PATH = "samples.xlsx"
    SUBJECTS_METADATA_PATH = "subjects.xlsx"
    INPUTS = ["contrast-pre", "contrast-1", "contrast-2", "contrast-3", "contrast-4", "registration-pre",
              "registration-1", "registration-2", "registration-3", "registration-4"]
    OUTPUTS = ["mask-meta-json", "mask-layer1-nii", "mask-layer2-nii", "mask-layer3-nii", "mask-layer4-nii", "mask-obj",
               "mask-glb"]


class TumourData:
    volume: 0
    extent: 0
    skin: 0
    ribcage: 0
    nipple: 0
