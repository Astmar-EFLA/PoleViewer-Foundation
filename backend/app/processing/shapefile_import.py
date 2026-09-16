"""
Extracts a transmission line's centreline from a zipped shapefile bundle
(.shp/.shx/.dbf[/.prj]) via pyshp, read directly from the zip's bytes in
memory -- never written to disk (same "no scratch files for a request that
doesn't need them" approach as the LAS pipeline). Only the polyline's own
X/Y (assumed already in project-space easting/northing -- see the
.prj-mismatch warning below) is used; elevation isn't needed for the
bearing calculation this feeds (frontend geometry/centreline.ts).
"""

from __future__ import annotations

import io
import zipfile

import shapefile as pyshp

from app.domain.coordinates import CoordinateReferenceSystem, CrsEpsg
from app.schemas.line import CentrelineResult, CentrelineVertex
from app.schemas.pointcloud import ProcessingWarning


class ShapefileReadError(RuntimeError):
    """Raised when the uploaded zip doesn't contain a readable polyline shapefile."""


def _find_component(names: dict[str, str], base_lower: str, extension: str) -> str | None:
    return names.get(f"{base_lower}{extension}")


def _detect_epsg_from_prj(prj_text: str) -> int | None:
    """Best-effort: a .prj is ESRI WKT, which doesn't always carry an explicit EPSG authority tag -- pyproj's own CRS-database matching is what makes this work for the common case, not text parsing."""
    try:
        import pyproj

        return pyproj.CRS.from_wkt(prj_text).to_epsg()
    except Exception:
        return None


def _largest_part(points: list[tuple[float, float]], parts: list[int]) -> list[tuple[float, float]]:
    """A polyline shape can have multiple disjoint "parts" (rings/sub-lines); the centreline is taken as the largest one by vertex count -- no multi-part stitching (spec decision, see the plan this was built from)."""
    boundaries = list(parts) + [len(points)]
    best: list[tuple[float, float]] = []
    for i in range(len(boundaries) - 1):
        segment = points[boundaries[i] : boundaries[i + 1]]
        if len(segment) > len(best):
            best = segment
    return best


def extract_centreline(zip_bytes: bytes, project_crs: CoordinateReferenceSystem) -> CentrelineResult:
    try:
        zf = zipfile.ZipFile(io.BytesIO(zip_bytes))
    except zipfile.BadZipFile as exc:
        raise ShapefileReadError(f"Could not read the uploaded file as a zip archive: {exc}") from exc

    names = {name.lower(): name for name in zf.namelist()}
    shp_name = next((name for lower, name in names.items() if lower.endswith(".shp")), None)
    if shp_name is None:
        raise ShapefileReadError("The zip archive does not contain a .shp file.")

    base_lower = shp_name[: -len(".shp")].lower()
    shx_name = _find_component(names, base_lower, ".shx")
    dbf_name = _find_component(names, base_lower, ".dbf")
    prj_name = _find_component(names, base_lower, ".prj")

    try:
        reader = pyshp.Reader(
            shp=io.BytesIO(zf.read(shp_name)),
            shx=io.BytesIO(zf.read(shx_name)) if shx_name else None,
            dbf=io.BytesIO(zf.read(dbf_name)) if dbf_name else None,
        )
    except Exception as exc:  # pyshp raises plain Exception/shapefile.ShapefileException for malformed input
        raise ShapefileReadError(f"Could not read the shapefile: {exc}") from exc

    if reader.shapeType not in (pyshp.POLYLINE, pyshp.POLYLINEZ, pyshp.POLYLINEM):
        raise ShapefileReadError(
            f"Expected a polyline shapefile (the line's centreline), got shape type {reader.shapeTypeName!r}."
        )

    shapes = reader.shapes()
    if not shapes:
        raise ShapefileReadError("The shapefile contains no shapes.")

    best_points: list[tuple[float, float]] = []
    for shape in shapes:
        candidate = _largest_part(list(shape.points), list(shape.parts))
        if len(candidate) > len(best_points):
            best_points = candidate

    if len(best_points) < 2:
        raise ShapefileReadError("The shapefile's centreline has fewer than 2 vertices.")

    warnings: list[ProcessingWarning] = []
    if prj_name:
        prj_text = zf.read(prj_name).decode("utf-8", errors="replace")
        detected_epsg = _detect_epsg_from_prj(prj_text)
        if detected_epsg is not None and isinstance(project_crs, CrsEpsg) and detected_epsg != project_crs.epsg_code:
            warnings.append(
                ProcessingWarning(
                    code="line.centreline-crs-mismatch",
                    severity="warning",
                    message=(
                        f"The shapefile's .prj declares EPSG:{detected_epsg}, which does not match "
                        f"the project CRS (EPSG:{project_crs.epsg_code}). Vertices are used as-is, "
                        "not reprojected -- verify they are really in the same coordinate system."
                    ),
                )
            )

    return CentrelineResult(
        vertices=[CentrelineVertex(easting=x, northing=y) for x, y in best_points],
        warnings=warnings,
    )
