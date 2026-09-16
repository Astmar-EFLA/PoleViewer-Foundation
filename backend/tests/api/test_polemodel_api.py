from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_import_endpoint_returns_a_valid_pole_model(workspace_with_fixtures):
    response = client.post("/polemodel/import", json={"filePath": "pole-model-2leg.pol"})
    assert response.status_code == 200
    body = response.json()
    assert {leg["id"] for leg in body["structuralLegs"]} == {"leg-la", "leg-lb"}
    assert body["mastCentreAnchorId"] == "anchor-mast-centre"
    assert len(body["visualGeometry"]["members"]) == 5
    assert len(body["warnings"]) == 3


def test_import_endpoint_omits_unset_optional_provenance_fields_rather_than_sending_null(workspace_with_fixtures):
    # Regression test: the frontend's Zod schemas use `.optional()` (field
    # absent) rather than `.nullable()` (field present as null) for these --
    # an unset Provenance field must be OMITTED from the response, not sent
    # as JSON null, or every anchor/leg fails frontend schema validation.
    # See response_model_exclude_none=True on the /polemodel/import route.
    response = client.post("/polemodel/import", json={"filePath": "pole-model-2leg.pol"})
    body = response.json()
    source = body["anchors"][0]["source"]
    for unset_field in ("sourceFileHash", "sourceRef", "modifiedAt", "calculationParameters", "softwareVersion"):
        assert unset_field not in source


def test_import_endpoint_404_for_missing_file(workspace_with_fixtures):
    response = client.post("/polemodel/import", json={"filePath": "does-not-exist.pol"})
    assert response.status_code == 404


def test_import_endpoint_400_for_path_traversal(workspace_with_fixtures):
    response = client.post("/polemodel/import", json={"filePath": "../../outside.pol"})
    assert response.status_code == 400


def test_import_endpoint_422_for_a_non_pol_extension(workspace_with_fixtures):
    response = client.post("/polemodel/import", json={"filePath": "pointcloud-mixed-classification.las"})
    assert response.status_code == 422
    assert "extension" in response.json()["detail"]


def test_import_endpoint_422_for_a_file_with_no_leg_base_nodes(workspace_with_fixtures, tmp_path):
    bad = workspace_with_fixtures / "empty.pol"
    bad.write_text(
        "TYPE='PLS_POLE INPUT FILE'\n"
        "1 0 1 1 0 0 20\n"
        "19 ; # shapes\n"
        "Undeformed Geometry\n"
        "1 0 'NoLegHere' ''\n"
        "0.0 0.0 0.0\n",
        encoding="latin-1",
    )
    response = client.post("/polemodel/import", json={"filePath": "empty.pol"})
    assert response.status_code == 422
    assert "leg-base" in response.json()["detail"]
