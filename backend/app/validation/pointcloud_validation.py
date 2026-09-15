"""
Point-cloud validation rules that produce ProcessingWarning results. Kept
separate from processing/las_clip.py so the CRS-consistency policy is one
testable, reusable function rather than inline logic duplicated per
endpoint.
"""

from __future__ import annotations

from app.domain.coordinates import CoordinateReferenceSystem, CrsEpsg, CrsUnknown
from app.schemas.pointcloud import ProcessingWarning


def crs_consistency_warnings(
    file_crs: CoordinateReferenceSystem, project_crs: CoordinateReferenceSystem
) -> list[ProcessingWarning]:
    """
    Never silently assumes CRS equivalence. An EPSG-vs-EPSG mismatch is
    blocking. Either side being unknown is blocking (principle: never
    continue with a blocking coordinate inconsistency). Explicit (WKT/PROJ)
    CRS text on either side is flagged as a warning, not silently accepted
    or silently rejected -- string-level WKT/PROJ comparison is not a
    reliable equivalence check, and pretending otherwise would be worse
    than admitting the limitation.
    """
    if isinstance(project_crs, CrsUnknown):
        return [
            ProcessingWarning(
                code="pointcloud.project-crs-unknown",
                severity="blocking",
                message="Project CRS is not set; cannot safely clip or transform point-cloud coordinates.",
            )
        ]

    if isinstance(file_crs, CrsUnknown):
        return [
            ProcessingWarning(
                code="pointcloud.file-crs-unknown",
                severity="blocking",
                message="The point-cloud file has no coordinate reference system; cannot safely clip against the project CRS.",
            )
        ]

    if isinstance(file_crs, CrsEpsg) and isinstance(project_crs, CrsEpsg):
        if file_crs.epsg_code != project_crs.epsg_code:
            return [
                ProcessingWarning(
                    code="pointcloud.crs-mismatch",
                    severity="blocking",
                    message=(
                        f"File CRS (EPSG:{file_crs.epsg_code}) does not match "
                        f"project CRS (EPSG:{project_crs.epsg_code})."
                    ),
                )
            ]
        return []

    return [
        ProcessingWarning(
            code="pointcloud.crs-not-epsg-comparable",
            severity="warning",
            message=(
                "File and/or project CRS is defined by explicit WKT/PROJ text "
                "rather than an EPSG code; automatic equivalence checking is "
                "not implemented. Confirm manually that both refer to the same CRS."
            ),
        )
    ]
