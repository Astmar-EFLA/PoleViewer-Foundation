from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.pointcloud import router as pointcloud_router
from app.api.workspace import router as workspace_router

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
