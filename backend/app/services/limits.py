"""
Processing guards (Phase 9: "processing guards"). This backend has no
queueing or worker isolation -- every request runs the PDAL pipeline
synchronously on the request thread -- so the only practical defence
against a very large or unbounded file/result is to reject it explicitly,
before PDAL touches the file or before a huge response is serialised,
rather than let the process hang or exhaust memory mid-request. Limits are
configurable (env vars) rather than hard-coded, since "how big is too big"
depends on the operator's machine, not this codebase.
"""

from __future__ import annotations

import os
from pathlib import Path


class ProcessingLimitError(ValueError):
    """Raised when a file or request exceeds a configured processing guard."""


def _env_int(name: str, default: int) -> int:
    raw = os.environ.get(name)
    if not raw:
        return default
    try:
        value = int(raw)
    except ValueError:
        return default
    return value if value > 0 else default


def max_file_size_bytes() -> int:
    return _env_int("POLE_VIEWER_MAX_FILE_SIZE_MB", 500) * 1024 * 1024


def max_returned_point_count() -> int:
    return _env_int("POLE_VIEWER_MAX_RETURNED_POINTS", 2_000_000)


def max_orthophoto_texture_dimension_px() -> int:
    """
    WebGL enforces a hard per-texture size limit (commonly 4096-16384px,
    lower on older/integrated GPUs) -- a real orthophoto's *source* file is
    routinely far larger than any of those. 4096 is the conservative,
    broadly-supported default; see app/processing/orthophoto_import.py's
    render_display_jpeg, which the served (not the source) image is
    downscaled to fit.
    """
    return _env_int("POLE_VIEWER_MAX_ORTHOPHOTO_TEXTURE_PX", 4096)


def check_file_size(path: Path) -> None:
    size = path.stat().st_size
    limit = max_file_size_bytes()
    if size > limit:
        raise ProcessingLimitError(
            f'"{path.name}" is {size / (1024 * 1024):.1f} MB, over the configured processing '
            f"limit of {limit / (1024 * 1024):.0f} MB (POLE_VIEWER_MAX_FILE_SIZE_MB)."
        )


def _check_extension(path: Path, allowed: set[str], kind: str) -> None:
    if path.suffix.lower() not in allowed:
        raise ProcessingLimitError(
            f'"{path.name}" does not have a recognised {kind} extension '
            f"({', '.join(sorted(allowed))})."
        )


ALLOWED_POINT_CLOUD_EXTENSIONS = {".las", ".laz"}


def check_point_cloud_extension(path: Path) -> None:
    _check_extension(path, ALLOWED_POINT_CLOUD_EXTENSIONS, "point-cloud")


ALLOWED_POLE_MODEL_EXTENSIONS = {".pol"}


def check_pole_model_extension(path: Path) -> None:
    _check_extension(path, ALLOWED_POLE_MODEL_EXTENSIONS, "pole-model")


ALLOWED_LINE_CENTRELINE_EXTENSIONS = {".zip"}


def check_line_centreline_extension(path: Path) -> None:
    _check_extension(path, ALLOWED_LINE_CENTRELINE_EXTENSIONS, "line-centreline")


ALLOWED_ORTHOPHOTO_IMAGE_EXTENSIONS = {".jpg", ".jpeg"}


def check_orthophoto_image_extension(path: Path) -> None:
    _check_extension(path, ALLOWED_ORTHOPHOTO_IMAGE_EXTENSIONS, "orthophoto-image")


ALLOWED_ORTHOPHOTO_WORLD_FILE_EXTENSIONS = {".jgw"}


def check_orthophoto_world_file_extension(path: Path) -> None:
    _check_extension(path, ALLOWED_ORTHOPHOTO_WORLD_FILE_EXTENSIONS, "orthophoto-world-file")


def max_world_imagery_extent_m() -> float:
    """
    Bounds a single world-imagery fetch's request area -- without this, an
    arbitrarily large width/height would fetch (and this backend would then
    have to hold in memory) an unbounded number of tiles. 3000m is generous
    for a single mast/tower's surroundings while still bounding the request.
    """
    return float(_env_int("POLE_VIEWER_MAX_WORLD_IMAGERY_EXTENT_M", 3000))


MIN_WORLD_IMAGERY_EXTENT_M = 10.0
MIN_WORLD_IMAGERY_ZOOM = 10
MAX_WORLD_IMAGERY_ZOOM = 20


def check_world_imagery_request(width_m: float, height_m: float, zoom: int) -> None:
    limit = max_world_imagery_extent_m()
    for label, value in (("width", width_m), ("height", height_m)):
        if not (MIN_WORLD_IMAGERY_EXTENT_M <= value <= limit):
            raise ProcessingLimitError(
                f"{label} must be between {MIN_WORLD_IMAGERY_EXTENT_M:.0f}m and {limit:.0f}m "
                f"(POLE_VIEWER_MAX_WORLD_IMAGERY_EXTENT_M), got {value}m."
            )
    if not (MIN_WORLD_IMAGERY_ZOOM <= zoom <= MAX_WORLD_IMAGERY_ZOOM):
        raise ProcessingLimitError(
            f"zoom must be between {MIN_WORLD_IMAGERY_ZOOM} and {MAX_WORLD_IMAGERY_ZOOM}, got {zoom}."
        )
