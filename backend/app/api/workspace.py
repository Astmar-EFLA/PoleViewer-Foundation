from __future__ import annotations

from fastapi import APIRouter, HTTPException

from app.schemas.workspace import FileStatusRequest, FileStatusResult
from app.services.workspace import WorkspacePathError, compute_sha256, resolve_workspace_path

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
