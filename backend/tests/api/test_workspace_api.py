from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_file_status_reports_an_existing_file_with_its_hash(workspace_with_fixtures):
    response = client.post(
        "/workspace/file-status", json={"filePath": "pointcloud-mixed-classification.las"}
    )
    assert response.status_code == 200
    body = response.json()
    assert body["exists"] is True
    assert body["sizeBytes"] > 0
    assert len(body["sha256"]) == 64


def test_file_status_hash_is_stable_across_calls(workspace_with_fixtures):
    first = client.post(
        "/workspace/file-status", json={"filePath": "pointcloud-mixed-classification.las"}
    ).json()
    second = client.post(
        "/workspace/file-status", json={"filePath": "pointcloud-mixed-classification.las"}
    ).json()
    assert first["sha256"] == second["sha256"]


def test_file_status_hash_differs_for_different_file_content(workspace_with_fixtures):
    a = client.post(
        "/workspace/file-status", json={"filePath": "pointcloud-mixed-classification.las"}
    ).json()
    b = client.post("/workspace/file-status", json={"filePath": "pointcloud-no-crs.las"}).json()
    assert a["sha256"] != b["sha256"]


def test_file_status_reports_missing_file_without_erroring(workspace_with_fixtures):
    response = client.post("/workspace/file-status", json={"filePath": "does-not-exist.las"})
    assert response.status_code == 200
    body = response.json()
    assert body["exists"] is False
    assert body["sizeBytes"] is None
    assert body["sha256"] is None


def test_file_status_400_for_path_traversal(workspace_with_fixtures):
    response = client.post("/workspace/file-status", json={"filePath": "../../outside.las"})
    assert response.status_code == 400


def test_file_status_400_for_absolute_path(workspace_with_fixtures):
    response = client.post(
        "/workspace/file-status", json={"filePath": "C:/Windows/System32/config/SAM"}
    )
    assert response.status_code == 400


def test_file_status_hash_changes_when_file_content_is_modified(workspace_with_fixtures):
    target = workspace_with_fixtures / "pointcloud-mixed-classification.las"
    before = client.post(
        "/workspace/file-status", json={"filePath": "pointcloud-mixed-classification.las"}
    ).json()

    with target.open("ab") as f:
        f.write(b"\x00\x01\x02\x03")

    after = client.post(
        "/workspace/file-status", json={"filePath": "pointcloud-mixed-classification.las"}
    ).json()
    assert after["sha256"] != before["sha256"]
    assert after["sizeBytes"] == before["sizeBytes"] + 4
