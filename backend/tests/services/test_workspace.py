import pytest

from app.services.workspace import WorkspacePathError, resolve_workspace_path


@pytest.fixture()
def workspace_root(tmp_path, monkeypatch):
    monkeypatch.setenv("POLE_VIEWER_WORKSPACE_ROOT", str(tmp_path))
    return tmp_path


def test_resolves_a_simple_relative_path_inside_the_workspace(workspace_root):
    resolved = resolve_workspace_path("sample.las")
    assert resolved == (workspace_root / "sample.las").resolve()


def test_resolves_a_nested_relative_path_inside_the_workspace(workspace_root):
    resolved = resolve_workspace_path("uploads/2026/sample.las")
    assert resolved == (workspace_root / "uploads" / "2026" / "sample.las").resolve()


def test_rejects_an_absolute_path(workspace_root):
    with pytest.raises(WorkspacePathError):
        resolve_workspace_path("C:/Windows/System32/config/SAM")


def test_rejects_dot_dot_traversal_outside_the_workspace(workspace_root):
    with pytest.raises(WorkspacePathError):
        resolve_workspace_path("../../../etc/passwd")


def test_rejects_dot_dot_traversal_even_when_it_looks_like_it_stays_inside(workspace_root):
    # Escapes and re-enters textually, but must still be rejected: the
    # check is on the resolved path, not a naive string scan for "..".
    with pytest.raises(WorkspacePathError):
        resolve_workspace_path("subdir/../../outside.las")


def test_rejects_empty_path(workspace_root):
    with pytest.raises(WorkspacePathError):
        resolve_workspace_path("")


def test_rejects_whitespace_only_path(workspace_root):
    with pytest.raises(WorkspacePathError):
        resolve_workspace_path("   ")
