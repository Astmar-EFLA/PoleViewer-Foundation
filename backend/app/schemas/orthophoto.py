"""
Request/response schemas for orthophoto registration
(app/processing/orthophoto_import.py, POST /orthophoto/register) and for
fetching a world-imagery-backed one (app/processing/world_imagery.py,
POST /orthophoto/world-imagery).
"""

from __future__ import annotations

from app.domain.coordinates import CoordinateReferenceSystem
from app.schemas.camel_model import CamelModel
from app.schemas.pointcloud import ProcessingWarning


class OrthophotoRegisterRequest(CamelModel):
    image_path: str
    # If omitted, the world file is looked for beside the image with the
    # same basename and a .jgw extension (the standard JPEG-world-file
    # convention) -- an explicit path is only needed when that convention
    # doesn't hold (e.g. mismatched names after a browser upload).
    world_file_path: str | None = None


class WorldImageryRequest(CamelModel):
    centre_easting: float
    centre_northing: float
    project_crs: CoordinateReferenceSystem
    width_m: float = 400.0
    height_m: float = 400.0
    zoom: int = 18


class OrthophotoWorldFile(CamelModel):
    """
    The six raw affine coefficients from the .jgw, in file order -- returned
    as-is (not reduced to a bounding box) so the frontend can compute an
    exact per-vertex UV via the inverse transform, correct even for a
    rotated/skewed world file, not just the common axis-aligned case.
    """

    pixel_size_x: float
    rotation_y: float
    rotation_x: float
    pixel_size_y: float
    upper_left_x: float
    upper_left_y: float


class OrthophotoRegisterResult(CamelModel):
    image_url: str
    image_width_px: int
    image_height_px: int
    world_file: OrthophotoWorldFile
    warnings: list[ProcessingWarning]
