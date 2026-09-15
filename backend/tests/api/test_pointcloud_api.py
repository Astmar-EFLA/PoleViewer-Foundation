from fastapi.testclient import TestClient

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


def test_clip_endpoint_400_for_path_outside_workspace(workspace_with_fixtures):
    payload = {
        "filePath": "../outside.las",
        "projectCrs": {"kind": "epsg", "epsgCode": 3057},
        "localFrame": {"mastCentreProject": MAST_CENTRE_JSON, "lineBearingRadians": 0.0},
    }
    response = client.post("/pointcloud/clip", json=payload)
    assert response.status_code == 400
