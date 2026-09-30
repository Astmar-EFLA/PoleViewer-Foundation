"""
Terrain from a DEM (GeoTIFF elevation raster) -- ÍslandsDEM, Lantmäteriet
Markhöjdmodell, ArcticDEM, ... -- as an alternative to a LAS point cloud.

Each raster cell inside the clip boundary becomes one terrain point at its
cell centre with its own, unchanged value: nothing is resampled or
interpolated here (the TIN the frontend builds from these points does the
only interpolation, exactly as for LAS). A DEM in another CRS than the
project (e.g. ArcticDEM's EPSG:3413) has its cell *centres* transformed to
the project CRS -- positions move, values do not.

Only the window around the mast is ever read from disk (plus one cell of
margin), never the whole raster, so a country-sized DEM costs a few KB.

The result is the same ClipResult a point-cloud clip returns, so the
frontend builds the terrain from either the same way.
"""

from __future__ import annotations

import math
import time
from pathlib import Path

import numpy as np
import shapely
from osgeo import gdal, osr
from pyproj import CRS, Transformer
from shapely import wkt as shapely_wkt

from app.domain.coordinates import CoordinateReferenceSystem, CrsEpsg, CrsExplicit, CrsUnknown
from app.geometry.clip_boundary import rectangular_clip_polygon_wkt
from app.geometry.coordinate_transform import project_to_local_array
from app.processing.las_inspect import GROUND_CLASSIFICATION_CODE
from app.schemas.dem import DemClipRequest, DemExtent, DemMetadata
from app.schemas.pointcloud import (
    ClassificationCount,
    ClipProcessingMetadata,
    ClipResult,
    ClipResultPoint,
    ProcessingWarning,
)
from app.services.limits import check_dem_extension, max_returned_point_count
from app.validation.coverage import mast_outside_extent_warning

gdal.UseExceptions()


class DemReadError(RuntimeError):
    """The file could not be opened or read as a single-band elevation raster."""


class DemClipBlockedError(RuntimeError):
    """A blocking condition prevents the clip (unknown project CRS, ellipsoidal heights without a geoid height, ...)."""

    def __init__(self, warnings: list[ProcessingWarning]):
        self.warnings = warnings
        super().__init__("DEM clip blocked: " + "; ".join(w.message for w in warnings if w.severity == "blocking"))


def _open(file_path: Path) -> gdal.Dataset:
    check_dem_extension(file_path)
    try:
        dataset = gdal.Open(str(file_path), gdal.GA_ReadOnly)
    except RuntimeError as exc:
        raise DemReadError(f"Could not open {file_path.name} as a raster: {exc}") from exc
    if dataset is None or dataset.RasterCount < 1:
        raise DemReadError(f"{file_path.name} has no raster band.")
    return dataset


def _dataset_crs(dataset: gdal.Dataset) -> tuple[CoordinateReferenceSystem, bool, str | None]:
    """(horizontal CRS, is it a local/engineering CRS, vertical CRS name if the file records one)."""
    srs = dataset.GetSpatialRef()
    if srs is None:
        return CrsUnknown(), False, None
    vertical = srs.GetAttrValue("VERT_CS") if srs.IsCompound() else None
    if srs.IsLocal():
        return CrsExplicit(definition=srs.ExportToWkt()), True, vertical
    horizontal = srs.Clone()
    if srs.IsCompound():
        horizontal.StripVertical()
    try:
        horizontal.AutoIdentifyEPSG()
    except RuntimeError:
        pass
    code = horizontal.GetAuthorityCode(None)
    if horizontal.GetAuthorityName(None) == "EPSG" and code:
        return CrsEpsg(epsg_code=int(code)), False, vertical
    return CrsExplicit(definition=horizontal.ExportToWkt()), False, vertical


def _geotransform(dataset: gdal.Dataset, name: str) -> tuple[float, float, float, float]:
    gt = dataset.GetGeoTransform()
    if gt[2] != 0 or gt[4] != 0:
        raise DemReadError(f"{name} is a rotated/sheared raster, which is not supported -- warp it to north-up first.")
    return gt[0], gt[1], gt[3], gt[5]


