"""
Request/response schemas for the whole-line centreline import
(app/processing/shapefile_import.py, POST /line/centreline).
"""

from __future__ import annotations

from app.domain.coordinates import CoordinateReferenceSystem
from app.schemas.camel_model import CamelModel
from app.schemas.pointcloud import ProcessingWarning


class CentrelineRequest(CamelModel):
    file_path: str
    project_crs: CoordinateReferenceSystem


class CentrelineVertex(CamelModel):
    easting: float
    northing: float


class CentrelineResult(CamelModel):
    vertices: list[CentrelineVertex]
    warnings: list[ProcessingWarning]
