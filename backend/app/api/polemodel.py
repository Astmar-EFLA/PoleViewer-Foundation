from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException

from app.domain.pole_model import PoleModel
from app.processing.pol_import import PolImportError, parse_pol
from app.schemas.camel_model import CamelModel
from app.services.limits import ProcessingLimitError, check_file_size, check_pole_model_extension
from app.services.workspace import WorkspacePathError, resolve_workspace_path

router = APIRouter(prefix="/polemodel", tags=["polemodel"])


class PoleModelImportRequest(CamelModel):
    file_path: str


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


@router.post("/import", response_model=PoleModel, response_model_exclude_none=True)
def import_pole_model(request: PoleModelImportRequest) -> PoleModel:
    try:
        path = resolve_workspace_path(request.file_path)
    except WorkspacePathError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    if not path.is_file():
        raise HTTPException(status_code=404, detail=f"File not found in workspace: {request.file_path}")

    try:
        check_pole_model_extension(path)
        check_file_size(path)
    except ProcessingLimitError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    try:
        return parse_pol(path, _now_iso())
    except PolImportError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