def inspect_dem(file_path: Path) -> DemMetadata:
    dataset = _open(file_path)
    x0, dx, y0, dy = _geotransform(dataset, file_path.name)
    width, height = dataset.RasterXSize, dataset.RasterYSize
    crs, is_local, vertical = _dataset_crs(dataset)
    xs, ys = (x0, x0 + dx * width), (y0, y0 + dy * height)

    warnings: list[ProcessingWarning] = []
    if isinstance(crs, CrsUnknown) or is_local:
        warnings.append(
            ProcessingWarning(
                code="dem.crs-not-defined",
                severity="warning",
                message="The DEM has no usable horizontal CRS; its coordinates will be assumed to be in the project CRS.",
            )
        )
    return DemMetadata(
        file_path=str(file_path),
        width_px=width,
        height_px=height,
        pixel_size_x_m=abs(dx),
        pixel_size_y_m=abs(dy),
        extent=DemExtent(min_easting=min(xs), max_easting=max(xs), min_northing=min(ys), max_northing=max(ys)),
        crs=crs,
        nodata_value=dataset.GetRasterBand(1).GetNoDataValue(),
        vertical_crs_name=vertical,
        warnings=warnings,
    )


def _pyproj_crs(crs: CoordinateReferenceSystem) -> CRS:
    if isinstance(crs, CrsEpsg):
        return CRS.from_epsg(crs.epsg_code)
    assert isinstance(crs, CrsExplicit)
    return CRS.from_wkt(crs.definition)


