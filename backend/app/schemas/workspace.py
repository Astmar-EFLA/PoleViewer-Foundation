"""
Request/response schemas for generic workspace-asset status checks (spec
section 19/ADR-008: moved or hash-mismatched assets must be explicitly
detected and surfaced, never silently re-linked). Deliberately not
point-cloud-specific -- any registered asset type can be checked the same
way.
"""

from __future__ import annotations

from app.schemas.camel_model import CamelModel


class FileStatusRequest(CamelModel):
    file_path: str


class FileStatusResult(CamelModel):
    file_path: str
    exists: bool
    size_bytes: int | None
    sha256: str | None


class UploadResult(CamelModel):
    """Result of POST /workspace/upload. `file_path` is workspace-relative,
    ready to pass straight into /polemodel/import or /pointcloud/inspect."""

    file_path: str
    original_file_name: str
    size_bytes: int
