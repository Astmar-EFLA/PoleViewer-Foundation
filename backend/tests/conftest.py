import shutil
from pathlib import Path

import pytest

FIXTURES_DIR = Path(__file__).resolve().parents[2] / "fixtures" / "synthetic"
FIXTURE_FILES = ["pointcloud-mixed-classification.las", "pointcloud-no-crs.las"]


@pytest.fixture()
def workspace_with_fixtures(tmp_path, monkeypatch):
    """
    Copies the synthetic LAS fixtures into an isolated temp workspace and
    points POLE_VIEWER_WORKSPACE_ROOT at it, so processing/API tests run
    against real files through the same workspace-security path every
    request goes through -- never a shortcut that bypasses it.
    """
    monkeypatch.setenv("POLE_VIEWER_WORKSPACE_ROOT", str(tmp_path))
    for name in FIXTURE_FILES:
        shutil.copy(FIXTURES_DIR / name, tmp_path / name)
    return tmp_path
