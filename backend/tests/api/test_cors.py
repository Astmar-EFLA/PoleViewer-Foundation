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
