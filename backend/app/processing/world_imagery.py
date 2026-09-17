"""
Builds a synthetic orthophoto (JPEG + world file) by fetching and
reprojecting Esri World Imagery basemap tiles for a square area around a
project coordinate. The result is handed to the exact same registration
path a locally-supplied orthophoto goes through
(app/processing/orthophoto_import.py's register_orthophoto -- see
api/orthophoto.py's /world-imagery route), so the frontend needs no new
rendering code at all: as far as it's concerned, this is just another
orthophoto.

This is the one place in this backend that reaches the internet -- every
other endpoint is local-only (ADR-001). Only ever called when the user
explicitly asks for it (a button click), never automatically.

Approach: rather than fetching Web Mercator tiles and warping the whole
raster (a real image-reprojection problem), the output image is built
pixel-by-pixel *in project-space* -- for every output pixel, its real-world
(easting, northing) is reprojected to (lon, lat) and then to a Web Mercator
tile/pixel address, which is sampled (nearest-neighbour) from the fetched
tiles. This is exact (not an approximation) and means the output image's
own pixel grid is a plain axis-aligned affine transform of project space,
so it can be described with an ordinary OrthophotoWorldFile like any other
orthophoto -- no new georeferencing representation needed.
"""

from __future__ import annotations

import math
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from io import BytesIO
from typing import Callable

import numpy as np
import pyproj
from PIL import Image

from app.domain.coordinates import CoordinateReferenceSystem, CrsEpsg, CrsExplicit
from app.schemas.orthophoto import OrthophotoWorldFile

TILE_SIZE_PX = 256
TILE_URL_TEMPLATE = "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
ATTRIBUTION = "Esri, Maxar, Earthstar Geographics, and the GIS User Community"
_FETCH_TIMEOUT_S = 10
_MAX_FETCH_WORKERS = 8


class WorldImageryError(RuntimeError):
    """Raised when the imagery service can't be reached/parsed, or the project CRS can't be reprojected to WGS84."""


def _crs_to_pyproj(project_crs: CoordinateReferenceSystem) -> pyproj.CRS:
    if isinstance(project_crs, CrsEpsg):
        return pyproj.CRS.from_epsg(project_crs.epsg_code)
    if isinstance(project_crs, CrsExplicit):
        return pyproj.CRS.from_user_input(project_crs.definition)
    raise WorldImageryError(
        'The project\'s CRS is not set (still "unknown") -- world imagery needs a real coordinate '
        "system to reproject from."
    )


def resolution_m_per_px(zoom: int, lat_deg: float) -> float:
    """Native Web Mercator ground resolution at the given zoom/latitude -- reported alongside the result, not used to decide fetching (the output grid is driven directly by width_m/height_m)."""
    return 156543.03392 * math.cos(math.radians(lat_deg)) / (2**zoom)


def _mercator_tile_frac(lon_deg: np.ndarray, lat_deg: np.ndarray, zoom: int) -> tuple[np.ndarray, np.ndarray]:
    """Fractional Web Mercator XYZ tile (x, y) for arrays of lon/lat -- the integer part is the tile index, the fractional part times TILE_SIZE_PX is the pixel within that tile."""
    lat_rad = np.radians(lat_deg)
    n = 2.0**zoom
    x = (lon_deg + 180.0) / 360.0 * n
    y = (1.0 - np.arcsinh(np.tan(lat_rad)) / np.pi) / 2.0 * n
    return x, y


def default_fetch_tile(zoom: int, tile_x: int, tile_y: int) -> np.ndarray:
    """The real HTTP fetcher -- a separate, injectable function (see build_world_imagery_orthophoto's fetch_tile_fn parameter) so tests can supply synthetic tiles instead of making real network calls."""
    url = TILE_URL_TEMPLATE.format(z=zoom, x=tile_x, y=tile_y)
    try:
        with urllib.request.urlopen(url, timeout=_FETCH_TIMEOUT_S) as response:
            data = response.read()
    except urllib.error.URLError as exc:
        raise WorldImageryError(f"Could not reach the imagery service ({exc.reason}). Check your internet connection.") from exc
    try:
        with Image.open(BytesIO(data)) as img:
            return np.array(img.convert("RGB"))
    except Exception as exc:  # Pillow raises a range of exceptions for unreadable image data
        raise WorldImageryError(
            f"Imagery service returned unreadable data for tile z={zoom} x={tile_x} y={tile_y}: {exc}"
        ) from exc


