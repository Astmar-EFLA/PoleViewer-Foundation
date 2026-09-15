"""
LAS/LAZ metadata inspection via PDAL. Bounds, point count, dimensions, scale
and offset, and CRS come from `pipeline.quickinfo`, which PDAL answers from
the file header without a full point read (verified empirically: ~0.08s
for a small file, and the header is all it touches) -- this is the
"metadata-first" half of the requirement. Per-classification point counts
require a full read (there is no header-level histogram), which is the one
part of this function that scales with file size; Phase 9 should revisit
this for very large files (e.g. sample instead of a full count, or make the
histogram an optional/paginated follow-up call).
"""

from __future__ import annotations

from pathlib import Path

import numpy as np
import pdal

from app.domain.coordinates import CoordinateReferenceSystem, CrsEpsg, CrsExplicit, CrsUnknown
from app.schemas.pointcloud import (
    BoundsProject,
    ClassificationCount,
    PointCloudMetadata,
    ProcessingWarning,
)
from app.services.limits import check_file_size, check_point_cloud_extension

RGB_DIMENSIONS = {"Red", "Green", "Blue"}
RETURN_INFO_DIMENSIONS = {"ReturnNumber", "NumberOfReturns"}
GROUND_CLASSIFICATION_CODE = 2


class LasReadError(RuntimeError):
    """Raised when PDAL cannot read the requested file at all."""


def _extract_crs(srs_json: dict, srs_wkt: str) -> CoordinateReferenceSystem:
    id_info = (srs_json or {}).get("id")
    if id_info and id_info.get("authority") == "EPSG":
        return CrsEpsg(epsg_code=int(id_info["code"]))
    if srs_wkt:
        return CrsExplicit(definition=srs_wkt)
    return CrsUnknown()


def inspect_las(file_path: Path) -> PointCloudMetadata:
    # Fail fast on an obviously-wrong or oversized file before PDAL ever
    # touches it (Phase 9 "file validation" / "processing guards") -- a
    # clear rejection here beats a cryptic PDAL RuntimeError, or a request
    # thread tied up reading a file too large for this synchronous,
    # single-request-at-a-time backend to process safely.
    check_point_cloud_extension(file_path)
    check_file_size(file_path)

    try:
        reader = pdal.Reader.las(filename=str(file_path))
        pipeline = reader.pipeline()
        qi = pipeline.quickinfo["readers.las"]
    except RuntimeError as exc:
        raise LasReadError(f"PDAL could not read {file_path.name}: {exc}") from exc

    bounds = qi["bounds"]
    dimensions = [d.strip() for d in qi["dimensions"].split(",")]
    md = qi["metadata"]
    srs_json = md.get("srs", {}).get("json", {})
    srs_wkt = md.get("comp_spatialreference", "")
    crs = _extract_crs(srs_json, srs_wkt)

    warnings: list[ProcessingWarning] = []
    if isinstance(crs, CrsUnknown):
        warnings.append(
            ProcessingWarning(
                code="pointcloud.missing-crs",
                severity="blocking",
                message=(
                    "The LAS/LAZ file has no coordinate reference system in its "
                    "header. Clipping and terrain generation cannot proceed until "
                    "a CRS is confirmed."
                ),
            )
        )

    classification_counts = _classification_histogram(reader)
    if classification_counts and not any(
        c.classification_code == GROUND_CLASSIFICATION_CODE for c in classification_counts
    ):
        warnings.append(
            ProcessingWarning(
                code="pointcloud.no-ground-classification",
                severity="warning",
                message=(
                    "No points are classified as ground (class 2). Terrain "
                    "generation will require a manual classification selection "
                    "or an algorithmic ground-filtering fallback."
                ),
            )
        )

    return PointCloudMetadata(
        file_path=str(file_path.name),
        point_count=qi["num_points"],
        bounds_project=BoundsProject(
            min_easting=bounds["minx"],
            max_easting=bounds["maxx"],
            min_northing=bounds["miny"],
            max_northing=bounds["maxy"],
            min_elevation=bounds["minz"],
            max_elevation=bounds["maxz"],
        ),
        scale=(md["scale_x"], md["scale_y"], md["scale_z"]),
        offset=(md["offset_x"], md["offset_y"], md["offset_z"]),
        available_dimensions=dimensions,
        crs=crs,
        classification_counts=classification_counts,
        has_rgb=RGB_DIMENSIONS.issubset(dimensions),
        has_return_information=RETURN_INFO_DIMENSIONS.issubset(dimensions),
        warnings=warnings,
    )


def _classification_histogram(reader: pdal.Reader) -> list[ClassificationCount]:
    pipeline = reader.pipeline()
    pipeline.execute()
    if pipeline.arrays[0].size == 0:
        return []
    arr = pipeline.arrays[0]
    if "Classification" not in (arr.dtype.names or ()):
        return []
    unique, counts = np.unique(arr["Classification"], return_counts=True)
    return [
        ClassificationCount(classification_code=int(code), point_count=int(count))
        for code, count in zip(unique.tolist(), counts.tolist())
    ]
