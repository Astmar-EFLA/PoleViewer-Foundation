import pytest

from app.domain.coordinates import CrsEpsg, LocalFrameDefinition, ProjectCoordinate
from app.processing.las_clip import ClipBlockedError, clip_las
from app.schemas.pointcloud import ClipRequest, LocalOffsetXY, RectangularClipBoundary

MAST = ProjectCoordinate(easting=512_345.678, northing=487_654.321, elevation=123.456)


def frame(bearing_radians: float = 0.0, mast=MAST) -> LocalFrameDefinition:
    return LocalFrameDefinition(mast_centre_project=mast, line_bearing_radians=bearing_radians)


def base_request(**overrides) -> ClipRequest:
    defaults = dict(
        file_path="pointcloud-mixed-classification.las",
        project_crs=CrsEpsg(epsg_code=3057),
        local_frame=frame(),
        boundary=RectangularClipBoundary(),
    )
    defaults.update(overrides)
    return ClipRequest(**defaults)


def test_default_40x40_ground_only_clip_returns_exactly_the_known_grid_points(workspace_with_fixtures):
    # The ground grid is regular (2m spacing, values at every odd integer
    # from -35 to 35 in each axis around the mast), so the count inside a
    # centred, axis-aligned 40x40 box is exactly countable: odd values in
    # [-19, 19] on each axis = 20 x 20 = 400. Verified against the real
    # PDAL clip before being hardcoded here (see probe output in the PR/
    # session history) -- not an assumed number.
    path = workspace_with_fixtures / "pointcloud-mixed-classification.las"
    result = clip_las(path, base_request(classification_filter=[2]))

    assert result.clipped_point_count == 400
    assert result.returned_point_count == 400
    assert result.warnings == []

    xs = [p.x for p in result.points]
    ys = [p.y for p in result.points]
    assert min(xs) == pytest.approx(-19.0, abs=1e-6)
    assert max(xs) == pytest.approx(19.0, abs=1e-6)
    assert min(ys) == pytest.approx(-19.0, abs=1e-6)
    assert max(ys) == pytest.approx(19.0, abs=1e-6)


def test_points_outside_the_clip_area_are_excluded(workspace_with_fixtures):
    path = workspace_with_fixtures / "pointcloud-mixed-classification.las"
    result = clip_las(path, base_request(classification_filter=[2]))

    # The source ground grid spans local x/y in [-35, 35]; a 40x40 clip
    # (half-extent 20) must exclude every point beyond that, in particular
    # the known outer ring at +-35/+-33/etc.
    for p in result.points:
        assert -20.0 <= p.x <= 20.0
        assert -20.0 <= p.y <= 20.0


def test_default_clip_all_classifications_preserves_classification_codes(workspace_with_fixtures):
    path = workspace_with_fixtures / "pointcloud-mixed-classification.las"
    result = clip_las(path, base_request())

    counts_by_code = {c.classification_code: c.point_count for c in result.classification_counts}
    assert counts_by_code[2] == 400
    assert set(counts_by_code.keys()) <= {0, 2, 5}
    assert result.clipped_point_count == sum(counts_by_code.values())

    point_codes = {p.classification for p in result.points}
    assert point_codes <= {0, 2, 5}


def test_decimation_reduces_returned_points_but_not_clipped_count(workspace_with_fixtures):
    path = workspace_with_fixtures / "pointcloud-mixed-classification.las"
    result = clip_las(path, base_request(classification_filter=[2], decimation_step=4))

    assert result.clipped_point_count == 400  # true clip size, independent of decimation
    assert result.returned_point_count == 100  # 400 / 4


def test_classification_filter_matching_nothing_is_reported_not_hidden(workspace_with_fixtures):
    path = workspace_with_fixtures / "pointcloud-mixed-classification.las"
    result = clip_las(path, base_request(classification_filter=[6]))  # class 6 (building) does not exist in this fixture

    assert result.clipped_point_count == 0
    assert result.returned_point_count == 0
    assert any(w.code == "pointcloud.clip-empty" for w in result.warnings)


def test_mast_outside_point_cloud_bounds_yields_empty_result_with_warning(workspace_with_fixtures):
    path = workspace_with_fixtures / "pointcloud-mixed-classification.las"
    far_mast = ProjectCoordinate(easting=MAST.easting + 10_000, northing=MAST.northing, elevation=MAST.elevation)
    result = clip_las(path, base_request(local_frame=frame(mast=far_mast)))

    assert result.clipped_point_count == 0
    assert any(w.code == "pointcloud.clip-empty" for w in result.warnings)


