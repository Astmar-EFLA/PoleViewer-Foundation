"""
Registers an orthophoto (a JPEG plus its ESRI world file, .jgw) for draping
onto the terrain TIN. A world file gives only the affine pixel<->coordinate
transform -- six numbers, no CRS -- so it carries no information about
*which* coordinate system it's in; this always assumes it matches the
project's CRS and says so via a warning (never a silent assumption, same
principle as the LAS missing-CRS handling in las_inspect.py).
"""

from __future__ import annotations

from pathlib import Path

from PIL import Image

from app.schemas.orthophoto import OrthophotoRegisterResult, OrthophotoWorldFile
from app.schemas.pointcloud import ProcessingWarning


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


def register_orthophoto(image_path: Path, world_file_path: Path, image_url: str) -> OrthophotoRegisterResult:
    if not world_file_path.is_file():
        raise OrthophotoImportError(f"World file not found: {world_file_path.name} (expected beside the image).")

    try:
        with Image.open(image_path) as img:
            width_px, height_px = img.size
    except Exception as exc:  # Pillow raises a range of exceptions for unreadable/corrupt images
        raise OrthophotoImportError(f"Could not read '{image_path.name}' as an image: {exc}") from exc

    world_file = parse_world_file(world_file_path.read_text(encoding="utf-8", errors="replace"))

    warnings = [
        ProcessingWarning(
            code="orthophoto.assumed-crs-matches-project",
            severity="warning",
            message=(
                "A world file (.jgw) carries no coordinate reference system -- the orthophoto is assumed to "
                "already be in the project's CRS. Verify this against its known source/survey before relying "
                "on its position."
            ),
        )
    ]

    return OrthophotoRegisterResult(
        image_url=image_url,
        image_width_px=width_px,
        image_height_px=height_px,
        world_file=world_file,
        warnings=warnings,
    )