def clip_dem(file_path: Path, request: DemClipRequest) -> ClipResult:
    start = time.perf_counter()
    dataset = _open(file_path)
    x0, dx, y0, dy = _geotransform(dataset, file_path.name)
    dem_crs, dem_is_local, _vertical = _dataset_crs(dataset)
    warnings: list[ProcessingWarning] = []
    blocking: list[ProcessingWarning] = []

    if isinstance(request.project_crs, CrsUnknown):
        blocking.append(
            ProcessingWarning(
                code="dem.project-crs-unknown",
                severity="blocking",
                message="Project CRS is not set; cannot place the DEM relative to the mast.",
            )
        )
    if request.height_reference == "ellipsoidal" and request.geoid_height_m is None:
        blocking.append(
            ProcessingWarning(
                code="dem.geoid-height-required",
                severity="blocking",
                message=(
                    "The DEM is set to ellipsoidal heights, which need the geoid height N at the site to become "
                    "heights above sea level (H = h - N). Enter N in the Terrain panel."
                ),
            )
        )
    if blocking:
        raise DemClipBlockedError(blocking)

    # Project CRS -> DEM CRS, unless the DEM has no usable CRS of its own (then it is taken to *be* the project CRS).
    same_crs = dem_is_local or isinstance(dem_crs, CrsUnknown) or dem_crs == request.project_crs
    if dem_is_local or isinstance(dem_crs, CrsUnknown):
        label = f"EPSG:{request.project_crs.epsg_code}" if isinstance(request.project_crs, CrsEpsg) else "the project CRS"
        warnings.append(
            ProcessingWarning(
                code="dem.local-crs-assumed-project",
                severity="warning",
                message=f"The DEM has no usable CRS of its own, so its coordinates were assumed to be in {label}.",
            )
        )
    to_dem = to_project = None
    if not same_crs:
        project_crs, raster_crs = _pyproj_crs(request.project_crs), _pyproj_crs(dem_crs)
        to_dem = Transformer.from_crs(project_crs, raster_crs, always_xy=True)
        to_project = Transformer.from_crs(raster_crs, project_crs, always_xy=True)
        warnings.append(
            ProcessingWarning(
                code="dem.reprojected",
                severity="information",
                message=(
                    f"The DEM is in {raster_crs.name}; its cell centres were transformed to {project_crs.name}. "
                    "Heights are unchanged."
                ),
            )
        )

    boundary = request.boundary
    polygon = shapely_wkt.loads(
        rectangular_clip_polygon_wkt(
            boundary.center_offset_local.x,
            boundary.center_offset_local.y,
            boundary.width_m,
            boundary.length_m,
            boundary.rotation_radians,
            request.local_frame,
        )
    )
    corners = np.asarray(polygon.exterior.coords)
    ce, cn = (to_dem.transform(corners[:, 0], corners[:, 1]) if to_dem else (corners[:, 0], corners[:, 1]))

    mast = request.local_frame.mast_centre_project
    me, mn = to_dem.transform(mast.easting, mast.northing) if to_dem else (mast.easting, mast.northing)
    width, height = dataset.RasterXSize, dataset.RasterYSize
    xs, ys = (x0, x0 + dx * width), (y0, y0 + dy * height)
    outside = mast_outside_extent_warning("dem", "DEM", min(xs), max(xs), min(ys), max(ys), me, mn)
    if outside:
        warnings.append(outside)

    # Pixel window covering the (DEM-CRS) clip polygon, with one cell of margin, clamped to the raster.
    cols = (np.asarray(ce) - x0) / dx
    rows = (np.asarray(cn) - y0) / dy
    col0 = max(0, math.floor(cols.min()) - 1)
    col1 = min(width, math.ceil(cols.max()) + 1)
    row0 = max(0, math.floor(rows.min()) - 1)
    row1 = min(height, math.ceil(rows.max()) + 1)

    points: list[ClipResultPoint] = []
    source_cells = 0
    nodata_cells = 0
    if col1 > col0 and row1 > row0:
        band = dataset.GetRasterBand(1)
        window = band.ReadAsArray(col0, row0, col1 - col0, row1 - row0).astype(np.float64)
        source_cells = window.size
        cc, rr = np.meshgrid(np.arange(col0, col1) + 0.5, np.arange(row0, row1) + 0.5)
        cell_e = x0 + cc * dx
        cell_n = y0 + rr * dy
        values = window
        valid = np.isfinite(values)
        nodata = band.GetNoDataValue()
        if nodata is not None:
            valid &= values != nodata
        nodata_cells = int((~valid).sum())
        cell_e, cell_n, values = cell_e[valid], cell_n[valid], values[valid]
        if to_project is not None and cell_e.size:
            cell_e, cell_n = to_project.transform(cell_e, cell_n)
            cell_e, cell_n = np.asarray(cell_e), np.asarray(cell_n)
        inside = shapely.contains_xy(polygon, cell_e, cell_n)
        cell_e, cell_n, values = cell_e[inside], cell_n[inside], values[inside]

        if request.height_reference == "ellipsoidal":
            values = values - float(request.geoid_height_m or 0.0)

        limit = max_returned_point_count()
        if values.size > limit:
            raise DemClipBlockedError(
                [
                    ProcessingWarning(
                        code="dem.result-too-large",
                        severity="blocking",
                        message=f"{values.size} DEM cells fall inside the clip boundary, over the limit of {limit}.",
                    )
                ]
            )
        lx, ly, lz = project_to_local_array(cell_e, cell_n, values, request.local_frame)
        points = [
            ClipResultPoint(x=float(x), y=float(y), z=float(z), classification=GROUND_CLASSIFICATION_CODE)
            for x, y, z in zip(lx.tolist(), ly.tolist(), lz.tolist())
        ]

    if request.height_reference == "ellipsoidal":
        warnings.append(
            ProcessingWarning(
                code="dem.ellipsoidal-heights-corrected",
                severity="warning",
                message=(
                    f"DEM heights are ellipsoidal; a geoid height of N = {request.geoid_height_m:.2f} m was subtracted "
                    "(H = h - N). Confirm N for this site against the national geoid model."
                ),
            )
        )
    if nodata_cells:
        warnings.append(
            ProcessingWarning(
                code="dem.nodata-cells-skipped",
                severity="information",
                message=f"{nodata_cells} no-data cell(s) in the read window were skipped.",
            )
        )
    if not points:
        warnings.append(
            ProcessingWarning(
                code="dem.clip-empty",
                severity="warning",
                message="No DEM cells fall inside the clip boundary. Check the mast centre, clip extent and project CRS.",
            )
        )
    warnings.append(
        ProcessingWarning(
            code="dem.derived-surface",
            severity="information",
            message=(
                "Terrain built from DEM cells, not measured points: each vertex is a cell value "
                f"({abs(dx):.2f} m cells). A surface model (e.g. ArcticDEM) can include trees and buildings."
            ),
        )
    )

    return ClipResult(
        points=points,
        source_point_count=source_cells,
        clipped_point_count=len(points),
        returned_point_count=len(points),
        classification_counts=(
            [ClassificationCount(classification_code=GROUND_CLASSIFICATION_CODE, point_count=len(points))] if points else []
        ),
        warnings=warnings,
        processing_metadata=ClipProcessingMetadata(
            file_path=str(file_path),
            boundary=boundary,
            classification_filter=None,
            decimation_step=None,
            duration_ms=(time.perf_counter() - start) * 1000.0,
        ),
    )
