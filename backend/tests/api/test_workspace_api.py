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


def test_upload_pole_model_lands_in_the_workspace_and_can_be_read_back(workspace_with_fixtures):
    response = client.post(
        "/workspace/upload",
        files={"file": ("real-model.pol", b"not a real .pol, just bytes", "application/octet-stream")},
        data={"kind": "pole-model"},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["originalFileName"] == "real-model.pol"
    assert body["sizeBytes"] > 0
    assert body["filePath"].startswith("uploads/")
    assert body["filePath"].endswith("-real-model.pol")

    status = client.post("/workspace/file-status", json={"filePath": body["filePath"]}).json()
    assert status["exists"] is True
    assert status["sizeBytes"] == body["sizeBytes"]


def test_upload_two_files_with_the_same_name_never_collide(workspace_with_fixtures):
    first = client.post(
        "/workspace/upload",
        files={"file": ("same-name.pol", b"first", "application/octet-stream")},
        data={"kind": "pole-model"},
    ).json()
    second = client.post(
        "/workspace/upload",
        files={"file": ("same-name.pol", b"second", "application/octet-stream")},
        data={"kind": "pole-model"},
    ).json()
    assert first["filePath"] != second["filePath"]

    first_status = client.post("/workspace/file-status", json={"filePath": first["filePath"]}).json()
    second_status = client.post("/workspace/file-status", json={"filePath": second["filePath"]}).json()
    assert first_status["sha256"] != second_status["sha256"]


def test_upload_rejects_an_unrecognised_extension_for_the_requested_kind(workspace_with_fixtures):
    response = client.post(
        "/workspace/upload",
        files={"file": ("notes.txt", b"hello", "text/plain")},
        data={"kind": "pole-model"},
    )
    assert response.status_code == 422


def test_upload_rejects_a_file_over_the_configured_size_limit(workspace_with_fixtures, monkeypatch):
    monkeypatch.setenv("POLE_VIEWER_MAX_FILE_SIZE_MB", "1")
    oversized = b"x" * (2 * 1024 * 1024)
    response = client.post(
        "/workspace/upload",
        files={"file": ("big.las", oversized, "application/octet-stream")},
        data={"kind": "point-cloud"},
    )
    assert response.status_code == 422
    # The rejected upload must not be left behind in the workspace.
    assert list((workspace_with_fixtures / "uploads").glob("*big.las")) == []
