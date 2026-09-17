import pytest
from PIL import Image

from app.processing.orthophoto_import import (
    OrthophotoImportError,
    parse_world_file,
    register_orthophoto,
    render_display_jpeg,
)


def test_disables_pillows_decompression_bomb_pixel_limit():
    """
    A real orthophoto covering a transmission line corridor is routinely
    well over Pillow's default ~179-megapixel decompression-bomb threshold
    (see orthophoto_import.py's module-level comment for why file size,
    already checked before this module runs, is the real guard here).
    Regression check: importing this module must not leave Pillow's default
    limit in place, or a real orthophoto gets rejected before this app ever
    gets to look at it.
    """
    assert Image.MAX_IMAGE_PIXELS is None


def test_parse_world_file_reads_the_six_affine_coefficients_in_order():
    text = "0.5\n0.0\n0.0\n-0.5\n512300.0\n487700.0\n"
    world_file = parse_world_file(text)
    assert world_file.pixel_size_x == 0.5
    assert world_file.rotation_y == 0.0
    assert world_file.rotation_x == 0.0
    assert world_file.pixel_size_y == -0.5
    assert world_file.upper_left_x == 512300.0
    assert world_file.upper_left_y == 487700.0


def test_parse_world_file_tolerates_blank_lines():
    text = "0.5\n\n0.0\n0.0\n\n-0.5\n512300.0\n487700.0\n\n"
    world_file = parse_world_file(text)
    assert world_file.pixel_size_x == 0.5


def test_parse_world_file_rejects_wrong_line_count():
    with pytest.raises(OrthophotoImportError, match="6 non-blank lines"):
        parse_world_file("0.5\n0.0\n0.0\n-0.5\n512300.0\n")


def test_parse_world_file_rejects_non_numeric_content():
    with pytest.raises(OrthophotoImportError, match="non-numeric"):
        parse_world_file("0.5\n0.0\n0.0\n-0.5\nnot-a-number\n487700.0\n")


def test_parse_world_file_rejects_a_degenerate_zero_determinant_transform():
    # Both pixel sizes zero -> the affine transform can't map anything.
    with pytest.raises(OrthophotoImportError, match="degenerate"):
        parse_world_file("0.0\n0.0\n0.0\n0.0\n512300.0\n487700.0\n")


def test_register_orthophoto_reads_dimensions_and_warns_about_assumed_crs(tmp_path):
    from PIL import Image

    image_path = tmp_path / "ortho.jpg"
    Image.new("RGB", (8, 6), (0, 128, 0)).save(image_path, "JPEG")
    world_file_path = tmp_path / "ortho.jgw"
    world_file_path.write_text("0.5\n0.0\n0.0\n-0.5\n512300.0\n487700.0\n", encoding="utf-8")

    result = register_orthophoto(image_path, world_file_path, image_url="/orthophoto/image?filePath=ortho.jpg")

    assert result.image_width_px == 8
    assert result.image_height_px == 6
    assert result.world_file.pixel_size_x == 0.5
    assert any(w.code == "orthophoto.assumed-crs-matches-project" for w in result.warnings)


def test_register_orthophoto_raises_when_world_file_is_missing(tmp_path):
    from PIL import Image

    image_path = tmp_path / "ortho.jpg"
    Image.new("RGB", (4, 4), (0, 0, 0)).save(image_path, "JPEG")

    with pytest.raises(OrthophotoImportError, match="World file not found"):
        register_orthophoto(image_path, tmp_path / "missing.jgw", image_url="/orthophoto/image?filePath=ortho.jpg")


def test_render_display_jpeg_passes_through_an_image_already_within_the_limit(tmp_path):
    image_path = tmp_path / "ortho.jpg"
    Image.new("RGB", (100, 50), (0, 128, 0)).save(image_path, "JPEG")

    from io import BytesIO

    jpeg_bytes = render_display_jpeg(image_path, max_dimension=200)
    with Image.open(BytesIO(jpeg_bytes)) as img:
        assert img.size == (100, 50)


def test_render_display_jpeg_downscales_an_oversized_image_preserving_aspect_ratio(tmp_path):
    image_path = tmp_path / "ortho.jpg"
    Image.new("RGB", (100, 50), (0, 128, 0)).save(image_path, "JPEG")

    from io import BytesIO

    jpeg_bytes = render_display_jpeg(image_path, max_dimension=40)
    with Image.open(BytesIO(jpeg_bytes)) as img:
        # thumbnail() fits within (40, 40) preserving the 2:1 aspect ratio.
        assert img.size == (40, 20)


def test_register_orthophoto_warns_when_the_source_exceeds_the_texture_limit(tmp_path, monkeypatch):
    monkeypatch.setenv("POLE_VIEWER_MAX_ORTHOPHOTO_TEXTURE_PX", "50")

    image_path = tmp_path / "ortho.jpg"
    Image.new("RGB", (100, 50), (0, 128, 0)).save(image_path, "JPEG")
    world_file_path = tmp_path / "ortho.jgw"
    world_file_path.write_text("0.5\n0.0\n0.0\n-0.5\n512300.0\n487700.0\n", encoding="utf-8")

    result = register_orthophoto(image_path, world_file_path, image_url="/orthophoto/image?filePath=ortho.jpg")

    assert any(w.code == "orthophoto.downscaled-for-display" for w in result.warnings)
    # The *reported* dimensions are always the source's own -- the UV math
    # (geometry/orthophotoUv.ts) is defined against these, not the served
    # (possibly downscaled) image.
    assert result.image_width_px == 100
    assert result.image_height_px == 50


def test_register_orthophoto_does_not_warn_when_within_the_texture_limit(tmp_path, monkeypatch):
    monkeypatch.setenv("POLE_VIEWER_MAX_ORTHOPHOTO_TEXTURE_PX", "4096")

    image_path = tmp_path / "ortho.jpg"
    Image.new("RGB", (100, 50), (0, 128, 0)).save(image_path, "JPEG")
    world_file_path = tmp_path / "ortho.jgw"
    world_file_path.write_text("0.5\n0.0\n0.0\n-0.5\n512300.0\n487700.0\n", encoding="utf-8")

    result = register_orthophoto(image_path, world_file_path, image_url="/orthophoto/image?filePath=ortho.jpg")

    assert not any(w.code == "orthophoto.downscaled-for-display" for w in result.warnings)
