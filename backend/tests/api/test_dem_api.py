import numpy as np
from fastapi.testclient import TestClient

from app.main import app
from tests.processing.test_dem import MAST, mast_centred_dem

client = TestClient(app)

CLIP_BODY = {
    "filePath": "dem.tif",
    "projectCrs": {"kind": "epsg", "epsgCode": 3057},
    "localFrame": {
        "mastCentreProject": {"space": "project", "easting": MAST.easting, "northing": MAST.northing, "elevation": MAST.elevation},
        "lineBearingRadians": 0,
    },
}


def test_dem_inspect_and_clip_through_the_api(tmp_path, monkeypatch):
    monkeypatch.setenv("POLE_VIEWER_WORKSPACE_ROOT", str(tmp_path))
    mast_centred_dem(tmp_path)

    inspect = client.post("/dem/inspect", json={"filePath": "dem.tif"})
    assert inspect.status_code == 200
    assert inspect.json()["crs"] == {"kind": "epsg", "epsgCode": 3057}

    clip = client.post("/dem/clip", json=CLIP_BODY)
    assert clip.status_code == 200
    body = clip.json()
    assert body["returnedPointCount"] == 400
    assert np.isfinite([p["z"] for p in body["points"]]).all()


def test_dem_clip_with_ellipsoidal_heights_and_no_geoid_height_is_a_422_with_warnings(tmp_path, monkeypatch):
    monkeypatch.setenv("POLE_VIEWER_WORKSPACE_ROOT", str(tmp_path))
    mast_centred_dem(tmp_path)
    response = client.post("/dem/clip", json={**CLIP_BODY, "heightReference": "ellipsoidal"})
    assert response.status_code == 422
    assert response.json()["detail"]["warnings"][0]["code"] == "dem.geoid-height-required"


def test_a_non_tiff_is_rejected_as_a_dem(tmp_path, monkeypatch):
    monkeypatch.setenv("POLE_VIEWER_WORKSPACE_ROOT", str(tmp_path))
    (tmp_path / "x.las").write_bytes(b"not a raster")
    response = client.post("/dem/inspect", json={"filePath": "x.las"})
    assert response.status_code == 422
