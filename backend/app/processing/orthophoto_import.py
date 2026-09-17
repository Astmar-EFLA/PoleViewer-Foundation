"""
Registers an orthophoto (a JPEG plus its ESRI world file, .jgw) for draping
onto the terrain TIN. A world file gives only the affine pixel<->coordinate
transform -- six numbers, no CRS -- so it carries no information about
*which* coordinate system it's in; this always assumes it matches the
project's CRS and says so via a warning (never a silent assumption, same
principle as the LAS missing-CRS handling in las_inspect.py).
"""

from __future__ import annotations

import io
from pathlib import Path

from PIL import Image

from app.schemas.orthophoto import OrthophotoRegisterResult, OrthophotoWorldFile
from app.schemas.pointcloud import ProcessingWarning
from app.services.limits import max_orthophoto_texture_dimension_px

# Pillow's own decompression-bomb guard rejects opening any image over ~179
# megapixels, to stop a tiny, highly-compressed file from exhausting memory
# once decoded. That's real protection for code that decodes pixel data --
# this module never does (only .size, read from the header) -- and a real
# orthophoto covering a transmission line corridor legitimately exceeds that
# threshold. The actual guard against an oversized/malicious file here is
# services/limits.py's check_file_size (POLE_VIEWER_MAX_FILE_SIZE_MB),
# already enforced before this module ever opens the file (see
# api/orthophoto.py) -- so Pillow's separate pixel-count guard is disabled
# rather than raised to some arbitrary larger number.
Image.MAX_IMAGE_PIXELS = None


class OrthophotoImportError(RuntimeError):
    """Raised when the image or its world file can't be read as a registerable orthophoto."""


def parse_world_file(text: str) -> OrthophotoWorldFile:
    """
    A world file is exactly six lines, one float each, in this fixed order
    (the ESRI convention): pixel size X, rotation about Y, rotation about X,
    pixel size Y (negative), upper-left X, upper-left Y. Blank lines are
    tolerated (some tools pad the file); anything else -- wrong line count,
    non-numeric content -- is a real format error, not something to guess
    past.
    """
    lines = [line.strip() for line in text.splitlines() if line.strip()]
    if len(lines) != 6:
        raise OrthophotoImportError(
            f"World file must have exactly 6 non-blank lines (pixel size X, rotation Y, rotation X, "
            f"pixel size Y, upper-left X, upper-left Y); found {len(lines)}."
        )

    try:
        values = [float(line) for line in lines]
    except ValueError as exc:
        raise OrthophotoImportError(f"World file contains a non-numeric line: {exc}") from exc

    pixel_size_x, rotation_y, rotation_x, pixel_size_y, upper_left_x, upper_left_y = values

    determinant = pixel_size_x * pixel_size_y - rotation_x * rotation_y
    if abs(determinant) < 1e-12:
        raise OrthophotoImportError(
            "World file's affine transform is degenerate (zero determinant) -- cannot map pixels to coordinates."
        )

    return OrthophotoWorldFile(
        pixel_size_x=pixel_size_x,
        rotation_y=rotation_y,
        rotation_x=rotation_x,
        pixel_size_y=pixel_size_y,
        upper_left_x=upper_left_x,
        upper_left_y=upper_left_y,
    )


def serialize_world_file(world_file: OrthophotoWorldFile) -> str:
    """The inverse of parse_world_file -- used to write a real .jgw sidecar for a programmatically-built orthophoto (app/processing/world_imagery.py), so it's cached on disk exactly like a locally-supplied one, not a special case."""
    return (
        f"{world_file.pixel_size_x}\n"
        f"{world_file.rotation_y}\n"
        f"{world_file.rotation_x}\n"
        f"{world_file.pixel_size_y}\n"
        f"{world_file.upper_left_x}\n"
        f"{world_file.upper_left_y}\n"
    )


_DISPLAY_JPEG_QUALITY = 85


def render_display_jpeg(image_path: Path, max_dimension: int | None = None) -> bytes:
    """
    Re-encodes the source image, downscaled to fit within max_dimension on
    its longer side (Image.thumbnail: preserves aspect ratio, never
    upscales -- a source already smaller than the limit passes through at
    its own size). Served by GET /orthophoto/image instead of the raw file,
    since WebGL cannot load a texture anywhere near a real orthophoto's
    source resolution (see max_orthophoto_texture_dimension_px).

    The georeferencing math (geometry/orthophotoUv.ts) is unaffected: it
    maps world coordinates to normalised [0,1] UV fractions using the
    *source* image's dimensions and world file (see
    OrthophotoRegisterResult.image_width_px/image_height_px, always the
    source's own), and Three.js samples a texture by that same normalised
    UV regardless of the texture's actual stored resolution.
    """
    limit = max_dimension if max_dimension is not None else max_orthophoto_texture_dimension_px()
    try:
        with Image.open(image_path) as img:
            img = img.convert("RGB")
            img.thumbnail((limit, limit), Image.LANCZOS)
            buffer = io.BytesIO()
            img.save(buffer, format="JPEG", quality=_DISPLAY_JPEG_QUALITY)
            return buffer.getvalue()
    except OrthophotoImportError:
        raise
    except Exception as exc:  # Pillow raises a range of exceptions for unreadable/corrupt images
        raise OrthophotoImportError(f"Could not read '{image_path.name}' as an image: {exc}") from exc


def register_orthophoto(
    image_path: Path, world_file_path: Path, image_url: str, crs_already_verified: bool = False
) -> OrthophotoRegisterResult:
    """
    `crs_already_verified` is set by callers that themselves reprojected the
    image using the project's own declared CRS (world_imagery.py) -- there,
    unlike a locally-supplied world file, there genuinely is no CRS
    assumption being made, so the warning about one would be actively
    misleading, not just redundant.
    """
    if not world_file_path.is_file():
        raise OrthophotoImportError(f"World file not found: {world_file_path.name} (expected beside the image).")

    try:
        with Image.open(image_path) as img:
            width_px, height_px = img.size
    except Exception as exc:  # Pillow raises a range of exceptions for unreadable/corrupt images
        raise OrthophotoImportError(f"Could not read '{image_path.name}' as an image: {exc}") from exc

    world_file = parse_world_file(world_file_path.read_text(encoding="utf-8", errors="replace"))

    warnings: list[ProcessingWarning] = []
    if not crs_already_verified:
        warnings.append(
            ProcessingWarning(
                code="orthophoto.assumed-crs-matches-project",
                severity="warning",
                message=(
                    "A world file (.jgw) carries no coordinate reference system -- the orthophoto is assumed to "
                    "already be in the project's CRS. Verify this against its known source/survey before relying "
                    "on its position."
                ),
            )
        )

    limit = max_orthophoto_texture_dimension_px()
    if max(width_px, height_px) > limit:
        warnings.append(
            ProcessingWarning(
                code="orthophoto.downscaled-for-display",
                severity="information",
                message=(
                    f"Source image is {width_px}x{height_px}px, beyond the {limit}px WebGL texture limit -- the "
                    "displayed version is downscaled to fit. Positioning is unaffected (draped using the "
                    "source resolution's georeferencing), only visual sharpness."
                ),
            )
        )

    return OrthophotoRegisterResult(
        image_url=image_url,
        image_width_px=width_px,
        image_height_px=height_px,
        world_file=world_file,
        warnings=warnings,
    )
