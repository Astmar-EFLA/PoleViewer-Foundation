"""
DEM (GeoTIFF) terrain tests. Every raster is written by the test itself with
GDAL into tmp_path -- small, synthetic, no binary fixtures in the repo.
"""

from __future__ import annotations

import tracemalloc

import numpy as np
import pytest
from osgeo import gdal, osr
from pyproj import Transformer

from app.domain.coordinates import CrsEpsg, LocalFrameDefinition, ProjectCoordinate
from app.processing.dem import DemClipBlockedError, clip_dem, inspect_dem
from app.schemas.dem import DemClipRequest

MAST = ProjectCoordinate(easting=512_345.678, northing=487_654.321, elevation=123.456)
CELL = 2.0


def write_dem(path, epsg, origin_x, origin_y, cols, rows, values=None, nodata=None, cell=CELL, sparse=False):
    driver = gdal.GetDriverByName("GTiff")
    options = ["TILED=YES", "COMPRESS=DEFLATE"] + (["SPARSE_OK=TRUE"] if sparse else [])
    ds = driver.Create(str(path), cols, rows, 1, gdal.GDT_Float32, options=options)
    ds.SetGeoTransform((origin_x, cell, 0.0, origin_y, 0.0, -cell))
    srs = osr.SpatialReference()
    srs.ImportFromEPSG(epsg)
    ds.SetProjection(srs.ExportToWkt())
    band = ds.GetRasterBand(1)
    if nodata is not None:
        band.SetNoDataValue(nodata)
    if values is not None:
        band.WriteArray(values.astype(np.float32))
    ds.FlushCache()
    ds = None
    return path


def mast_centred_dem(tmp_path, values_fn=None, nodata=None, name="dem.tif"):
    """60 x 60 cells of 2 m around the mast, cell edges on the mast so a 40 x 40 box holds exactly 20 x 20 centres."""
    cols = rows = 60
    origin_x, origin_y = MAST.easting - 60.0, MAST.northing + 60.0
    cc, rr = np.meshgrid(np.arange(cols) + 0.5, np.arange(rows) + 0.5)
    east, north = origin_x + cc * CELL, origin_y - rr * CELL
    values = values_fn(east, north) if values_fn else 100.0 + 0.01 * (east - MAST.easting)
    return write_dem(tmp_path / name, 3057, origin_x, origin_y, cols, rows, values, nodata)


def request(path, **overrides) -> DemClipRequest:
    defaults = dict(
        file_path=str(path),
        project_crs=CrsEpsg(epsg_code=3057),
        local_frame=LocalFrameDefinition(mast_centre_project=MAST, line_bearing_radians=0.0),
    )
    defaults.update(overrides)
    return DemClipRequest(**defaults)


def codes(result):
    return [w.code for w in result.warnings]


def test_inspect_reports_size_resolution_extent_and_crs(tmp_path):
    meta = inspect_dem(mast_centred_dem(tmp_path))
    assert (meta.width_px, meta.height_px) == (60, 60)
    assert meta.pixel_size_x_m == pytest.approx(2.0)
    assert meta.crs == CrsEpsg(epsg_code=3057)
    assert meta.extent.min_easting == pytest.approx(MAST.easting - 60.0)
    assert meta.extent.max_northing == pytest.approx(MAST.northing + 60.0)


def test_a_40x40_box_on_a_2m_dem_returns_one_point_per_cell_with_unchanged_heights(tmp_path):
    path = mast_centred_dem(tmp_path)
    result = clip_dem(path, request(path))
    assert result.returned_point_count == 400
    xs = np.array([p.x for p in result.points])
    zs = np.array([p.z for p in result.points])
    assert xs.min() == pytest.approx(-19.0) and xs.max() == pytest.approx(19.0)
    # Heights are the cells' own values (100 + 0.01 * easting offset), relative to the mast elevation -- not resampled.
    expected = 100.0 + 0.01 * xs - MAST.elevation
    assert np.allclose(zs, expected, atol=1e-3)
    assert "dem.derived-surface" in codes(result)
    assert "dem.mast-outside-file-bounds" not in codes(result)


