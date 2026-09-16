from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_centreline_endpoint_returns_vertices_and_no_warnings_when_crs_matches(workspace_with_fixtures):
    response = client.post(
        "/line/centreline",
        json={"filePath": "line-centreline.zip", "projectCrs": {"kind": "epsg", "epsgCode": 3057}},
    )
    assert response.status_code == 200
    body = response.json()
    assert len(body["vertices"]) == 3
    assert body["warnings"] == []


def test_centreline_endpoint_warns_on_crs_mismatch_but_still_returns_vertices(workspace_with_fixtures):
    response = client.post(
        "/line/centreline",
        json={"filePath": "line-centreline.zip", "projectCrs": {"kind": "epsg", "epsgCode": 25832}},
    )
    assert response.status_code == 200
    body = response.json()
    assert len(body["vertices"]) == 3
    assert any(w["code"] == "line.centreline-crs-mismatch" for w in body["warnings"])


def test_centreline_endpoint_404_for_missing_file(workspace_with_fixtures):
    response = client.post(
        "/line/centreline",
        json={"filePath": "does-not-exist.zip", "projectCrs": {"kind": "epsg", "epsgCode": 3057}},
    )
    assert response.status_code == 404


def test_centreline_endpoint_400_for_path_outside_workspace(workspace_with_fixtures):
    response = client.post(
        "/line/centreline",
        json={"filePath": "../outside.zip", "projectCrs": {"kind": "epsg", "epsgCode": 3057}},
    )
    assert response.status_code == 400


def test_centreline_endpoint_422_for_a_non_zip_extension(workspace_with_fixtures):
    (workspace_with_fixtures / "notes.txt").write_text("not a shapefile")
    response = client.post(
        "/line/centreline",
        json={"filePath": "notes.txt", "projectCrs": {"kind": "epsg", "epsgCode": 3057}},
    )
    assert response.status_code == 422
    assert "extension" in response.json()["detail"]


def test_centreline_endpoint_422_for_a_zip_with_no_shapefile(workspace_with_fixtures):
    import zipfile

    bad_zip = workspace_with_fixtures / "empty.zip"
    with zipfile.ZipFile(bad_zip, "w") as zf:
        zf.writestr("readme.txt", "no shapefile here")

    response = client.post(
        "/line/centreline",
        json={"filePath": "empty.zip", "projectCrs": {"kind": "epsg", "epsgCode": 3057}},
    )
    assert response.status_code == 422


def test_upload_endpoint_accepts_line_centreline_kind(workspace_with_fixtures):
    zip_bytes = (workspace_with_fixtures / "line-centreline.zip").read_bytes()
    response = client.post(
        "/workspace/upload",
        files={"file": ("uploaded-centreline.zip", zip_bytes, "application/zip")},
        data={"kind": "line-centreline"},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["filePath"].startswith("uploads/")

    centreline_response = client.post(
        "/line/centreline",
        json={"filePath": body["filePath"], "projectCrs": {"kind": "epsg", "epsgCode": 3057}},
    )
    assert centreline_response.status_code == 200
    assert len(centreline_response.json()["vertices"]) == 3


def test_upload_endpoint_rejects_a_non_zip_file_for_line_centreline_kind(workspace_with_fixtures):
    response = client.post(
        "/workspace/upload",
        files={"file": ("notes.pol", b"not a shapefile", "application/octet-stream")},
        data={"kind": "line-centreline"},
    )
    assert response.status_code == 422
