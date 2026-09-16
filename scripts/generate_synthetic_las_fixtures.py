"""
Generates synthetic LAS test fixtures for the Phase 2 point-cloud backend.
Run with the laspy-equipped interpreter (see backend/requirements/dev.txt).
All output is clearly labelled synthetic (in the file itself has no such
concept, so labelling lives in the accompanying README and in every test
that loads these files) -- these are not real survey data.

Uses the same ISN93-scale mast centre as the frontend's Phase 1 demo
project (512345.678 E, 487654.321 N, 123.456 El) for narrative consistency
across the two phases, though the two fixture sets are otherwise
independent (frontend terrain fixtures are already-local synthetic points;
these are raw project-space LAS files, proving the backend's PDAL pipeline
end to end).
"""

import math
import random

import laspy
import numpy as np
import pyproj

MAST_EASTING = 512_345.678
MAST_NORTHING = 487_654.321
MAST_ELEVATION = 123.456

OUTPUT_DIR = "fixtures/synthetic"


def build_mixed_classification_fixture() -> None:
    """
    70x70 m ground grid (2 m spacing) around the mast centre, classification
    2 (ground), on a plane sloping in the Easting direction -- deliberately
    wider than the default 40x40 m clip so points both inside and outside
    the default clip exist in one file. Adds scattered "vegetation" points
    (classification 5) above the ground and some unclassified points
    (classification 0), so classification-listing/selection has real
    variety to report.
    """
    random.seed(20260915)

    xs, ys, zs, classifications = [], [], [], []

    half_extent = 35.0
    step = 2.0
    slope = 0.04  # 4% grade in the Easting direction

    x = -half_extent
    while x <= half_extent + 1e-9:
        y = -half_extent
        while y <= half_extent + 1e-9:
            easting = MAST_EASTING + x
            northing = MAST_NORTHING + y
            elevation = MAST_ELEVATION + slope * x
            xs.append(easting)
            ys.append(northing)
            zs.append(elevation)
            classifications.append(2)  # ground
            y += step
        x += step

    ground_count = len(xs)

    # Vegetation scattered above ground, within the same footprint.
    for _ in range(250):
        x = random.uniform(-half_extent, half_extent)
        y = random.uniform(-half_extent, half_extent)
        ground_z = MAST_ELEVATION + slope * x
        height = random.uniform(0.5, 6.0)
        xs.append(MAST_EASTING + x)
        ys.append(MAST_NORTHING + y)
        zs.append(ground_z + height)
        classifications.append(5)  # high vegetation

    # Unclassified scattered points.
    for _ in range(100):
        x = random.uniform(-half_extent, half_extent)
        y = random.uniform(-half_extent, half_extent)
        ground_z = MAST_ELEVATION + slope * x
        height = random.uniform(0.0, 2.0)
        xs.append(MAST_EASTING + x)
        ys.append(MAST_NORTHING + y)
        zs.append(ground_z + height)
        classifications.append(0)  # unclassified

    header = laspy.LasHeader(point_format=3, version="1.2")
    header.scales = np.array([0.001, 0.001, 0.001])
    header.offsets = np.array([MAST_EASTING, MAST_NORTHING, MAST_ELEVATION])
    # ISN93 / EPSG:3057, matching the frontend demo project's example CRS.
    header.add_crs(pyproj.CRS.from_epsg(3057))

    las = laspy.LasData(header)
    las.x = np.array(xs)
    las.y = np.array(ys)
    las.z = np.array(zs)
    las.classification = np.array(classifications, dtype=np.uint8)
    las.red = np.zeros(len(xs), dtype=np.uint16)
    las.green = np.zeros(len(xs), dtype=np.uint16)
    las.blue = np.zeros(len(xs), dtype=np.uint16)

    out_path = f"{OUTPUT_DIR}/pointcloud-mixed-classification.las"
    las.write(out_path)
    print(
        f"wrote {out_path}: {len(xs)} points "
        f"({ground_count} ground, 250 vegetation, 100 unclassified)"
    )


def build_no_crs_fixture() -> None:
    """A tiny LAS file with no spatial reference set, for the missing-file-CRS validation test."""
    header = laspy.LasHeader(point_format=0, version="1.2")
    header.scales = np.array([0.01, 0.01, 0.01])
    header.offsets = np.array([MAST_EASTING, MAST_NORTHING, MAST_ELEVATION])

    las = laspy.LasData(header)
    n = 25
    las.x = MAST_EASTING + np.linspace(-5, 5, n)
    las.y = MAST_NORTHING + np.linspace(-5, 5, n)
    las.z = MAST_ELEVATION + np.zeros(n)
    las.classification = np.full(n, 2, dtype=np.uint8)

    out_path = f"{OUTPUT_DIR}/pointcloud-no-crs.las"
    las.write(out_path)
    print(f"wrote {out_path}: {n} points, no SRS set")


def build_no_ground_classification_fixture() -> None:
    """
    A tiny LAS file with a real CRS but every point left classification 0
    ("created, never classified") -- a realistic export from a
    scan/photogrammetry pipeline that never ran a ground-classification
    step. Isolates the "no usable classification data" scenario from the
    "no CRS" one (build_no_crs_fixture), for the assumed-ground-for-clip
    fallback test.
    """
    header = laspy.LasHeader(point_format=0, version="1.2")
    header.scales = np.array([0.01, 0.01, 0.01])
    header.offsets = np.array([MAST_EASTING, MAST_NORTHING, MAST_ELEVATION])
    header.add_crs(pyproj.CRS.from_epsg(3057))

    las = laspy.LasData(header)
    n = 25
    las.x = MAST_EASTING + np.linspace(-5, 5, n)
    las.y = MAST_NORTHING + np.linspace(-5, 5, n)
    las.z = MAST_ELEVATION + np.zeros(n)
    las.classification = np.zeros(n, dtype=np.uint8)

    out_path = f"{OUTPUT_DIR}/pointcloud-no-ground-classification.las"
    las.write(out_path)
    print(f"wrote {out_path}: {n} points, all classification 0 (no ground)")


if __name__ == "__main__":
    build_mixed_classification_fixture()
    build_no_crs_fixture()
    build_no_ground_classification_fixture()
