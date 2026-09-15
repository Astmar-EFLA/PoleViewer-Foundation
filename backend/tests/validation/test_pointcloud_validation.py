from app.domain.coordinates import CrsEpsg, CrsExplicit, CrsUnknown
from app.validation.pointcloud_validation import crs_consistency_warnings


def test_matching_epsg_codes_produce_no_warnings():
    warnings = crs_consistency_warnings(CrsEpsg(epsg_code=3057), CrsEpsg(epsg_code=3057))
    assert warnings == []


def test_mismatched_epsg_codes_are_blocking():
    warnings = crs_consistency_warnings(CrsEpsg(epsg_code=3057), CrsEpsg(epsg_code=25832))
    assert len(warnings) == 1
    assert warnings[0].code == "pointcloud.crs-mismatch"
    assert warnings[0].severity == "blocking"


def test_unknown_project_crs_is_blocking_even_if_file_crs_is_known():
    warnings = crs_consistency_warnings(CrsEpsg(epsg_code=3057), CrsUnknown())
    assert len(warnings) == 1
    assert warnings[0].code == "pointcloud.project-crs-unknown"
    assert warnings[0].severity == "blocking"


def test_unknown_file_crs_is_blocking_even_if_project_crs_is_known():
    warnings = crs_consistency_warnings(CrsUnknown(), CrsEpsg(epsg_code=3057))
    assert len(warnings) == 1
    assert warnings[0].code == "pointcloud.file-crs-unknown"
    assert warnings[0].severity == "blocking"


def test_both_unknown_is_blocking_on_project_crs_first():
    warnings = crs_consistency_warnings(CrsUnknown(), CrsUnknown())
    assert len(warnings) == 1
    assert warnings[0].code == "pointcloud.project-crs-unknown"


def test_explicit_crs_text_is_flagged_as_warning_not_silently_trusted():
    warnings = crs_consistency_warnings(CrsExplicit(definition="+proj=lcc ..."), CrsEpsg(epsg_code=3057))
    assert len(warnings) == 1
    assert warnings[0].code == "pointcloud.crs-not-epsg-comparable"
    assert warnings[0].severity == "warning"
