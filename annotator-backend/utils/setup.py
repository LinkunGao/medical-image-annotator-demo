from pathlib import Path
from dotenv import load_dotenv
from urllib.parse import urlparse, urlunparse
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


def is_running_in_docker() -> bool:
    """Detect if the application is running inside a Docker container."""
    # Check for /.dockerenv file (most reliable on Linux containers)
    if Path("/.dockerenv").exists():
        return True
    # Check environment variable (can be set explicitly in docker-compose)
    if os.environ.get("RUNNING_IN_DOCKER", "").lower() in ("true", "1", "yes"):
        return True
    # Check cgroup (Linux containers)
    try:
        with open("/proc/1/cgroup", "r") as f:
            return "docker" in f.read()
    except (FileNotFoundError, PermissionError):
        pass
    return False


def get_external_base_url() -> str | None:
    """
    Build the external base URL from environment variables when in Docker.

    Environment variables:
      - EXTERNAL_HOST: the externally accessible host/IP (e.g. "localhost", "132.51.24.215")
      - EXTERNAL_PORT: the externally exposed port (e.g. "8004", "8005")
      - EXTERNAL_SCHEME: "http" or "https" (auto-detected if not set:
                         defaults to "https" for non-localhost, "http" for localhost/127.x)

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
