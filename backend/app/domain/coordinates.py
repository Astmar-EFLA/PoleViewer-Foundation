"""
Coordinate space models mirroring frontend/src/domain/coordinates.ts. See
docs/architecture/coordinate-strategy.md for the authoritative definition
of each space and the transformation chain between them. Kept as a
line-for-line-equivalent port (same field names once camelCase-aliased, same
"space" discriminator literal) so the two language implementations are easy
to compare by eye, not just by matching test output.
"""

from __future__ import annotations

from typing import Literal, Union

from app.schemas.camel_model import CamelModel


class ProjectCoordinate(CamelModel):
    space: Literal["project"] = "project"
    easting: float
    northing: float
    elevation: float


class LocalCoordinate(CamelModel):
    space: Literal["local"] = "local"
    x: float
    y: float
    z: float


class CrsEpsg(CamelModel):
    kind: Literal["epsg"] = "epsg"
    epsg_code: int


class CrsExplicit(CamelModel):
    kind: Literal["explicit"] = "explicit"
    definition: str


class CrsUnknown(CamelModel):
    kind: Literal["unknown"] = "unknown"


CoordinateReferenceSystem = Union[CrsEpsg, CrsExplicit, CrsUnknown]


class LocalFrameDefinition(CamelModel):
    mast_centre_project: ProjectCoordinate
    line_bearing_radians: float
