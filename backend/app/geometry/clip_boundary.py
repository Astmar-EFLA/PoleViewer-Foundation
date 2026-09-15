"""
Pure functions for turning a rectangular clip boundary (defined in local
engineering coordinates, per docs/architecture/coordinate-strategy.md) into
a project-space WKT polygon PDAL's filters.crop can consume directly. The
rotation-then-translate order and axis convention are the same ones
coordinate_transform.py uses -- this file adds no new sign convention of
its own, it only composes the existing one.
"""

from __future__ import annotations

import math

from app.domain.coordinates import LocalCoordinate, LocalFrameDefinition
from app.geometry.coordinate_transform import local_to_project


def rectangular_clip_corners_local(
    center_x: float,
    center_y: float,
    width_m: float,
    length_m: float,
    rotation_radians: float,
) -> list[tuple[float, float]]:
    """
    Corners of a width x length rectangle centred at (center_x, center_y) in
    local engineering coordinates, rotated by rotation_radians about that
    centre (an *additional* rotation on top of the local frame's own
    bearing alignment -- see RectangularClipBoundary's docstring).
    Returned in a consistent winding order (not closed -- 4 points).
    """
    half_w = width_m / 2
    half_l = length_m / 2
    unrotated = [
        (-half_w, -half_l),
        (half_w, -half_l),
        (half_w, half_l),
        (-half_w, half_l),
    ]
    cos_r, sin_r = math.cos(rotation_radians), math.sin(rotation_radians)

    corners = []
    for lx, ly in unrotated:
        rx = lx * cos_r - ly * sin_r
        ry = lx * sin_r + ly * cos_r
        corners.append((center_x + rx, center_y + ry))
    return corners


def rectangular_clip_polygon_wkt(
    center_x: float,
    center_y: float,
    width_m: float,
    length_m: float,
    rotation_radians: float,
    local_frame: LocalFrameDefinition,
) -> str:
    """
    Builds a closed WKT POLYGON in project (Easting, Northing) coordinates
    -- the CRS PDAL's filters.crop needs to match against the LAS file's own
    native coordinates. Elevation is irrelevant to a horizontal clip
    boundary, so corners are projected at local z=0 purely to reuse
    local_to_project (only the resulting easting/northing are used).
    """
    corners_local = rectangular_clip_corners_local(center_x, center_y, width_m, length_m, rotation_radians)
    corners_project = [
        local_to_project(LocalCoordinate(x=x, y=y, z=0.0), local_frame) for x, y in corners_local
    ]
    ring = corners_project + [corners_project[0]]
    coords_str = ", ".join(f"{p.easting} {p.northing}" for p in ring)
    return f"POLYGON(({coords_str}))"
