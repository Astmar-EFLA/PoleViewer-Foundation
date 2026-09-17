import pytest

from app.processing.orthophoto_import import OrthophotoImportError, parse_world_file, register_orthophoto


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
