from __future__ import annotations

from fastapi import APIRouter, HTTPException

from app.api.pointcloud import _resolve_existing_file
from app.processing.dem import DemClipBlockedError, DemReadError, clip_dem, inspect_dem
from app.schemas.dem import DemClipRequest, DemInspectRequest, DemMetadata
from app.schemas.pointcloud import ClipResult
from app.services.limits import ProcessingLimitError

router = APIRouter(prefix="/dem", tags=["dem"])


@router.post("/inspect", response_model=DemMetadata)
def inspect(request: DemInspectRequest) -> DemMetadata:
    path = _resolve_existing_file(request.file_path)
    try:
        return inspect_dem(path)
    except (DemReadError, ProcessingLimitError) as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.post("/clip", response_model=ClipResult)
def clip(request: DemClipRequest) -> ClipResult:
    """Same response shape as /pointcloud/clip -- a blocked clip is a 422 with {message, warnings}, as there."""
    path = _resolve_existing_file(request.file_path)
    try:
        return clip_dem(path, request)
    except DemClipBlockedError as exc:
        raise HTTPException(
            status_code=422,
            detail={
                "message": str(exc),
                "warnings": [w.model_dump(by_alias=True) for w in exc.warnings],
            },
        ) from exc
    except (DemReadError, ProcessingLimitError) as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
