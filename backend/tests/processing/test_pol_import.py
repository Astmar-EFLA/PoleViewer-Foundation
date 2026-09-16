from pathlib import Path

import pytest

from app.processing.pol_import import PolImportError, parse_pol

FIXTURES_DIR = Path(__file__).resolve().parents[3] / "fixtures" / "synthetic"
FIXTURE_PATH = FIXTURES_DIR / "pole-model-2leg.pol"
NOW = "2026-09-15T00:00:00.000Z"


def test_parses_leg_base_nodes_into_structural_legs_and_anchors():
    model = parse_pol(FIXTURE_PATH, NOW)

    leg_ids = {leg.id for leg in model.structural_legs}
    assert leg_ids == {"leg-la", "leg-lb"}

    leg_anchor_ids = {leg.linked_foundation_anchor_id for leg in model.structural_legs}
    anchor_by_id = {a.id: a for a in model.anchors}
    assert leg_anchor_ids <= anchor_by_id.keys()

    la = anchor_by_id["anchor-la-g"]
    assert la.anchor_type == "leg-to-foundation"
    assert (la.local_position.x, la.local_position.y, la.local_position.z) == (0.0, -3.0, 0.0)
    assert la.linked_leg_id == "leg-la"

    lb = anchor_by_id["anchor-lb-g"]
    assert (lb.local_position.x, lb.local_position.y, lb.local_position.z) == (0.0, 3.0, 0.0)


def test_calculates_mast_centre_as_leg_base_centroid_not_any_labelled_node():
    model = parse_pol(FIXTURE_PATH, NOW)
    anchor_by_id = {a.id: a for a in model.anchors}
    centre = anchor_by_id[model.mast_centre_anchor_id]

    # Leg bases are at y=-3 and y=3, both at x=0, z=0 -- centroid is the origin.
    assert (centre.local_position.x, centre.local_position.y, centre.local_position.z) == (0.0, 0.0, 0.0)
    assert centre.source.origin_type == "calculated"


def test_top_and_other_suffix_nodes_become_non_leg_anchors():
    model = parse_pol(FIXTURE_PATH, NOW)
    anchor_by_id = {a.id: a for a in model.anchors}

    top = anchor_by_id["anchor-la-t"]
    assert top.anchor_type == "guy-attachment"
    assert top.linked_leg_id is None


def test_dollar_gnd_labelled_node_becomes_a_guy_ground_anchor_distinct_from_the_elevated_attachment_point():
    model = parse_pol(FIXTURE_PATH, NOW)
    anchor_by_id = {a.id: a for a in model.anchors}

    ground = anchor_by_id["anchor-gnd1"]
    assert ground.anchor_type == "guy-ground-anchor"
    # The guy cable runs from "LA:t" (elevated, z=10) down to "$Gnd1" (ground, z=0) --
    # a foundation belongs at the ground node's own position, not the elevated one.
    assert (ground.local_position.x, ground.local_position.y, ground.local_position.z) == (0.0, -8.0, 0.0)

    top = anchor_by_id["anchor-la-t"]
    assert top.local_position.z != ground.local_position.z


def test_unrecognised_labelled_node_is_reported_in_warnings_not_imported_as_anchor():
    model = parse_pol(FIXTURE_PATH, NOW)
    anchor_ids = {a.id for a in model.anchors}
    assert not any("misc" in aid for aid in anchor_ids)
    assert any("Misc" in w for w in model.warnings)


def test_visual_geometry_classifies_structure_cable_and_insulator_members():
    model = parse_pol(FIXTURE_PATH, NOW)
    members = model.visual_geometry.members
    categories = {m.category for m in members}
    assert categories == {"structure", "cable", "insulator"}
    assert len(members) == 5


def test_visual_geometry_resolves_guy_size_and_insulator_string_property_from_elsewhere_in_the_file():
    model = parse_pol(FIXTURE_PATH, NOW)
    members = model.visual_geometry.members
    cable = next(m for m in members if m.category == "cable")
    assert cable.component == "2x14mm"
    insulator = next(m for m in members if m.category == "insulator")
    assert insulator.component == "1x12xU160BLP"


def test_visual_geometry_formats_a_beam_dimension_from_diameter_and_thickness():
    model = parse_pol(FIXTURE_PATH, NOW)
    beam = next(m for m in model.visual_geometry.members if "Tube 1" in m.component)
    assert "114.0" in beam.component
    assert "6.0" in beam.component


def test_schema_version_and_units_are_always_set_explicitly():
    model = parse_pol(FIXTURE_PATH, NOW)
    assert model.units == "m"
    assert model.coordinate_convention == "right-handed-x-transverse-y-longitudinal-z-up"


def test_raises_a_clear_error_for_a_file_with_no_shapes_block(tmp_path):
    bad = tmp_path / "not-a-pol-file.pol"
    bad.write_text("this is not a PLS-POLE file at all\n", encoding="latin-1")
    with pytest.raises(PolImportError, match="shapes"):
        parse_pol(bad, NOW)


def test_raises_a_clear_error_when_no_leg_base_nodes_are_found(tmp_path):
    text = (
        "TYPE='PLS_POLE INPUT FILE'\n"
        "1 0 1 1 0 0 20\n"
        "19 ; # shapes\n"
        "Undeformed Geometry\n"
        "1 0 'NoLegHere' ''\n"
        "0.0 0.0 0.0\n"
    )
    bad = tmp_path / "no-legs.pol"
    bad.write_text(text, encoding="latin-1")
    with pytest.raises(PolImportError, match="leg-base"):
        parse_pol(bad, NOW)
