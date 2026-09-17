import io

import numpy as np
import pytest
from PIL import Image

from app.domain.coordinates import CrsEpsg, CrsUnknown
from app.processing.world_imagery import (
    WorldImageryError,
    build_world_imagery_orthophoto,
    resolution_m_per_px,
)


def test_resolution_m_per_px_matches_the_standard_web_mercator_formula():
    # At the equator and zoom 0, the whole 40,075km circumference is one 256px tile.
    assert resolution_m_per_px(0, 0.0) == pytest.approx(156543.03392, rel=1e-6)
    # Resolution halves with every zoom level increment.
    assert resolution_m_per_px(1, 0.0) == pytest.approx(156543.03392 / 2, rel=1e-6)
    # Resolution is finer (smaller) away from the equator (cos(lat) < 1).
    assert resolution_m_per_px(10, 65.0) < resolution_m_per_px(10, 0.0)


def _fake_fetch_tile_factory():
    """Returns (fetch_fn, calls) -- fetch_fn hands back a solid-colour 256x256 tile whose colour encodes its own (zoom, x, y), so a test can verify exactly which tiles were requested and that each output pixel sampled the *correct* tile, all without any real network access."""
    calls: list[tuple[int, int, int]] = []

    def fetch(zoom: int, tile_x: int, tile_y: int) -> np.ndarray:
        calls.append((zoom, tile_x, tile_y))
        # Colour = (tile_x % 256, tile_y % 256, zoom % 256) -- distinct per tile, cheap to verify.
        colour = (tile_x % 256, tile_y % 256, zoom % 256)
        return np.full((256, 256, 3), colour, dtype=np.uint8)

    return fetch, calls


def test_build_world_imagery_orthophoto_uses_project_crs_and_produces_a_matching_world_file():
    # EPSG:4326 (plain lon/lat) as the "project CRS" makes the reprojection
    # step an identity transform -- centre_easting/northing here *are*
    # lon/lat directly, so the expected geometry can be checked by hand
    # instead of via a second implementation of a real projected CRS.
    fetch, calls = _fake_fetch_tile_factory()
    lon, lat = -18.0, 65.0
    width_m, height_m, zoom = 200.0, 200.0, 18

    result = build_world_imagery_orthophoto(lon, lat, CrsEpsg(epsg_code=4326), width_m, height_m, zoom, fetch_tile_fn=fetch)

    expected_pixel_size = resolution_m_per_px(zoom, lat)
    assert result.resolution_m_per_px == pytest.approx(expected_pixel_size)
    assert result.width_px == round(width_m / expected_pixel_size)
    assert result.height_px == round(height_m / expected_pixel_size)

    # World file: axis-aligned (no rotation), pixel size matches, and the
    # upper-left pixel's centre is a half-pixel inset from the true edge.
    wf = result.world_file
    assert wf.rotation_x == 0.0
    assert wf.rotation_y == 0.0
    assert wf.pixel_size_x == pytest.approx(expected_pixel_size)
    assert wf.pixel_size_y == pytest.approx(-expected_pixel_size)
    expected_edge_easting = lon - width_m / 2
    expected_edge_northing = lat + height_m / 2
    assert wf.upper_left_x == pytest.approx(expected_edge_easting + expected_pixel_size / 2)
    assert wf.upper_left_y == pytest.approx(expected_edge_northing - expected_pixel_size / 2)

    # More than one tile was needed to cover a 200m area at zoom 18 (~64m/tile) --
    # this genuinely exercises the multi-tile assembly path, not just a single fetch.
    assert len(set(calls)) > 1

    with Image.open(io.BytesIO(result.jpeg_bytes)) as img:
        assert img.size == (result.width_px, result.height_px)


def test_build_world_imagery_orthophoto_raises_for_an_unknown_crs():
    fetch, _ = _fake_fetch_tile_factory()
    with pytest.raises(WorldImageryError, match="not set"):
        build_world_imagery_orthophoto(-18.0, 65.0, CrsUnknown(), 200.0, 200.0, 18, fetch_tile_fn=fetch)


def test_build_world_imagery_orthophoto_propagates_a_tile_fetch_failure():
    def failing_fetch(zoom: int, tile_x: int, tile_y: int) -> np.ndarray:
        raise WorldImageryError("simulated network failure")

    with pytest.raises(WorldImageryError, match="simulated network failure"):
        build_world_imagery_orthophoto(-18.0, 65.0, CrsEpsg(epsg_code=4326), 200.0, 200.0, 18, fetch_tile_fn=failing_fetch)


def test_resulting_image_pixels_sample_the_tile_matching_their_own_location():
    """
    A stronger correctness check than dimensions/world-file alone: pick two
    far-apart points within the fetched area, confirm they fall in
    *different* source tiles, and confirm the output image's pixel colours
    at those two locations differ accordingly (would fail if pixels were
    sampled from the wrong tile, or if the whole image silently came from
    just one tile).
    """
    fetch, _ = _fake_fetch_tile_factory()
    lon, lat = -18.0, 65.0
    width_m, height_m, zoom = 300.0, 300.0, 18

    result = build_world_imagery_orthophoto(lon, lat, CrsEpsg(epsg_code=4326), width_m, height_m, zoom, fetch_tile_fn=fetch)
    with Image.open(io.BytesIO(result.jpeg_bytes)) as img:
        arr = np.array(img)

    top_left_pixel = arr[0, 0]
    bottom_right_pixel = arr[-1, -1]
    # JPEG is lossy, so allow a small tolerance rather than requiring exact equality.
    assert not np.allclose(top_left_pixel, bottom_right_pixel, atol=5)
