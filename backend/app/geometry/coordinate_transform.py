"""
Pure, framework-free coordinate transform functions implementing the
project <-> local engineering half of the chain defined in
docs/architecture/coordinate-strategy.md. This is a deliberate port of
frontend/src/geometry/coordinateTransform.ts's project_to_local /
local_to_project -- same derivation, same sign convention, verified by the
same hand-computed orientation test cases (see
tests/geometry/test_coordinate_transform.py) so a bearing-sign bug can't
silently diverge between the two language implementations.

The backend never needs the local <-> viewer stage (that is a Three.js
rendering-layer concept, frontend-only).
"""

from __future__ import annotations

import math

import numpy as np
import numpy.typing as npt

from app.domain.coordinates import LocalCoordinate, LocalFrameDefinition, ProjectCoordinate


def _local_basis(line_bearing_radians: float) -> tuple[float, float]:
    return math.cos(line_bearing_radians), math.sin(line_bearing_radians)


def project_to_local(point: ProjectCoordinate, frame: LocalFrameDefinition) -> LocalCoordinate:
    d_easting = point.easting - frame.mast_centre_project.easting
    d_northing = point.northing - frame.mast_centre_project.northing
    cos_b, sin_b = _local_basis(frame.line_bearing_radians)

    x = d_easting * cos_b - d_northing * sin_b
    y = d_easting * sin_b + d_northing * cos_b
    z = point.elevation - frame.mast_centre_project.elevation

    return LocalCoordinate(x=x, y=y, z=z)


def local_to_project(point: LocalCoordinate, frame: LocalFrameDefinition) -> ProjectCoordinate:
    cos_b, sin_b = _local_basis(frame.line_bearing_radians)

    d_easting = point.x * cos_b + point.y * sin_b
    d_northing = -point.x * sin_b + point.y * cos_b

    return ProjectCoordinate(
        easting=frame.mast_centre_project.easting + d_easting,
        northing=frame.mast_centre_project.northing + d_northing,
        elevation=frame.mast_centre_project.elevation + point.z,
    )


def project_to_local_array(
    easting: npt.NDArray[np.floating],
    northing: npt.NDArray[np.floating],
    elevation: npt.NDArray[np.floating],
    frame: LocalFrameDefinition,
) -> tuple[npt.NDArray[np.floating], npt.NDArray[np.floating], npt.NDArray[np.floating]]:
    """
    Vectorized form of project_to_local for converting a whole clipped
    point array at once (used by processing/las_clip.py). Shares
    `_local_basis` with the scalar function above so the two can't
    silently diverge -- see test_coordinate_transform.py's
    test_array_form_matches_scalar_form_elementwise.
    """
    cos_b, sin_b = _local_basis(frame.line_bearing_radians)
    d_easting = easting - frame.mast_centre_project.easting
    d_northing = northing - frame.mast_centre_project.northing

    x = d_easting * cos_b - d_northing * sin_b
    y = d_easting * sin_b + d_northing * cos_b
    z = elevation - frame.mast_centre_project.elevation

    return x, y, z
