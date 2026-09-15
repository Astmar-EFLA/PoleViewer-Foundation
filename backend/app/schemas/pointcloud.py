"""
Request/response schemas for the point-cloud endpoints. All camelCase on
the wire (CamelModel), matching the frontend's TS domain naming.
"""

from __future__ import annotations

from typing import Literal

from app.domain.coordinates import CoordinateReferenceSystem, LocalFrameDefinition
from app.schemas.camel_model import CamelModel


class ProcessingWarning(CamelModel):
    code: str
    severity: Literal["information", "warning", "blocking"]
    message: str


# --- /pointcloud/inspect -----------------------------------------------


class InspectRequest(CamelModel):
    file_path: str


class BoundsProject(CamelModel):
    min_easting: float
    max_easting: float
    min_northing: float
    max_northing: float
    min_elevation: float
    max_elevation: float


class ClassificationCount(CamelModel):
    classification_code: int
    point_count: int


class PointCloudMetadata(CamelModel):
    file_path: str
    point_count: int
    bounds_project: BoundsProject
    scale: tuple[float, float, float]
    offset: tuple[float, float, float]
    available_dimensions: list[str]
    crs: CoordinateReferenceSystem
    classification_counts: list[ClassificationCount]
    has_rgb: bool
    has_return_information: bool
    warnings: list[ProcessingWarning]


# --- /pointcloud/clip ----------------------------------------------------


class LocalOffsetXY(CamelModel):
    x: float = 0.0
    y: float = 0.0


class RectangularClipBoundary(CamelModel):
    """
    Default: 40x40 m, centred on the mast (local 0,0), aligned with the
    project's local axes (rotationRadians=0 means "aligned with the line
    bearing", since local axes are already bearing-aligned -- see
    docs/architecture/coordinate-strategy.md). A nonzero rotationRadians
    adds an *additional* rotation on top of that, for a clip extent that
    deliberately isn't bearing-aligned.
    """

    shape: Literal["rectangular"] = "rectangular"
    width_m: float = 40.0
    length_m: float = 40.0
    center_offset_local: LocalOffsetXY = LocalOffsetXY()
    rotation_radians: float = 0.0


class ClipRequest(CamelModel):
    file_path: str
    project_crs: CoordinateReferenceSystem
    local_frame: LocalFrameDefinition
    boundary: RectangularClipBoundary = RectangularClipBoundary()
    classification_filter: list[int] | None = None
    decimation_step: int | None = None


class ClipResultPoint(CamelModel):
    x: float
    y: float
    z: float
    classification: int


class ClipProcessingMetadata(CamelModel):
    file_path: str
    boundary: RectangularClipBoundary
    classification_filter: list[int] | None
    decimation_step: int | None
    duration_ms: float


class ClipResult(CamelModel):
    points: list[ClipResultPoint]
    source_point_count: int
    clipped_point_count: int
    returned_point_count: int
    classification_counts: list[ClassificationCount]
    warnings: list[ProcessingWarning]
    processing_metadata: ClipProcessingMetadata
