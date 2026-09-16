from __future__ import annotations

from fastapi import APIRouter, HTTPException

from app.processing.shapefile_import import ShapefileReadError, extract_centreline
from app.schemas.line import CentrelineRequest, CentrelineResult
from app.services.limits import ProcessingLimitError, check_file_size, check_line_centreline_extension
from app.services.workspace import WorkspacePathError, resolve_workspace_path

router = APIRouter(prefix="/line", tags=["line"])


@router.post("/centreline", response_model=CentrelineResult)
def centreline(request: CentrelineRequest) -> CentrelineResult:
    try:
        path = resolve_workspace_path(request.file_path)
    except WorkspacePathError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    if not path.is_file():
        raise HTTPException(status_code=404, detail=f"File not found in workspace: {request.file_path}")

    try:
        check_line_centreline_extension(path)
        check_file_size(path)
    except ProcessingLimitError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    try:
        return extract_centreline(path.read_bytes(), request.project_crs)
    except ShapefileReadError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
