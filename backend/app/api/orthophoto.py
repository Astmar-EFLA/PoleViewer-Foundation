from __future__ import annotations

from urllib.parse import quote

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse

from app.processing.orthophoto_import import OrthophotoImportError, register_orthophoto
from app.schemas.orthophoto import OrthophotoRegisterRequest, OrthophotoRegisterResult
from app.services.limits import ProcessingLimitError, check_file_size, check_orthophoto_image_extension
from app.services.workspace import WorkspacePathError, resolve_workspace_path

router = APIRouter(prefix="/orthophoto", tags=["orthophoto"])


def _default_world_file_path(image_path: str) -> str:
    """The standard JPEG-world-file convention: same basename, .jgw extension, same folder as the image."""
    if "." in image_path.rsplit("/", 1)[-1]:
        base, _, _ext = image_path.rpartition(".")
        return f"{base}.jgw"
    return f"{image_path}.jgw"


@router.post("/register", response_model=OrthophotoRegisterResult)
def register(request: OrthophotoRegisterRequest) -> OrthophotoRegisterResult:
    try:
        image_path = resolve_workspace_path(request.image_path)
        world_file_path = resolve_workspace_path(request.world_file_path or _default_world_file_path(request.image_path))
    except WorkspacePathError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    if not image_path.is_file():
        raise HTTPException(status_code=404, detail=f"File not found in workspace: {request.image_path}")

    try:
        check_orthophoto_image_extension(image_path)
        check_file_size(image_path)
    except ProcessingLimitError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    # The URL the frontend will load the texture from -- re-resolved and
    # re-validated independently by GET /orthophoto/image (never trusts this
    # request's own validation), same defence-in-depth as every other
    # workspace-file-serving path in this backend.
    image_url = f"/orthophoto/image?filePath={quote(request.image_path)}"

    try:
        return register_orthophoto(image_path, world_file_path, image_url)
    except OrthophotoImportError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.get("/image")
def image(filePath: str) -> FileResponse:
    try:
        path = resolve_workspace_path(filePath)
    except WorkspacePathError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    if not path.is_file():
        raise HTTPException(status_code=404, detail=f"File not found in workspace: {filePath}")

    try:
        check_orthophoto_image_extension(path)
        check_file_size(path)
    except ProcessingLimitError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    return FileResponse(path, media_type="image/jpeg")
