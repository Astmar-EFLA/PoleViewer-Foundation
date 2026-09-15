import logging
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from app.api.pointcloud import router as pointcloud_router
from app.api.workspace import router as workspace_router

logger = logging.getLogger("pole_viewer")

app = FastAPI(title="Pole/Tower Viewer Backend", version="0.1.0")

# The frontend dev server (Vite, localhost:5173) is a different origin from
# this backend (localhost:8100), so the browser preflights every POST with
# an OPTIONS request; without CORS middleware that preflight gets a bare
# 405 and the browser blocks the real request before it's even sent. This
# is a local-only backend (ADR-001) reachable only from the machine's own
# loopback interface, so the origin allowlist is scoped to the known local
# dev server addresses rather than a wildcard.
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(pointcloud_router)
app.include_router(workspace_router)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    """
    Catches anything that escapes a route handler (Phase 9 "improved error
    handling"): logs the real exception server-side for diagnosis, but
    returns a generic, consistent JSON body to the client -- never a raw
    Python traceback, which could leak file paths or internals to the
    browser. "Local-only" (ADR-001) is not a reason to skip basic error
    hygiene: malformed input must fail visibly to the user without ever
    exposing server internals.
    """
    logger.exception("Unhandled exception on %s %s", request.method, request.url.path)
    return JSONResponse(status_code=500, content={"detail": "An unexpected server error occurred."})


# --- Packaged (built-frontend) mode ---------------------------------------
# See docs/architecture/ADR-011-packaging-strategy.md. If the frontend has
# been built (`npm run build` in frontend/), this backend also serves it
# directly -- one process, one port, no CORS needed -- instead of requiring
# `vite` as a second dev-only process. Mounted last (after every API
# route above) so it only ever catches requests none of those routes
# matched; a plain `npm run dev` workflow (two processes, CORS enabled
# above) is unaffected whether or not a build happens to exist on disk.
_FRONTEND_DIST = Path(__file__).resolve().parents[2] / "frontend" / "dist"
if _FRONTEND_DIST.is_dir():
    app.mount("/", StaticFiles(directory=_FRONTEND_DIST, html=True), name="frontend")
