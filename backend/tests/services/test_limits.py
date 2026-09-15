from pathlib import Path

import pytest

from app.services.limits import (
    ProcessingLimitError,
    check_file_size,
    check_point_cloud_extension,
    max_file_size_bytes,
    max_returned_point_count,
)


def test_max_file_size_bytes_defaults_to_500mb(monkeypatch):
    monkeypatch.delenv("POLE_VIEWER_MAX_FILE_SIZE_MB", raising=False)
    assert max_file_size_bytes() == 500 * 1024 * 1024


def test_max_file_size_bytes_reads_env_override(monkeypatch):
    monkeypatch.setenv("POLE_VIEWER_MAX_FILE_SIZE_MB", "10")
    assert max_file_size_bytes() == 10 * 1024 * 1024


def test_max_file_size_bytes_ignores_invalid_env_value(monkeypatch):
    monkeypatch.setenv("POLE_VIEWER_MAX_FILE_SIZE_MB", "not-a-number")
    assert max_file_size_bytes() == 500 * 1024 * 1024


def test_max_returned_point_count_defaults_to_2_million(monkeypatch):
    monkeypatch.delenv("POLE_VIEWER_MAX_RETURNED_POINTS", raising=False)
    assert max_returned_point_count() == 2_000_000


def test_check_file_size_passes_for_a_small_file(tmp_path, monkeypatch):
    monkeypatch.delenv("POLE_VIEWER_MAX_FILE_SIZE_MB", raising=False)
    f = tmp_path / "small.las"
    f.write_bytes(b"x" * 100)
    check_file_size(f)  # does not raise


def test_check_file_size_raises_when_over_the_configured_limit(tmp_path, monkeypatch):
    monkeypatch.setenv("POLE_VIEWER_MAX_FILE_SIZE_MB", "1")
    f = tmp_path / "big.las"
    f.write_bytes(b"x" * (2 * 1024 * 1024))
    with pytest.raises(ProcessingLimitError):
        check_file_size(f)


def test_check_point_cloud_extension_accepts_las_and_laz():
    check_point_cloud_extension(Path("file.las"))
    check_point_cloud_extension(Path("file.LAZ"))


def test_check_point_cloud_extension_rejects_other_extensions():
    with pytest.raises(ProcessingLimitError):
        check_point_cloud_extension(Path("file.txt"))