def test_a_dem_in_another_crs_has_its_cell_centres_transformed_not_resampled(tmp_path):
    # ArcticDEM's CRS: build the raster around the mast's position in EPSG:3413.
    to_3413 = Transformer.from_crs(3057, 3413, always_xy=True)
    mx, my = to_3413.transform(MAST.easting, MAST.northing)
    path = write_dem(tmp_path / "arctic.tif", 3413, mx - 60.0, my + 60.0, 60, 60, np.full((60, 60), 250.0))
    result = clip_dem(path, request(path))

    assert "dem.reprojected" in codes(result)
    # The two grids are rotated relative to each other, so the count is only approximately 20 x 20.
    assert 360 <= result.returned_point_count <= 440
    xs = np.array([p.x for p in result.points])
    ys = np.array([p.y for p in result.points])
    assert np.all(np.abs(xs) <= 20.0) and np.all(np.abs(ys) <= 20.0)
    assert np.allclose([p.z for p in result.points], 250.0 - MAST.elevation)


def test_ellipsoidal_heights_need_a_geoid_height(tmp_path):
    path = mast_centred_dem(tmp_path)
    with pytest.raises(DemClipBlockedError) as exc:
        clip_dem(path, request(path, height_reference="ellipsoidal"))
    assert exc.value.warnings[0].code == "dem.geoid-height-required"


def test_ellipsoidal_heights_have_the_geoid_height_subtracted(tmp_path):
    path = mast_centred_dem(tmp_path, values_fn=lambda e, n: np.full(e.shape, 190.0))
    result = clip_dem(path, request(path, height_reference="ellipsoidal", geoid_height_m=65.0))
    assert np.allclose([p.z for p in result.points], 190.0 - 65.0 - MAST.elevation)
    warning = next(w for w in result.warnings if w.code == "dem.ellipsoidal-heights-corrected")
    assert "65.00" in warning.message


def test_nodata_cells_are_skipped(tmp_path):
    def with_hole(e, n):
        values = np.full(e.shape, 100.0)
        values[(np.abs(e - MAST.easting) < 4) & (np.abs(n - MAST.northing) < 4)] = -9999.0
        return values

    result = clip_dem(mast_centred_dem(tmp_path, with_hole, nodata=-9999.0), request(tmp_path / "dem.tif"))
    assert result.returned_point_count == 400 - 16
    assert "dem.nodata-cells-skipped" in codes(result)
    assert all(p.z > -9000 for p in result.points)


def test_a_mast_outside_the_dem_says_so_and_returns_no_points(tmp_path):
    path = mast_centred_dem(tmp_path)
    far = ProjectCoordinate(easting=554_144.3, northing=7_002_237.9, elevation=200.0)
    result = clip_dem(path, request(path, local_frame=LocalFrameDefinition(mast_centre_project=far, line_bearing_radians=0.0)))
    assert result.returned_point_count == 0
    assert "dem.mast-outside-file-bounds" in codes(result)
    assert "dem.clip-empty" in codes(result)


def test_only_the_window_around_the_mast_is_read_from_a_huge_raster(tmp_path):
    # 20 000 x 20 000 float32 cells = 1.6 GB if read whole; written sparse, so nothing is on disk either.
    path = write_dem(tmp_path / "huge.tif", 3057, MAST.easting - 20_000.0, MAST.northing + 20_000.0, 20_000, 20_000, sparse=True, cell=2.0)
    tracemalloc.start()
    result = clip_dem(path, request(path))
    _, peak = tracemalloc.get_traced_memory()
    tracemalloc.stop()
    assert result.returned_point_count == 400
    assert peak < 20 * 1024 * 1024  # well under 20 MB, not gigabytes
