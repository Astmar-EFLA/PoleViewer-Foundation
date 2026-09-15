"""
Point-cloud clipping via PDAL: filters.crop for the spatial boundary
(built from the request's local-frame rectangle -- see
geometry/clip_boundary.py), filters.expression for classification
selection, then a plain array slice for decimation (applied after crop and
classification, on the already-small clipped result, rather than as a
third PDAL stage -- avoids a second full-file pass for what is just a
stride on data already in memory). All verified against the actual PDAL
2.10 API and the synthetic fixtures, not assumed from documentation --
see scripts/generate_synthetic_las_fixtures.py.
"""

from __future__ import annotations

import time
from pathlib import Path

import numpy as np
import pdal

from app.geometry.clip_boundary import rectangular_clip_polygon_wkt
from app.geometry.coordinate_transform import project_to_local_array
from app.processing.las_inspect import inspect_las
from app.schemas.pointcloud import (
    ClassificationCount,
    ClipProcessingMetadata,
    ClipRequest,
    ClipResult,
    ClipResultPoint,
    ProcessingWarning,
)
from app.services.limits import max_returned_point_count
from app.validation.pointcloud_validation import crs_consistency_warnings


class ClipBlockedError(RuntimeError):
    """Raised when a blocking validation warning prevents clipping (principle: never continue with a blocking coordinate/CRS inconsistency)."""

    def __init__(self, warnings: list[ProcessingWarning]):
        self.warnings = warnings
        super().__init__("Clip request blocked: " + "; ".join(w.message for w in warnings if w.severity == "blocking"))


def clip_las(file_path: Path, request: ClipRequest) -> ClipResult:
    start = time.perf_counter()

    metadata = inspect_las(file_path)
    warnings: list[ProcessingWarning] = list(metadata.warnings)
    warnings.extend(crs_consistency_warnings(metadata.crs, request.project_crs))

    blocking = [w for w in warnings if w.severity == "blocking"]
    if blocking:
        raise ClipBlockedError(warnings)

    boundary = request.boundary
    wkt = rectangular_clip_polygon_wkt(
        boundary.center_offset_local.x,
        boundary.center_offset_local.y,
        boundary.width_m,
        boundary.length_m,
        boundary.rotation_radians,
        request.local_frame,
    )

    pipeline = pdal.Reader.las(filename=str(file_path)) | pdal.Filter.crop(polygon=wkt)
    if request.classification_filter:
        expression = " || ".join(f"Classification == {code}" for code in request.classification_filter)
        pipeline = pipeline | pdal.Filter.expression(expression=expression)

    clipped_count = pipeline.execute()
    arr = pipeline.arrays[0] if clipped_count > 0 else None

    if clipped_count == 0:
        warnings.append(
            ProcessingWarning(
                code="pointcloud.clip-empty",
                severity="warning",
                message=(
                    "The clip boundary and classification filter matched no "
                    "points. Check the mast centre, clip extent, and requested "
                    "classifications against the file's coverage."
                ),
            )
        )

    classification_counts: list[ClassificationCount] = []
    if arr is not None and "Classification" in (arr.dtype.names or ()):
        unique, counts = np.unique(arr["Classification"], return_counts=True)
        classification_counts = [
            ClassificationCount(classification_code=int(c), point_count=int(n))
            for c, n in zip(unique.tolist(), counts.tolist())
        ]

    step = request.decimation_step or 1
    if step > 1 and arr is not None:
        arr = arr[::step]

    result_count = 0 if arr is None else int(arr.size)
    limit = max_returned_point_count()
    if result_count > limit:
        raise ClipBlockedError(
            [
                ProcessingWarning(
                    code="pointcloud.result-too-large",
                    severity="blocking",
                    message=(
                        f"This clip would return {result_count:,} points, over the configured limit of "
                        f"{limit:,} (POLE_VIEWER_MAX_RETURNED_POINTS). Reduce the clip boundary or increase "
                        "the decimation step -- points are never silently dropped to fit under the limit."
                    ),
                )
            ]
        )

    points: list[ClipResultPoint] = []
    if arr is not None and arr.size > 0:
        local_x, local_y, local_z = project_to_local_array(
            arr["X"].astype(np.float64), arr["Y"].astype(np.float64), arr["Z"].astype(np.float64), request.local_frame
        )
        classifications = arr["Classification"].tolist()
        points = [
            ClipResultPoint(x=float(x), y=float(y), z=float(z), classification=int(c))
            for x, y, z, c in zip(local_x.tolist(), local_y.tolist(), local_z.tolist(), classifications)
        ]

    duration_ms = (time.perf_counter() - start) * 1000

    return ClipResult(
        points=points,
        source_point_count=metadata.point_count,
        clipped_point_count=clipped_count,
        returned_point_count=len(points),
        classification_counts=classification_counts,
        warnings=warnings,
        processing_metadata=ClipProcessingMetadata(
            file_path=str(file_path.name),
            boundary=boundary,
            classification_filter=request.classification_filter,
            decimation_step=request.decimation_step,
            duration_ms=duration_ms,
        ),
    )