@dataclass
class WorldImageryResult:
    jpeg_bytes: bytes
    world_file: OrthophotoWorldFile
    attribution: str
    resolution_m_per_px: float
    width_px: int
    height_px: int


def build_world_imagery_orthophoto(
    centre_easting: float,
    centre_northing: float,
    project_crs: CoordinateReferenceSystem,
    width_m: float,
    height_m: float,
    zoom: int,
    fetch_tile_fn: Callable[[int, int, int], np.ndarray] = default_fetch_tile,
) -> WorldImageryResult:
    transformer = pyproj.Transformer.from_crs(_crs_to_pyproj(project_crs), "EPSG:4326", always_xy=True)
    centre_lon, centre_lat = transformer.transform(centre_easting, centre_northing)

    pixel_size_m = resolution_m_per_px(zoom, centre_lat)
    width_px = max(1, round(width_m / pixel_size_m))
    height_px = max(1, round(height_m / pixel_size_m))

    # The true bounding-box edge -- the world file's own upper_left_x/y is
    # the *pixel-centre* convention (see orthophoto_import.py's
    # parse_world_file), a half-pixel inset from this edge.
    upper_left_edge_easting = centre_easting - width_m / 2
    upper_left_edge_northing = centre_northing + height_m / 2

    col = np.arange(width_px)
    row = np.arange(height_px)
    pixel_centre_eastings = upper_left_edge_easting + (col + 0.5) * pixel_size_m
    pixel_centre_northings = upper_left_edge_northing - (row + 0.5) * pixel_size_m
    easting_grid, northing_grid = np.meshgrid(pixel_centre_eastings, pixel_centre_northings)

    lon_grid, lat_grid = transformer.transform(easting_grid, northing_grid)
    x_frac, y_frac = _mercator_tile_frac(lon_grid, lat_grid, zoom)
    tile_x = np.floor(x_frac).astype(np.int64)
    tile_y = np.floor(y_frac).astype(np.int64)
    px_in_tile = np.clip(((x_frac - tile_x) * TILE_SIZE_PX).astype(np.int64), 0, TILE_SIZE_PX - 1)
    py_in_tile = np.clip(((y_frac - tile_y) * TILE_SIZE_PX).astype(np.int64), 0, TILE_SIZE_PX - 1)

    unique_tiles = {(int(tx), int(ty)) for tx, ty in zip(tile_x.ravel(), tile_y.ravel())}
    tiles: dict[tuple[int, int], np.ndarray] = {}
    # Fetching is pure network I/O -- a thread pool gets real wall-clock
    # speedup here despite Python's GIL, since urlopen releases it while
    # waiting on the socket.
    with ThreadPoolExecutor(max_workers=_MAX_FETCH_WORKERS) as pool:
        futures = {pool.submit(fetch_tile_fn, zoom, tx, ty): (tx, ty) for tx, ty in unique_tiles}
        for future, (tx, ty) in futures.items():
            tiles[(tx, ty)] = future.result()

    output = np.zeros((height_px, width_px, 3), dtype=np.uint8)
    for (tx, ty), tile_arr in tiles.items():
        mask = (tile_x == tx) & (tile_y == ty)
        output[mask] = tile_arr[py_in_tile[mask], px_in_tile[mask]]

    image = Image.fromarray(output, "RGB")
    buffer = BytesIO()
    image.save(buffer, format="JPEG", quality=90)

    world_file = OrthophotoWorldFile(
        pixel_size_x=pixel_size_m,
        rotation_y=0.0,
        rotation_x=0.0,
        pixel_size_y=-pixel_size_m,
        upper_left_x=upper_left_edge_easting + pixel_size_m / 2,
        upper_left_y=upper_left_edge_northing - pixel_size_m / 2,
    )

    return WorldImageryResult(
        jpeg_bytes=buffer.getvalue(),
        world_file=world_file,
        attribution=ATTRIBUTION,
        resolution_m_per_px=pixel_size_m,
        width_px=width_px,
        height_px=height_px,
    )
