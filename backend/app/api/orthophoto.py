from __future__ import annotations

import hashlib
from urllib.parse import quote

from fastapi import APIRouter, HTTPException, Response

from app.processing.orthophoto_import import (
    OrthophotoImportError,
    register_orthophoto,
    render_display_jpeg,
    serialize_world_file,
)
from app.processing.world_imagery import WorldImageryError, build_world_imagery_orthophoto
from app.schemas.orthophoto import OrthophotoRegisterRequest, OrthophotoRegisterResult, WorldImageryRequest
from app.schemas.pointcloud import ProcessingWarning
from app.services.limits import (
    ProcessingLimitError,
    check_file_size,
    check_orthophoto_image_extension,
    check_world_imagery_request,
)
from app.services.workspace import WorkspacePathError, get_workspace_root, resolve_workspace_path

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
def image(filePath: str) -> Response:
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

    # Downscaled to fit a WebGL texture limit, not served raw -- see
    # render_display_jpeg's docstring. The source file itself is untouched;
    # only what's sent over the wire here is resized.
    try:
        jpeg_bytes = render_display_jpeg(path)
    except OrthophotoImportError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    return Response(content=jpeg_bytes, media_type="image/jpeg")


def _world_imagery_cache_key(request: WorldImageryRequest) -> str:
    """Deterministic per-request cache key -- an identical fetch (same mast, extent, zoom) is served from disk instead of re-hitting the imagery service every time a mast is re-selected."""
    raw = "|".join(
        [
            f"{request.centre_easting:.2f}",
            f"{request.centre_northing:.2f}",
            request.project_crs.model_dump_json(),
            f"{request.width_m:.1f}",
            f"{request.height_m:.1f}",
            str(request.zoom),
        ]
    )
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()[:24]


@router.post("/world-imagery", response_model=OrthophotoRegisterResult)
def world_imagery(request: WorldImageryRequest) -> OrthophotoRegisterResult:
    """
    Fetches and reprojects Esri World Imagery tiles for a square area around
    a project coordinate (app/processing/world_imagery.py), caches the
    result under the workspace, and registers it through the same path a
    locally-supplied orthophoto uses -- the frontend calls this exactly like
    /register and gets the identical response shape back.
    """
    try:
        check_world_imagery_request(request.width_m, request.height_m, request.zoom)
    except ProcessingLimitError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    cache_dir = get_workspace_root() / "world-imagery-cache"
    cache_dir.mkdir(parents=True, exist_ok=True)
    cache_key = _world_imagery_cache_key(request)
    image_path = cache_dir / f"{cache_key}.jpg"
    world_file_path = cache_dir / f"{cache_key}.jgw"

    if not image_path.is_file() or not world_file_path.is_file():
        try:
            built = build_world_imagery_orthophoto(
                request.centre_easting,
                request.centre_northing,
                request.project_crs,
                request.width_m,
                request.height_m,
                request.zoom,
            )
        except WorldImageryError as exc:
            raise HTTPException(status_code=502, detail=str(exc)) from exc
        image_path.write_bytes(built.jpeg_bytes)
        world_file_path.write_text(serialize_world_file(built.world_file), encoding="utf-8")

    relative_image_path = image_path.relative_to(get_workspace_root()).as_posix()
    image_url = f"/orthophoto/image?filePath={quote(relative_image_path)}"

    try:
        # This backend did the reprojection itself using the project's own
        # declared CRS -- unlike a locally-supplied world file, there's no
        # CRS assumption to warn about here.
        registered = register_orthophoto(image_path, world_file_path, image_url, crs_already_verified=True)
    except OrthophotoImportError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    attribution_warning = ProcessingWarning(
        code="orthophoto.world-imagery-attribution",
        severity="information",
        message=(
            "Imagery: Esri, Maxar, Earthstar Geographics, and the GIS User Community. For visualisation only -- "
            "not a substitute for a licensed survey or verified orthophoto."
        ),
    )
    return OrthophotoRegisterResult(
        image_url=registered.image_url,
        image_width_px=registered.image_width_px,
        image_height_px=registered.image_height_px,
        world_file=registered.world_file,
        warnings=[attribution_warning, *registered.warnings],
    )
