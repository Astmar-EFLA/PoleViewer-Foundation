"""
Mirrors frontend/src/geometry/coordinateTransform.test.ts: same ISN93-scale
mast centre, same tolerance table
(docs/architecture/coordinate-strategy.md), same hand-computed
orientation-sign cases. Kept numerically identical to the TS suite on
purpose, so a divergence between the two language implementations shows up
as a test failure in at least one of them rather than silently drifting.
"""

import math

import numpy as np
import pytest

from app.domain.coordinates import LocalFrameDefinition, ProjectCoordinate
from app.geometry.coordinate_transform import local_to_project, project_to_local, project_to_local_array

PURE_MATH_TOLERANCE_M = 1e-6

ISN93_SCALE_MAST_CENTRE = ProjectCoordinate(easting=512_345.678, northing=487_654.321, elevation=123.456)


def frame_with_bearing_degrees(bearing_degrees: float) -> LocalFrameDefinition:
    return LocalFrameDefinition(
        mast_centre_project=ISN93_SCALE_MAST_CENTRE,
        line_bearing_radians=math.radians(bearing_degrees),
    )


@pytest.mark.parametrize(
    "d_easting,d_northing,d_elevation,bearing_deg",
    [
        (0.0, 0.0, 0.0, 37.0),
        (12.5, -8.3, 2.1, 0.0),
        (-19.4, 33.7, -4.9, 137.25),
        (100.0, 100.0, 0.0, 350.0),
    ],
)
def test_project_to_local_round_trip(d_easting, d_northing, d_elevation, bearing_deg):
    frame = frame_with_bearing_degrees(bearing_deg)
    point = ProjectCoordinate(
        easting=ISN93_SCALE_MAST_CENTRE.easting + d_easting,
        northing=ISN93_SCALE_MAST_CENTRE.northing + d_northing,
        elevation=ISN93_SCALE_MAST_CENTRE.elevation + d_elevation,
    )

    local = project_to_local(point, frame)
    round_tripped = local_to_project(local, frame)

    assert abs(round_tripped.easting - point.easting) < PURE_MATH_TOLERANCE_M
    assert abs(round_tripped.northing - point.northing) < PURE_MATH_TOLERANCE_M
    assert abs(round_tripped.elevation - point.elevation) < PURE_MATH_TOLERANCE_M


@pytest.mark.parametrize("bearing_deg", [0, 45, 90, 180, 270, 359])
def test_mast_centre_is_local_origin_regardless_of_bearing(bearing_deg):
    frame = frame_with_bearing_degrees(bearing_deg)
    local = project_to_local(ISN93_SCALE_MAST_CENTRE, frame)
    assert local.x == pytest.approx(0, abs=1e-9)
    assert local.y == pytest.approx(0, abs=1e-9)
    assert local.z == pytest.approx(0, abs=1e-9)


def test_bearing_0_north_local_y_is_north_local_x_is_east():
    frame = frame_with_bearing_degrees(0)

    point_east = ProjectCoordinate(
        easting=ISN93_SCALE_MAST_CENTRE.easting + 10,
        northing=ISN93_SCALE_MAST_CENTRE.northing,
        elevation=ISN93_SCALE_MAST_CENTRE.elevation,
    )
    local_east = project_to_local(point_east, frame)
    assert local_east.x == pytest.approx(10, abs=1e-9)
    assert local_east.y == pytest.approx(0, abs=1e-9)

    point_north = ProjectCoordinate(
        easting=ISN93_SCALE_MAST_CENTRE.easting,
        northing=ISN93_SCALE_MAST_CENTRE.northing + 10,
        elevation=ISN93_SCALE_MAST_CENTRE.elevation,
    )
    local_north = project_to_local(point_north, frame)
    assert local_north.x == pytest.approx(0, abs=1e-9)
    assert local_north.y == pytest.approx(10, abs=1e-9)


def test_bearing_90_east_local_y_is_east_local_x_is_south():
    frame = frame_with_bearing_degrees(90)

    point_east = ProjectCoordinate(
        easting=ISN93_SCALE_MAST_CENTRE.easting + 10,
        northing=ISN93_SCALE_MAST_CENTRE.northing,
        elevation=ISN93_SCALE_MAST_CENTRE.elevation,
    )
    local_east = project_to_local(point_east, frame)
    assert local_east.x == pytest.approx(0, abs=1e-9)
    assert local_east.y == pytest.approx(10, abs=1e-9)

    point_north = ProjectCoordinate(
        easting=ISN93_SCALE_MAST_CENTRE.easting,
        northing=ISN93_SCALE_MAST_CENTRE.northing + 10,
        elevation=ISN93_SCALE_MAST_CENTRE.elevation,
    )
    local_north = project_to_local(point_north, frame)
    assert local_north.x == pytest.approx(-10, abs=1e-9)
    assert local_north.y == pytest.approx(0, abs=1e-9)


def test_rotating_mast_90_degrees_moves_fixed_anchor_to_hand_computed_local_coordinate():
    fixed_anchor = ProjectCoordinate(
        easting=ISN93_SCALE_MAST_CENTRE.easting + 15,
        northing=ISN93_SCALE_MAST_CENTRE.northing,
        elevation=ISN93_SCALE_MAST_CENTRE.elevation + 3,
    )

    at_0deg = project_to_local(fixed_anchor, frame_with_bearing_degrees(0))
    assert at_0deg.x == pytest.approx(15, abs=1e-9)
    assert at_0deg.y == pytest.approx(0, abs=1e-9)
    assert at_0deg.z == pytest.approx(3, abs=1e-9)

    at_90deg = project_to_local(fixed_anchor, frame_with_bearing_degrees(90))
    assert at_90deg.x == pytest.approx(0, abs=1e-9)
    assert at_90deg.y == pytest.approx(15, abs=1e-9)
    assert at_90deg.z == pytest.approx(3, abs=1e-9)


def test_array_form_matches_scalar_form_elementwise():
    frame = frame_with_bearing_degrees(52.0)
    offsets = [(0.0, 0.0, 0.0), (12.3, -4.5, 1.1), (-30.0, 30.0, -2.0), (100.0, -100.0, 5.0)]

    scalar_results = [
        project_to_local(
            ProjectCoordinate(
                easting=ISN93_SCALE_MAST_CENTRE.easting + dE,
                northing=ISN93_SCALE_MAST_CENTRE.northing + dN,
                elevation=ISN93_SCALE_MAST_CENTRE.elevation + dZ,
            ),
            frame,
        )
        for dE, dN, dZ in offsets
    ]

    eastings = np.array([ISN93_SCALE_MAST_CENTRE.easting + o[0] for o in offsets])
    northings = np.array([ISN93_SCALE_MAST_CENTRE.northing + o[1] for o in offsets])
    elevations = np.array([ISN93_SCALE_MAST_CENTRE.elevation + o[2] for o in offsets])

    xs, ys, zs = project_to_local_array(eastings, northings, elevations, frame)

    for i, scalar in enumerate(scalar_results):
        assert xs[i] == pytest.approx(scalar.x, abs=1e-9)
        assert ys[i] == pytest.approx(scalar.y, abs=1e-9)
        assert zs[i] == pytest.approx(scalar.z, abs=1e-9)
