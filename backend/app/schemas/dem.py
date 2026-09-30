"""
Request/response schemas for the DEM (GeoTIFF elevation raster) endpoints --
the raster counterpart of schemas/pointcloud.py. A DEM clip deliberately
returns the same ClipResult as a point-cloud clip, so the frontend builds
terrain from either the same way.
"""

from __future__ import annotations

from typing import Literal

from app.domain.coordinates import CoordinateReferenceSystem, LocalFrameDefinition
from app.schemas.camel_model import CamelModel
from app.schemas.pointcloud import ProcessingWarning, RectangularClipBoundary

HeightReference = Literal["orthometric", "ellipsoidal"]


class DemInspectRequest(CamelModel):
    file_path: str


class DemExtent(CamelModel):
    """In the DEM's own CRS."""

    min_easting: float
    max_easting: float
    min_northing: float
    max_northing: float


class DemMetadata(CamelModel):
    file_path: str
    width_px: int
    height_px: int
    pixel_size_x_m: float
    pixel_size_y_m: float
    extent: DemExtent
    crs: CoordinateReferenceSystem
    nodata_value: float | None
    #: Name of a vertical CRS recorded in the file (e.g. a compound CRS), if any -- informational.
    vertical_crs_name: str | None
    warnings: list[ProcessingWarning]


class DemClipRequest(CamelModel):
    file_path: str
    project_crs: CoordinateReferenceSystem
    local_frame: LocalFrameDefinition
    boundary: RectangularClipBoundary = RectangularClipBoundary()
    #: What the raster's values are: height above sea level, or height above the ellipsoid (e.g. ArcticDEM).
    height_reference: HeightReference = "orthometric"
    #: Geoid height N at the site, m -- subtracted from ellipsoidal heights (H = h - N). Required for "ellipsoidal".
    geoid_height_m: float | None = None
