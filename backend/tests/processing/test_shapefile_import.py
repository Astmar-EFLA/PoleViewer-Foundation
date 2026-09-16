import io
import zipfile

import pytest

from app.domain.coordinates import CrsEpsg
from app.processing.shapefile_import import ShapefileReadError, extract_centreline

MAST_EASTING = 512_345.678
MAST_NORTHING = 487_654.321


def test_extracts_the_known_vertices_from_the_synthetic_fixture(workspace_with_fixtures):
    zip_bytes = (workspace_with_fixtures / "line-centreline.zip").read_bytes()
    result = extract_centreline(zip_bytes, CrsEpsg(epsg_code=3057))

    assert len(result.vertices) == 3
    assert result.vertices[0].easting == pytest.approx(MAST_EASTING - 30.0)
    assert result.vertices[0].northing == pytest.approx(MAST_NORTHING - 5.0)
    assert result.vertices[1].easting == pytest.approx(MAST_EASTING + 2.0)
    assert result.vertices[2].northing == pytest.approx(MAST_NORTHING + 12.0)


def test_no_warning_when_the_prj_crs_matches_the_project_crs(workspace_with_fixtures):
    zip_bytes = (workspace_with_fixtures / "line-centreline.zip").read_bytes()
    result = extract_centreline(zip_bytes, CrsEpsg(epsg_code=3057))
    assert result.warnings == []


def test_warns_but_does_not_block_when_the_prj_crs_does_not_match_the_project_crs(workspace_with_fixtures):
    zip_bytes = (workspace_with_fixtures / "line-centreline.zip").read_bytes()
    result = extract_centreline(zip_bytes, CrsEpsg(epsg_code=25832))

    assert len(result.vertices) == 3  # not blocked -- vertices are still returned
    assert any(w.code == "line.centreline-crs-mismatch" for w in result.warnings)
    assert all(w.severity == "warning" for w in result.warnings)


def test_raises_a_clear_error_for_a_zip_with_no_shp_file():
    zip_buf = io.BytesIO()
    with zipfile.ZipFile(zip_buf, "w") as zf:
        zf.writestr("readme.txt", "not a shapefile")

    with pytest.raises(ShapefileReadError, match="\\.shp"):
        extract_centreline(zip_buf.getvalue(), CrsEpsg(epsg_code=3057))


def test_raises_a_clear_error_for_bytes_that_are_not_a_zip_at_all():
    with pytest.raises(ShapefileReadError, match="zip"):
        extract_centreline(b"this is not a zip file", CrsEpsg(epsg_code=3057))
