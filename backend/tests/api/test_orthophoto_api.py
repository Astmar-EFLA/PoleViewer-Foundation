from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_register_endpoint_finds_the_default_sidecar_world_file(workspace_with_fixtures):
    response = client.post("/orthophoto/register", json={"imagePath": "orthophoto.jpg"})
    assert response.status_code == 200
    body = response.json()
    assert body["imageWidthPx"] == 8
    assert body["imageHeightPx"] == 6
    assert body["worldFile"]["pixelSizeX"] == 0.5
    assert body["imageUrl"] == "/orthophoto/image?filePath=orthophoto.jpg"
    assert any(w["code"] == "orthophoto.assumed-crs-matches-project" for w in body["warnings"])


def test_register_endpoint_accepts_an_explicit_world_file_path(workspace_with_fixtures):
    # Simulates the browser-upload case, where the image and world file land
    # under different, unrelated (uuid-prefixed) filenames.
    (workspace_with_fixtures / "renamed.jpg").write_bytes((workspace_with_fixtures / "orthophoto.jpg").read_bytes())
    (workspace_with_fixtures / "other-name.jgw").write_text(
        (workspace_with_fixtures / "orthophoto.jgw").read_text(encoding="utf-8"), encoding="utf-8"
    )
    response = client.post(
        "/orthophoto/register", json={"imagePath": "renamed.jpg", "worldFilePath": "other-name.jgw"}
    )
    assert response.status_code == 200
    assert response.json()["imageWidthPx"] == 8


def test_register_endpoint_404_for_missing_image(workspace_with_fixtures):
    response = client.post("/orthophoto/register", json={"imagePath": "does-not-exist.jpg"})
    assert response.status_code == 404


def test_register_endpoint_422_when_world_file_is_missing(workspace_with_fixtures):
    (workspace_with_fixtures / "lonely.jpg").write_bytes((workspace_with_fixtures / "orthophoto.jpg").read_bytes())
    response = client.post("/orthophoto/register", json={"imagePath": "lonely.jpg"})
    assert response.status_code == 422
    assert "World file not found" in response.json()["detail"]


def test_register_endpoint_422_for_a_non_jpeg_extension(workspace_with_fixtures):
    (workspace_with_fixtures / "ortho.png").write_bytes(b"not really a png either")
    response = client.post("/orthophoto/register", json={"imagePath": "ortho.png"})
    assert response.status_code == 422
    assert "extension" in response.json()["detail"]


def test_register_endpoint_400_for_path_outside_workspace(workspace_with_fixtures):
    response = client.post("/orthophoto/register", json={"imagePath": "../outside.jpg"})
    assert response.status_code == 400


def test_image_endpoint_serves_a_valid_jpeg_matching_the_source_dimensions(workspace_with_fixtures):
    # Not byte-for-byte equal to the source file -- the endpoint re-encodes
    # (see render_display_jpeg) so the source's own dimensions (well under
    # the downscale threshold here) survive that round trip unchanged.
    from io import BytesIO

    from PIL import Image

    response = client.get("/orthophoto/image", params={"filePath": "orthophoto.jpg"})
    assert response.status_code == 200
    assert response.headers["content-type"] == "image/jpeg"
    with Image.open(BytesIO(response.content)) as img:
        assert img.size == (8, 6)


def test_image_endpoint_404_for_missing_file(workspace_with_fixtures):
    response = client.get("/orthophoto/image", params={"filePath": "does-not-exist.jpg"})
    assert response.status_code == 404


def test_image_endpoint_400_for_path_outside_workspace(workspace_with_fixtures):
    response = client.get("/orthophoto/image", params={"filePath": "../outside.jpg"})
    assert response.status_code == 400


def test_upload_then_register_end_to_end_for_an_image_outside_the_workspace_root(workspace_with_fixtures):
    """
    Reproduces the real scenario this upload path was added for: the
    orthophoto lives in a different folder than whatever is currently
    configured as POLE_VIEWER_WORKSPACE_ROOT, so a plain path reference
    404s -- uploading both files sidesteps that entirely.
    """
    image_bytes = (workspace_with_fixtures / "orthophoto.jpg").read_bytes()
    world_file_bytes = (workspace_with_fixtures / "orthophoto.jgw").read_bytes()

    image_upload = client.post(
        "/workspace/upload",
        files={"file": ("Blondulina-A-1-001.jpg", image_bytes, "image/jpeg")},
        data={"kind": "orthophoto-image"},
    )
    assert image_upload.status_code == 200
    image_path = image_upload.json()["filePath"]
    assert image_path.startswith("uploads/")

    world_file_upload = client.post(
        "/workspace/upload",
        files={"file": ("Blondulina-A-1-001.jgw", world_file_bytes, "text/plain")},
        data={"kind": "orthophoto-world-file"},
    )
    assert world_file_upload.status_code == 200
    world_file_path = world_file_upload.json()["filePath"]

    register_response = client.post(
        "/orthophoto/register", json={"imagePath": image_path, "worldFilePath": world_file_path}
    )
    assert register_response.status_code == 200
    assert register_response.json()["imageWidthPx"] == 8


def test_upload_endpoint_rejects_a_non_jpeg_file_for_orthophoto_image_kind(workspace_with_fixtures):
    response = client.post(
        "/workspace/upload",
        files={"file": ("notes.txt", b"not an image", "text/plain")},
        data={"kind": "orthophoto-image"},
    )
    assert response.status_code == 422


def test_upload_endpoint_rejects_a_non_jgw_file_for_orthophoto_world_file_kind(workspace_with_fixtures):
    response = client.post(
        "/workspace/upload",
        files={"file": ("notes.txt", b"not a world file", "text/plain")},
        data={"kind": "orthophoto-world-file"},
    )
    assert response.status_code == 422