def test_crs_mismatch_blocks_processing_rather_than_silently_clipping(workspace_with_fixtures):
    path = workspace_with_fixtures / "pointcloud-mixed-classification.las"
    with pytest.raises(ClipBlockedError) as excinfo:
        clip_las(path, base_request(project_crs=CrsEpsg(epsg_code=25832)))

    assert any(w.code == "pointcloud.crs-mismatch" for w in excinfo.value.warnings)


def test_missing_file_crs_is_assumed_isn93_and_clips_successfully_when_it_matches_the_project_crs(
    workspace_with_fixtures,
):
    path = workspace_with_fixtures / "pointcloud-no-crs.las"
    # base_request()'s default project_crs is already EPSG:3057 -- the same
    # value assumed for a file with no CRS of its own, so this succeeds.
    result = clip_las(path, base_request(file_path="pointcloud-no-crs.las"))

    assert result.clipped_point_count == 25  # every point in this fixture is within the default 40x40 clip
    assert any(w.code == "pointcloud.assumed-crs" for w in result.warnings)
    assert not any(w.severity == "blocking" for w in result.warnings)


def test_missing_file_crs_assumed_isn93_still_blocks_on_a_genuine_mismatch_with_the_project_crs(
    workspace_with_fixtures,
):
    path = workspace_with_fixtures / "pointcloud-no-crs.las"
    with pytest.raises(ClipBlockedError) as excinfo:
        clip_las(path, base_request(file_path="pointcloud-no-crs.las", project_crs=CrsEpsg(epsg_code=25832)))

    # Assuming EPSG:3057 for the file is not the same as ignoring the project's
    # own declared CRS -- a real conflict between the two must still block.
    assert any(w.code == "pointcloud.crs-mismatch" for w in excinfo.value.warnings)


def test_file_with_no_ground_classification_is_assumed_ground_rather_than_returning_empty(workspace_with_fixtures):
    path = workspace_with_fixtures / "pointcloud-no-ground-classification.las"
    result = clip_las(path, base_request(file_path="pointcloud-no-ground-classification.las", classification_filter=[2]))

    assert result.clipped_point_count == 25
    assert result.returned_point_count == 25
    assert any(w.code == "pointcloud.assumed-ground-for-clip" for w in result.warnings)
    # The points' real classification (0) is reported honestly, not rewritten to claim 2.
    assert {p.classification for p in result.points} == {0}


def test_file_with_no_ground_classification_and_a_non_ground_filter_still_reports_empty(workspace_with_fixtures):
    path = workspace_with_fixtures / "pointcloud-no-ground-classification.las"
    result = clip_las(path, base_request(file_path="pointcloud-no-ground-classification.las", classification_filter=[5]))

    # The assumption only kicks in for a filter that includes ground -- asking
    # for vegetation (5) on a file with no ground classification data at all
    # still correctly comes back empty, not silently reinterpreted as a match.
    assert result.clipped_point_count == 0
    assert any(w.code == "pointcloud.clip-empty" for w in result.warnings)


def test_rotated_clip_boundary_produces_a_different_point_set_than_axis_aligned(workspace_with_fixtures):
    path = workspace_with_fixtures / "pointcloud-mixed-classification.las"
    axis_aligned = clip_las(path, base_request(classification_filter=[2]))
    rotated = clip_las(
        path,
        base_request(
            classification_filter=[2],
            boundary=RectangularClipBoundary(rotation_radians=0.4),
        ),
    )

    axis_aligned_xy = {(round(p.x, 3), round(p.y, 3)) for p in axis_aligned.points}
    rotated_xy = {(round(p.x, 3), round(p.y, 3)) for p in rotated.points}
    assert axis_aligned_xy != rotated_xy


def test_center_offset_moves_the_clip_area(workspace_with_fixtures):
    path = workspace_with_fixtures / "pointcloud-mixed-classification.las"
    offset_result = clip_las(
        path,
        base_request(
            classification_filter=[2],
            boundary=RectangularClipBoundary(center_offset_local=LocalOffsetXY(x=15, y=0), width_m=10, length_m=10),
        ),
    )

    assert offset_result.clipped_point_count > 0
    for p in offset_result.points:
        assert 10.0 <= p.x <= 20.0
