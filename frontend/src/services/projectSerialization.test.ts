import { describe, expect, it } from "vitest";
import { localCoordinate, projectCoordinate } from "../domain/coordinates";
import type { Project } from "../domain/project";
import { requireFoundationTypeById } from "../domain/foundationLibrary";
import type { GeotechLayer, Groundwater } from "../domain/geotech";
import { DEFAULT_TERRAIN_GENERATION_SETTINGS } from "../domain/pointCloud";
import { degreesToRadians } from "../geometry/angles";
import { generateTin } from "../geometry/terrain";
import { loadSyntheticFixtureJson } from "../tests/fixtures";
import { loadTerrainFixturePoints } from "../tests/terrainFixtures";
import { parsePoleModel } from "../validation/poleModelSchema";
import { buildDefaultFoundationInstances } from "./buildFoundationInstances";
import { deserializeProject, serializeProject } from "./projectSerialization";

const NOW = "2026-09-15T00:00:00.000Z";

function buildSyntheticProject(): Project {
  const poleModelParsed = parsePoleModel(loadSyntheticFixtureJson("pole-lattice-4leg.json"));
  if (!poleModelParsed.success) {
    throw new Error("synthetic fixture failed to parse");
  }
  const poleModel = poleModelParsed.data;

  const terrainPoints = loadTerrainFixturePoints("terrain-slope.json");
  const terrainSurface = generateTin(terrainPoints, {
    maxEdgeLengthM: 8.0,
    terrainVersion: "test-v1",
    generatedAtIso: NOW,
  });

  const foundationInstances = buildDefaultFoundationInstances(
    poleModel,
    requireFoundationTypeById("rectangular-pad-pedestal-v1"),
    NOW
  );

  return {
    schemaVersion: "0.1.0",
    appVersion: "0.1.0",
    projectId: "synthetic-project-001",
    name: "Synthetic Phase 1 test project",
    createdAt: NOW,
    modifiedAt: NOW,
    // ISN93 (EPSG:3057), used here only as a realistic-magnitude example,
    // per docs/architecture/ADR-004 -- never a silently-applied default.
    crs: { kind: "epsg", epsgCode: 3057 },
    horizontalUnits: "m",
    verticalUnits: "m",
    elevationReferenceType: "unknown",
    mastCentreProject: projectCoordinate(512_345.678, 487_654.321, 123.456),
    lineBearingRadians: degreesToRadians(64),
    renderOriginLocal: localCoordinate(0, 0, 0),
    poleModel,
    foundationInstances,
    geotechLayers: [
      {
        id: "geotech-topsoil",
        name: "Topsoil",
        category: "topsoil",
        topBoundary: { method: "terrain-relative", depthBelowTerrainM: 0 },
        bottomBoundary: { method: "terrain-relative", depthBelowTerrainM: 0.5 },
        colour: "#6b4a2f",
        opacity: 0.55,
        visible: true,
        wireframe: false,
        source: { originType: "assumed", verificationState: "unverified" },
      } satisfies GeotechLayer,
    ],
    groundwater: {
      id: "groundwater-1",
      name: "Groundwater",
      boundary: { method: "terrain-relative", depthBelowTerrainM: 1.8 },
      colour: "#3070c0",
      opacity: 0.35,
      visible: true,
      wireframe: false,
      source: { originType: "assumed", verificationState: "unverified" },
    } satisfies Groundwater,
    pointCloudSource: {
      filePath: "pointcloud-mixed-classification.las",
      crs: { kind: "epsg", epsgCode: 3057 },
    },
    terrainGenerationSettings: DEFAULT_TERRAIN_GENERATION_SETTINGS,
    terrainSurface,
    layerStyles: {
      pole: { visible: true, opacity: 1 },
      foundations: { visible: true, opacity: 1 },
      terrain: { visible: true, opacity: 0.85, showPoints: false, wireframe: false },
    },
  };
}

describe("project save/reopen round trip", () => {
  it("reopens with an equivalent engineering state (deep-equal) after a save/reopen cycle", () => {
    const original = buildSyntheticProject();
    const json = serializeProject(original);
    const result = deserializeProject(json);

    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.data).toEqual(original);
  });

  it("preserves the mast centre and line bearing exactly (positions do not change on reopen)", () => {
    const original = buildSyntheticProject();
    const reopened = deserializeProject(serializeProject(original));
    expect(reopened.success).toBe(true);
    if (!reopened.success) return;

    expect(reopened.data.mastCentreProject).toEqual(original.mastCentreProject);
    expect(reopened.data.lineBearingRadians).toBe(original.lineBearingRadians);
  });

  it("preserves independent per-leg foundation base elevations on reopen", () => {
    const original = buildSyntheticProject();
    const reopened = deserializeProject(serializeProject(original));
    expect(reopened.success).toBe(true);
    if (!reopened.success) return;

    const originalElevations = original.foundationInstances.map((f) => f.baseElevation).sort();
    const reopenedElevations = reopened.data.foundationInstances
      .map((f) => f.baseElevation)
      .sort();
    expect(reopenedElevations).toEqual(originalElevations);
  });

  it("rejects malformed JSON with explicit errors rather than a partial project", () => {
    const result = deserializeProject("{not valid json");
    expect(result.success).toBe(false);
  });

  it("rejects a structurally invalid project (missing crs) rather than silently defaulting", () => {
    const original = buildSyntheticProject();
    const asObject = JSON.parse(serializeProject(original)) as Record<string, unknown>;
    delete asObject.crs;
    const result = deserializeProject(JSON.stringify(asObject));
    expect(result.success).toBe(false);
  });
});
