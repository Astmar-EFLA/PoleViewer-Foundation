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

# Operator instruction: real survey files handed to this app sometimes carry
# no CRS/classification metadata at all (exports from some scan/photogrammetry
# pipelines drop both). Rather than block on that, assume the values below --
# always as an explicit, reported assumption (never silently), so an engineer
# still sees and can correct it, matching this app's general provenance
# convention (ADR-010/ADR-012: assumed/calculated values are always tagged
# and warned about, never indistinguishable from a real imported/declared one).
ASSUMED_CRS_EPSG_CODE = 3057


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
        crs = CrsEpsg(epsg_code=ASSUMED_CRS_EPSG_CODE)
        warnings.append(
            ProcessingWarning(
                code="pointcloud.assumed-crs",
                severity="warning",
                message=(
                    "The LAS/LAZ file has no coordinate reference system in its "
                    f"header -- assumed EPSG:{ASSUMED_CRS_EPSG_CODE} (ISN93). Verify this "
                    "matches the file's actual survey CRS before relying on the clipped result."
                ),
            )
        )

    histogram = _classification_histogram(reader)
    if histogram is None:
        # No Classification dimension at all (distinct from one that's present
        # but empty/all-zero) -- assume every point is ground, same reasoning
        # as the CRS assumption above: explicit and reported, not silent.
        num_points = qi["num_points"]
        classification_counts = (
            [ClassificationCount(classification_code=GROUND_CLASSIFICATION_CODE, point_count=num_points)]
            if num_points > 0
            else []
        )
        if num_points > 0:
            warnings.append(
                ProcessingWarning(
                    code="pointcloud.assumed-ground-classification",
                    severity="warning",
                    message=(
                        "The LAS/LAZ file has no Classification dimension at all -- every "
                        "point was assumed to be ground (class 2). Verify this against the "
                        "file's actual source before relying on the clipped result."
                    ),
                )
            )
    else:
        classification_counts = histogram
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


def _classification_histogram(reader: pdal.Reader) -> list[ClassificationCount] | None:
    """
    None means the file has no Classification dimension at all -- distinct
    from an empty list, which means it has the dimension but zero points.
    Defensive: every standard LAS point format (0-10) reserves a
    Classification field, and PDAL's LAS reader always exposes it as a
    dimension even when every point is left at the default 0 (confirmed
    empirically against every fixture this module's tests use) -- so this
    branch is not expected to be reachable for a genuine .las/.laz file via
    this app's own PDAL reader, only kept in case some other file/writer
    combination ever produces one without it.
    """
    pipeline = reader.pipeline()
    pipeline.execute()
    if pipeline.arrays[0].size == 0:
        return []
    arr = pipeline.arrays[0]
    if "Classification" not in (arr.dtype.names or ()):
        return None
    unique, counts = np.unique(arr["Classification"], return_counts=True)
    return [
        ClassificationCount(classification_code=int(code), point_count=int(count))
        for code, count in zip(unique.tolist(), counts.tolist())
    ]
