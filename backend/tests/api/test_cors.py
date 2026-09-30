from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_preflight_from_vite_dev_server_origin_is_allowed():
    response = client.options(
        "/pointcloud/clip",
        headers={
            "Origin": "http://localhost:5173",
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "content-type",
        },
    )
    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == "http://localhost:5173"


def test_actual_request_from_allowed_origin_gets_cors_header(workspace_with_fixtures):
    response = client.post(
        "/pointcloud/inspect",
        json={"filePath": "pointcloud-mixed-classification.las"},
        headers={"Origin": "http://localhost:5173"},
    )
    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == "http://localhost:5173"


def test_disallowed_origin_gets_no_cors_header():
    response = client.get("/health", headers={"Origin": "http://evil.example.com"})
    assert response.status_code == 200
    assert "access-control-allow-origin" not in response.headers


def test_an_unhandled_server_error_still_carries_the_cors_header(workspace_with_fixtures, monkeypatch):
    # Without this the browser drops the 500 and the frontend can only say
    # "could not reach the local backend", hiding that the backend answered.
    import app.api.pointcloud as pointcloud_api

    def boom(*args, **kwargs):
        raise ValueError("simulated unexpected failure")

    monkeypatch.setattr(pointcloud_api, "clip_las", boom)
    failing_client = TestClient(app, raise_server_exceptions=False)
    response = failing_client.post(
        "/pointcloud/clip",
        json={
            "filePath": "pointcloud-mixed-classification.las",
            "projectCrs": {"kind": "epsg", "epsgCode": 3057},
            "localFrame": {
                "mastCentreProject": {"space": "project", "easting": 512345.678, "northing": 487654.321, "elevation": 123.456},
                "lineBearingRadians": 0,
            },
            "boundary": {"shape": "rectangular", "widthM": 40, "lengthM": 40, "centerOffsetLocal": {"x": 0, "y": 0}, "rotationRadians": 0},
        },
        headers={"Origin": "http://localhost:5173"},
    )
    assert response.status_code == 500
    assert response.json() == {"detail": "An unexpected server error occurred."}
    assert response.headers["access-control-allow-origin"] == "http://localhost:5173"
