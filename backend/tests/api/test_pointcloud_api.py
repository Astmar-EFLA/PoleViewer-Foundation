from fastapi.testclient import TestClient

import app.api.pointcloud as pointcloud_api
from app.main import app

client = TestClient(app)

MAST_CENTRE_JSON = {"easting": 512_345.678, "northing": 487_654.321, "elevation": 123.456}


def test_health_endpoint():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_inspect_endpoint_returns_camelcase_metadata(workspace_with_fixtures):
    response = client.post(
        "/pointcloud/inspect", json={"filePath": "pointcloud-mixed-classification.las"}
    )
    assert response.status_code == 200
    body = response.json()
    assert body["pointCount"] == 1646
    assert body["crs"] == {"kind": "epsg", "epsgCode": 3057}
    assert body["hasRgb"] is True
    assert {c["classificationCode"]: c["pointCount"] for c in body["classificationCounts"]} == {
        0: 100,
        2: 1296,
        5: 250,
    }


def test_inspect_endpoint_404_for_missing_file(workspace_with_fixtures):
    response = client.post("/pointcloud/inspect", json={"filePath": "does-not-exist.las"})
    assert response.status_code == 404


def test_inspect_endpoint_400_for_path_traversal(workspace_with_fixtures):
    response = client.post("/pointcloud/inspect", json={"filePath": "../../outside.las"})
    assert response.status_code == 400


def test_inspect_endpoint_400_for_absolute_path(workspace_with_fixtures):
    response = client.post("/pointcloud/inspect", json={"filePath": "C:/Windows/System32/config/SAM"})
    assert response.status_code == 400


def test_clip_endpoint_returns_points_and_metadata(workspace_with_fixtures):
    payload = {
        "filePath": "pointcloud-mixed-classification.las",
        "projectCrs": {"kind": "epsg", "epsgCode": 3057},
        "localFrame": {"mastCentreProject": MAST_CENTRE_JSON, "lineBearingRadians": 0.0},
        "classificationFilter": [2],
    }
    response = client.post("/pointcloud/clip", json=payload)
    assert response.status_code == 200
    body = response.json()
    assert body["clippedPointCount"] == 400
    assert body["returnedPointCount"] == 400
    assert len(body["points"]) == 400
    assert body["processingMetadata"]["filePath"] == "pointcloud-mixed-classification.las"


def test_clip_endpoint_defaults_to_40x40_boundary_when_omitted(workspace_with_fixtures):
    payload = {
        "filePath": "pointcloud-mixed-classification.las",
        "projectCrs": {"kind": "epsg", "epsgCode": 3057},
        "localFrame": {"mastCentreProject": MAST_CENTRE_JSON, "lineBearingRadians": 0.0},
        "classificationFilter": [2],
    }
    response = client.post("/pointcloud/clip", json=payload)
    body = response.json()
    assert body["processingMetadata"]["boundary"]["widthM"] == 40.0
    assert body["processingMetadata"]["boundary"]["lengthM"] == 40.0


def test_clip_endpoint_422_for_crs_mismatch_includes_warnings_in_body(workspace_with_fixtures):
    payload = {
        "filePath": "pointcloud-mixed-classification.las",
        "projectCrs": {"kind": "epsg", "epsgCode": 25832},
        "localFrame": {"mastCentreProject": MAST_CENTRE_JSON, "lineBearingRadians": 0.0},
    }
    response = client.post("/pointcloud/clip", json=payload)
    assert response.status_code == 422
    detail = response.json()["detail"]
    assert any(w["code"] == "pointcloud.crs-mismatch" for w in detail["warnings"])


def test_clip_endpoint_404_for_missing_file(workspace_with_fixtures):
    payload = {
        "filePath": "does-not-exist.las",
        "projectCrs": {"kind": "epsg", "epsgCode": 3057},
        "localFrame": {"mastCentreProject": MAST_CENTRE_JSON, "lineBearingRadians": 0.0},
    }
    response = client.post("/pointcloud/clip", json=payload)
    assert response.status_code == 404


def test_clip_endpoint_422_when_result_exceeds_the_configured_point_limit(workspace_with_fixtures, monkeypatch):
    monkeypatch.setenv("POLE_VIEWER_MAX_RETURNED_POINTS", "10")
    payload = {
        "filePath": "pointcloud-mixed-classification.las",
        "projectCrs": {"kind": "epsg", "epsgCode": 3057},
        "localFrame": {"mastCentreProject": MAST_CENTRE_JSON, "lineBearingRadians": 0.0},
        "classificationFilter": [2],
    }
    response = client.post("/pointcloud/clip", json=payload)
    assert response.status_code == 422
    detail = response.json()["detail"]
    assert any(w["code"] == "pointcloud.result-too-large" for w in detail["warnings"])


def test_clip_endpoint_400_for_path_outside_workspace(workspace_with_fixtures):
    payload = {
        "filePath": "../outside.las",
        "projectCrs": {"kind": "epsg", "epsgCode": 3057},
        "localFrame": {"mastCentreProject": MAST_CENTRE_JSON, "lineBearingRadians": 0.0},
    }
    response = client.post("/pointcloud/clip", json=payload)
    assert response.status_code == 400


def test_unhandled_exception_returns_a_generic_500_body_not_a_traceback(workspace_with_fixtures, monkeypatch):
    def boom(_path):
        raise ValueError("something unexpected and internal")

    monkeypatch.setattr(pointcloud_api, "inspect_las", boom)
    # Only this test needs a client that returns the 500 response instead
    # of re-raising the exception into the test itself -- every other test
    # uses the module-level `client`, whose default (re-raise) behaviour is
    # what you want for catching a genuine regression.
    non_raising_client = TestClient(app, raise_server_exceptions=False)
    response = non_raising_client.post(
        "/pointcloud/inspect", json={"filePath": "pointcloud-mixed-classification.las"}
    )
    assert response.status_code == 500
    body = response.json()
    assert body == {"detail": "An unexpected server error occurred."}
    assert "something unexpected and internal" not in response.text


def test_inspect_endpoint_422_for_a_non_point_cloud_extension(workspace_with_fixtures):
    (workspace_with_fixtures / "notes.txt").write_text("not a point cloud")
    response = client.post("/pointcloud/inspect", json={"filePath": "notes.txt"})
    assert response.status_code == 422
    assert "extension" in response.json()["detail"]


def test_inspect_endpoint_422_when_file_exceeds_the_configured_size_limit(workspace_with_fixtures, monkeypatch):
    # Pad a copy of the fixture well past 1 MB so an integer-MB limit of 1
    # reliably trips the guard, regardless of the original fixture's size.
    fixture_path = workspace_with_fixtures / "pointcloud-mixed-classification.las"
    padded_path = workspace_with_fixtures / "padded.las"
    padded_path.write_bytes(fixture_path.read_bytes() + b"\x00" * (2 * 1024 * 1024))

    monkeypatch.setenv("POLE_VIEWER_MAX_FILE_SIZE_MB", "1")
    response = client.post("/pointcloud/inspect", json={"filePath": "padded.las"})
    assert response.status_code == 422
    assert "processing limit" in response.json()["detail"]
