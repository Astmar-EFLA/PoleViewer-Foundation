"""
Restricts all backend file access to one approved workspace root (spec:
"restrict backend file handling to an approved workspace", "do not trust
paths supplied by the frontend"). Every endpoint that takes a file path from
a request must resolve it through `resolve_workspace_path` -- never open a
frontend-supplied path directly.
"""

from __future__ import annotations

import hashlib
import os
from pathlib import Path


class WorkspacePathError(ValueError):
    """Raised when a requested path is outside the approved workspace, or otherwise invalid."""


def get_workspace_root() -> Path:
    """
    The workspace root is configured via the POLE_VIEWER_WORKSPACE_ROOT
    environment variable; defaults to backend/workspace so a fresh checkout
    works without extra setup. Never derived from request input.
    """
    configured = os.environ.get("POLE_VIEWER_WORKSPACE_ROOT")
    if configured:
        root = Path(configured)
    else:
        root = Path(__file__).resolve().parents[2] / "workspace"
    root.mkdir(parents=True, exist_ok=True)
    return root.resolve()


def resolve_workspace_path(relative_path: str) -> Path:
    """
    Resolves a path requested by the frontend against the approved
    workspace, rejecting `..` traversal and any result that would land
    outside the workspace root (including via a symlink) -- a wrong or
    malicious `filePath` in a request must fail loudly, not silently read
    (or write) somewhere unexpected.

    Normally `relative_path` is workspace-relative, joined onto the root
    below. An *absolute* path is also accepted, but only if it already
    resolves inside the configured workspace root -- e.g. a whole-line CSV
    exported straight from a GIS system with each mast's model as an
    absolute path, where the operator has pointed
    POLE_VIEWER_WORKSPACE_ROOT at that same folder so the CSV can be used
    unmodified. This grants no new access: the same relative_to(root) check
    below still rejects any absolute path outside root, exactly as before.
    """
    if not relative_path or not relative_path.strip():
        raise WorkspacePathError("filePath must not be empty.")

    candidate = Path(relative_path)
    root = get_workspace_root()
    resolved = candidate.resolve() if candidate.is_absolute() else (root / candidate).resolve()

    try:
        resolved.relative_to(root)
    except ValueError as exc:
        raise WorkspacePathError(
            f"filePath resolves outside the approved workspace: {relative_path!r}"
        ) from exc

    return resolved


_HASH_CHUNK_SIZE = 1024 * 1024


def compute_sha256(path: Path) -> str:
    """
    Streams the file in chunks rather than reading it whole -- LAS/LAZ point
    clouds can be large, and this must not load an entire source file into
    memory just to detect whether it changed.
    """
    digest = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(_HASH_CHUNK_SIZE), b""):
            digest.update(chunk)
    return digest.hexdigest()
