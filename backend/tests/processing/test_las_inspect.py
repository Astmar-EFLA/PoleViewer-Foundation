import pytest

from app.domain.coordinates import CrsEpsg, CrsUnknown
from app.processing.las_inspect import inspect_las


def test_inspect_reports_correct_point_count_and_bounds(workspace_with_fixtures):
    path = workspace_with_fixtures / "pointcloud-mixed-classification.las"
    metadata = inspect_las(path)

    assert metadata.point_count == 1646  # 1296 ground + 250 vegetation + 100 unclassified

    assert metadata.bounds_project.min_easting == pytest.approx(512_310.678, abs=1e-3)
    assert metadata.bounds_project.max_easting == pytest.approx(512_380.678, abs=1e-3)
    assert metadata.bounds_project.min_northing == pytest.approx(487_619.321, abs=1e-3)
    assert metadata.bounds_project.max_northing == pytest.approx(487_689.321, abs=1e-3)


def test_inspect_extracts_epsg_crs_from_file_header(workspace_with_fixtures):
    path = workspace_with_fixtures / "pointcloud-mixed-classification.las"
    metadata = inspect_las(path)

    assert isinstance(metadata.crs, CrsEpsg)
    assert metadata.crs.epsg_code == 3057


def test_inspect_reports_classification_histogram(workspace_with_fixtures):
    path = workspace_with_fixtures / "pointcloud-mixed-classification.las"
    metadata = inspect_las(path)

    counts_by_code = {c.classification_code: c.point_count for c in metadata.classification_counts}
    assert counts_by_code == {0: 100, 2: 1296, 5: 250}


def test_inspect_detects_ground_classification_present_no_warning(workspace_with_fixtures):
    path = workspace_with_fixtures / "pointcloud-mixed-classification.las"
    metadata = inspect_las(path)

    codes = {w.code for w in metadata.warnings}
    assert "pointcloud.no-ground-classification" not in codes
    assert "pointcloud.missing-crs" not in codes


def test_inspect_reports_rgb_and_return_info_availability(workspace_with_fixtures):
    path = workspace_with_fixtures / "pointcloud-mixed-classification.las"
    metadata = inspect_las(path)

    assert metadata.has_rgb is True
    assert metadata.has_return_information is True


def test_inspect_assumes_isn93_for_a_file_with_no_crs_reported_not_silent(workspace_with_fixtures):
    path = workspace_with_fixtures / "pointcloud-no-crs.las"
    metadata = inspect_las(path)

    assert isinstance(metadata.crs, CrsEpsg)
    assert metadata.crs.epsg_code == 3057
    warning_codes = {w.code for w in metadata.warnings}
    assert "pointcloud.assumed-crs" in warning_codes
    # The assumption is reported, not blocking -- processing can still proceed.
    assert not any(w.code == "pointcloud.assumed-crs" and w.severity == "blocking" for w in metadata.warnings)


def test_inspect_reports_no_ground_classification_when_the_dimension_exists_but_is_all_zero(workspace_with_fixtures):
    path = workspace_with_fixtures / "pointcloud-no-ground-classification.las"
    metadata = inspect_las(path)

    # Unlike the no-Classification-dimension case above, this fixture DOES
    # have real per-point classification data (all zero) -- it's reported
    # honestly, not overwritten to claim ground that was never observed.
    counts_by_code = {c.classification_code: c.point_count for c in metadata.classification_counts}
    assert counts_by_code == {0: metadata.point_count}
    assert any(w.code == "pointcloud.no-ground-classification" for w in metadata.warnings)
    assert not any(w.code == "pointcloud.assumed-ground-classification" for w in metadata.warnings)


def test_inspect_scale_and_offset_are_scalars_not_las_header_replicated_lists(workspace_with_fixtures):
    # Regression guard: PDAL's full pipeline.metadata sometimes reports
    # scale_x/offset_x etc. as repeated-value lists (an artifact of how
    # metadata is aggregated across stages); quickinfo's per-reader
    # metadata does not have this problem. This test protects against
    # accidentally switching back to the wrong metadata source.
    path = workspace_with_fixtures / "pointcloud-mixed-classification.las"
    metadata = inspect_las(path)

    assert metadata.scale == (0.001, 0.001, 0.001)
    assert metadata.offset == pytest.approx((512_345.678, 487_654.321, 123.456), abs=1e-6)
