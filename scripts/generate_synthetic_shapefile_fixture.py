"""
Generates a small synthetic zipped-shapefile fixture for the whole-line
centreline import (app/processing/shapefile_import.py). A 3-vertex polyline
with a gentle bend, in EPSG:3057 (matching the other synthetic fixtures'
mast centre), zipped up exactly as a real GIS export would be
(.shp/.shx/.dbf/.prj bundled together).

Run with the laspy/pyproj/pyshp-equipped interpreter (backend/requirements/dev.txt).
"""

import io
import zipfile

import pyproj
import shapefile

MAST_EASTING = 512_345.678
MAST_NORTHING = 487_654.321

OUTPUT_PATH = "fixtures/synthetic/line-centreline.zip"

# A gentle bend passing near the mast centre -- deliberately not passing
# exactly through it, so nearest-point-on-polyline projection is genuinely
# exercised (not just "vertex 1 == the mast").
VERTICES = [
    (MAST_EASTING - 30.0, MAST_NORTHING - 5.0),
    (MAST_EASTING + 2.0, MAST_NORTHING + 1.0),
    (MAST_EASTING + 30.0, MAST_NORTHING + 12.0),
]


def build_shapefile_zip() -> bytes:
    shp_buf = io.BytesIO()
    shx_buf = io.BytesIO()
    dbf_buf = io.BytesIO()

    writer = shapefile.Writer(shp=shp_buf, shx=shx_buf, dbf=dbf_buf, shapeType=shapefile.POLYLINE)
    writer.field("name", "C", size=40)
    writer.line([VERTICES])
    writer.record(name="synthetic-line-centreline")
    writer.close()

    prj_text = pyproj.CRS.from_epsg(3057).to_wkt()

    zip_buf = io.BytesIO()
    with zipfile.ZipFile(zip_buf, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("line-centreline.shp", shp_buf.getvalue())
        zf.writestr("line-centreline.shx", shx_buf.getvalue())
        zf.writestr("line-centreline.dbf", dbf_buf.getvalue())
        zf.writestr("line-centreline.prj", prj_text)

    return zip_buf.getvalue()


if __name__ == "__main__":
    zip_bytes = build_shapefile_zip()
    with open(OUTPUT_PATH, "wb") as fh:
        fh.write(zip_bytes)
    print(f"wrote {OUTPUT_PATH}: {len(VERTICES)} vertices, EPSG:3057")
