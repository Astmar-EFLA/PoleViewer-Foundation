import math

import pytest

from app.domain.coordinates import LocalFrameDefinition, ProjectCoordinate
from app.geometry.clip_boundary import rectangular_clip_corners_local, rectangular_clip_polygon_wkt

MAST_CENTRE = ProjectCoordinate(easting=512_345.678, northing=487_654.321, elevation=123.456)


def frame(bearing_deg: float) -> LocalFrameDefinition:
    return LocalFrameDefinition(mast_centre_project=MAST_CENTRE, line_bearing_radians=math.radians(bearing_deg))


def test_default_40x40_centred_axis_aligned_corners():
    corners = rectangular_clip_corners_local(0, 0, 40, 40, 0)
    assert sorted(corners) == sorted(
        [(-20.0, -20.0), (20.0, -20.0), (20.0, 20.0), (-20.0, 20.0)]
    )


def test_rotation_45_degrees_rotates_corners_about_their_centre():
    corners = rectangular_clip_corners_local(0, 0, 2, 2, math.radians(45))
    # A 2x2 square rotated 45deg about its own centre: corners at distance
    # sqrt(2) from centre, on the axes.
    for x, y in corners:
        assert math.hypot(x, y) == pytest.approx(math.sqrt(2), abs=1e-9)
    xs = sorted(round(x, 9) for x, _ in corners)
    assert xs[0] == pytest.approx(-math.sqrt(2), abs=1e-9)
    assert xs[-1] == pytest.approx(math.sqrt(2), abs=1e-9)


def test_offset_centre_translates_all_corners():
    corners = rectangular_clip_corners_local(5, -3, 10, 10, 0)
    assert sorted(corners) == sorted([(0.0, -8.0), (10.0, -8.0), (10.0, 2.0), (0.0, 2.0)])


def test_wkt_polygon_bearing_0_is_axis_aligned_square_in_project_space():
    wkt = rectangular_clip_polygon_wkt(0, 0, 40, 40, 0, frame(0))
    assert wkt.startswith("POLYGON((")
    assert wkt.endswith("))")

    expected_corner_offsets = [(-20, -20), (20, -20), (20, 20), (-20, 20)]
    for dE, dN in expected_corner_offsets:
        expected = f"{MAST_CENTRE.easting + dE} {MAST_CENTRE.northing + dN}"
        assert expected in wkt


def test_wkt_polygon_is_closed():
    wkt = rectangular_clip_polygon_wkt(0, 0, 40, 40, 0, frame(30))
    ring = wkt[len("POLYGON((") : -len("))")]
    points = ring.split(", ")
    assert points[0] == points[-1]
    assert len(points) == 5  # 4 corners + repeated first point to close the ring


def test_wkt_polygon_bearing_90_matches_hand_computed_rotation():
    # bearing=90 (east): local Y=east, local X=south (see
    # coordinate-strategy.md and test_coordinate_transform.py). Corner
    # local(-20,-20) -> dE = x*cos90 + y*sin90 = -20, dN = -x*sin90 + y*cos90 = 20.
    wkt = rectangular_clip_polygon_wkt(0, 0, 40, 40, 0, frame(90))
    expected = f"{MAST_CENTRE.easting - 20} {MAST_CENTRE.northing + 20}"
    assert expected in wkt
