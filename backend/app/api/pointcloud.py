from __future__ import annotations

from fastapi import APIRouter, HTTPException

from app.processing.las_clip import ClipBlockedError, clip_las
from app.processing.las_inspect import LasReadError, inspect_las
from app.schemas.pointcloud import ClipRequest, ClipResult, InspectRequest, PointCloudMetadata
from app.services.limits import ProcessingLimitError
from app.services.workspace import WorkspacePathError, resolve_workspace_path

router = APIRouter(prefix="/pointcloud", tags=["pointcloud"])


def _resolve_existing_file(file_path: str):
    try:
        path = resolve_workspace_path(file_path)
    except WorkspacePathError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    if not path.is_file():
        raise HTTPException(status_code=404, detail=f"File not found in workspace: {file_path}")
    return path


@router.post("/inspect", response_model=PointCloudMetadata)
def inspect(request: InspectRequest) -> PointCloudMetadata:
    path = _resolve_existing_file(request.file_path)
    try:
        return inspect_las(path)
    except (LasReadError, ProcessingLimitError) as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.post("/clip", response_model=ClipResult)
def clip(request: ClipRequest) -> ClipResult:
    path = _resolve_existing_file(request.file_path)
    try:
        return clip_las(path, request)
    except ClipBlockedError as exc:
        raise HTTPException(
            status_code=422,
            detail={
                "message": str(exc),
                "warnings": [w.model_dump(by_alias=True) for w in exc.warnings],
            },
        ) from exc
    except (LasReadError, ProcessingLimitError) as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
