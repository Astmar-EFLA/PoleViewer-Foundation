from fastapi import FastAPI

from app.api.pointcloud import router as pointcloud_router

app = FastAPI(title="Pole/Tower Viewer Backend", version="0.1.0")
app.include_router(pointcloud_router)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
