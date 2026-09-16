from __future__ import annotations

import uuid
from pathlib import Path
from typing import Literal

from fastapi import APIRouter, File, Form, HTTPException, UploadFile

from app.schemas.workspace import FileStatusRequest, FileStatusResult, UploadResult
from app.services.limits import (
    ProcessingLimitError,
    check_file_size,
    check_line_centreline_extension,
    check_point_cloud_extension,
    check_pole_model_extension,
)
from app.services.workspace import WorkspacePathError, compute_sha256, get_workspace_root, resolve_workspace_path

router = APIRouter(prefix="/workspace", tags=["workspace"])


@router.post("/file-status", response_model=FileStatusResult)
def file_status(request: FileStatusRequest) -> FileStatusResult:
    try:
        path = resolve_workspace_path(request.file_path)
    except WorkspacePathError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    # A missing asset is an expected, reportable state (spec: "handle moved
    # or missing source files explicitly"), not a request error -- callers
    # ask "what is the current status of this reference", and a clean 200
    # with exists=false is that answer, not a 404.
    if not path.is_file():
        return FileStatusResult(file_path=request.file_path, exists=False, size_bytes=None, sha256=None)

    return FileStatusResult(
        file_path=request.file_path,
        exists=True,
        size_bytes=path.stat().st_size,
        sha256=compute_sha256(path),
    )


_UPLOAD_CHUNK_SIZE = 1024 * 1024


@router.post("/upload", response_model=UploadResult)
async def upload(
    file: UploadFile = File(...),
    kind: Literal["pole-model", "point-cloud", "line-centreline"] = Form(...),
) -> UploadResult:
    """
    Lets the frontend hand over a file picked via a native file-open dialog
    (rather than requiring it to already sit in the backend's workspace by
    filename -- see ADR-012's follow-up). The uploaded bytes land under
    workspace/uploads/, uuid-prefixed so two uploads can never collide or
    silently overwrite one another; the returned `filePath` is then used
    exactly like any other workspace-relative path, unmodified, by the
    existing /polemodel/import or /pointcloud/inspect endpoints.
    """
    original_name = Path(file.filename or "upload").name  # strip any client-supplied path components
    uploads_dir = get_workspace_root() / "uploads"
    uploads_dir.mkdir(parents=True, exist_ok=True)
    target_path = uploads_dir / f"{uuid.uuid4().hex}-{original_name}"

    with target_path.open("wb") as out:
        while chunk := await file.read(_UPLOAD_CHUNK_SIZE):
            out.write(chunk)

    try:
        if kind == "pole-model":
            check_pole_model_extension(target_path)
        elif kind == "point-cloud":
            check_point_cloud_extension(target_path)
        else:
            check_line_centreline_extension(target_path)
        check_file_size(target_path)
    except ProcessingLimitError as exc:
        target_path.unlink(missing_ok=True)
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    return UploadResult(
        # .as_posix() so the wire format is always forward-slash, regardless
        # of the host OS -- matches every other workspace-relative filePath
        # this backend hands back or accepts.
        file_path=target_path.relative_to(get_workspace_root()).as_posix(),
        original_file_name=original_name,
        size_bytes=target_path.stat().st_size,
    )
