import { describe, expect, it } from "vitest";
import type { FoundationInstance } from "../domain/foundation";
import type { GeotechLayer, Groundwater } from "../domain/geotech";
import { generateTin } from "../geometry/terrain";
import { loadTerrainFixturePoints } from "../tests/terrainFixtures";
import { validateGeotechLayer, validateGroundwaterFoundationIntersection } from "./geotechValidation";

const NOW = "2026-09-15T00:00:00.000Z";
const MAST_ELEVATION = 123.456;
const PROVENANCE = { originType: "assumed" as const, verificationState: "unverified" as const };

function slopeTerrain() {
  const points = loadTerrainFixturePoints("terrain-slope.json");
  return generateTin(points, { maxEdgeLengthM: 8.0, terrainVersion: "test-v1", generatedAtIso: NOW });
}

function layer(overrides: Partial<GeotechLayer> = {}): GeotechLayer {
  return {
    id: "layer-1",
    name: "Topsoil",
    category: "topsoil",
    topBoundary: { method: "terrain-relative", depthBelowTerrainM: 0 },
    bottomBoundary: { method: "terrain-relative", depthBelowTerrainM: 0.8 },
    colour: "#6b4a2f",
    opacity: 0.6,
    visible: true,
    wireframe: false,
    source: PROVENANCE,
    ...overrides,
  };
}

describe("validateGeotechLayer: inversion", () => {
  it("passes for a correctly-ordered terrain-relative layer (top shallower than bottom)", () => {
    const terrain = slopeTerrain();
    const results = validateGeotechLayer(layer(), terrain, MAST_ELEVATION, NOW);
    expect(results).toHaveLength(0);
  });

  it("flags an inverted layer (top deeper than bottom) as blocking", () => {
    const terrain = slopeTerrain();
    const inverted = layer({
      topBoundary: { method: "terrain-relative", depthBelowTerrainM: 2.0 },
      bottomBoundary: { method: "terrain-relative", depthBelowTerrainM: 0.5 },
    });
    const results = validateGeotechLayer(inverted, terrain, MAST_ELEVATION, NOW);
    expect(results).toHaveLength(1);
    expect(results[0]!.ruleId).toBe("geotech.inverted-boundary");
    expect(results[0]!.severity).toBe("blocking");
  });

  it("flags a partial inversion caused by mixing terrain-relative and absolute-elevation boundaries on sloping ground", () => {
    const terrain = slopeTerrain(); // z = 0.05 * x, ranges roughly -1.25..+1.25 over x in [-25,25]
    // Top follows terrain at a shallow depth; bottom is a flat absolute
    // elevation that is deeper than top only on part of the sloped site.
    const mixed = layer({
      topBoundary: { method: "terrain-relative", depthBelowTerrainM: 0.2 },
      bottomBoundary: { method: "absolute-elevation", elevationProjectM: MAST_ELEVATION + 1.0 },
    });
    const results = validateGeotechLayer(mixed, terrain, MAST_ELEVATION, NOW);
    expect(results).toHaveLength(1);
    expect(results[0]!.detail).toMatch(/of \d+ sampled point/);
  });

  it("does not flag a valid layer defined by two absolute-elevation boundaries", () => {
    const terrain = slopeTerrain();
    const absoluteLayer = layer({
      topBoundary: { method: "absolute-elevation", elevationProjectM: MAST_ELEVATION + 2 },
      bottomBoundary: { method: "absolute-elevation", elevationProjectM: MAST_ELEVATION - 2 },
    });
    const results = validateGeotechLayer(absoluteLayer, terrain, MAST_ELEVATION, NOW);
    expect(results).toHaveLength(0);
  });
});

function foundation(overrides: Partial<FoundationInstance> = {}): FoundationInstance {
  return {
    instanceId: "foundation-leg-a",
    poleModelId: "test",
    legId: "leg-a",
    anchorId: "anchor-leg-a",
    foundationTypeId: "rectangular-pad-pedestal-v1",
    parameters: {
      geometryType: "rectangular-pad-pedestal",
      padWidth: 1.8,
      padLength: 1.8,
      padThickness: 0.5,
      pedestalWidth: 0.5,
      pedestalLength: 0.5,
      pedestalHeight: 0.8,
    },
    position: { x: 0, y: 0 },
    orientationRadians: 0,
    baseElevation: -1.0,
    visible: true,
    colour: "#8899aa",
    opacity: 1,
    provenance: PROVENANCE,
    ...overrides,
  };
}

function groundwater(overrides: Partial<Groundwater> = {}): Groundwater {
  return {
    id: "groundwater-1",
    name: "Groundwater",
    boundary: { method: "terrain-relative", depthBelowTerrainM: 1.5 },
    colour: "#3070c0",
    opacity: 0.3,
    visible: true,
    wireframe: false,
    source: PROVENANCE,
    ...overrides,
  };
}

describe("validateGroundwaterFoundationIntersection", () => {
  it("reports when the foundation base is below the groundwater level (submerged)", () => {
    const terrain = slopeTerrain();
    // terrain z at (0,0) is 0 (see terrain-slope.json: z = 0.05*x); the
    // groundwater boundary sits 1.5m below terrain, i.e. local z = -1.5.
    // A foundation base at -2.0 is deeper than that (submerged).
    const submerged = foundation({ baseElevation: -2.0, position: { x: 0, y: 0 } });
    const results = validateGroundwaterFoundationIntersection(
      groundwater(),
      submerged,
      terrain,
      MAST_ELEVATION,
      NOW
    );
    expect(results).toHaveLength(1);
    expect(results[0]!.ruleId).toBe("geotech.foundation-groundwater-intersection");
    expect(results[0]!.severity).toBe("warning");
  });

  it("does not report when the foundation base is above the groundwater level", () => {
    const terrain = slopeTerrain();
    const dryFoundation = foundation({ baseElevation: -1.0, position: { x: 0, y: 0 } });
    const results = validateGroundwaterFoundationIntersection(
      groundwater(),
      dryFoundation,
      terrain,
      MAST_ELEVATION,
      NOW
    );
    expect(results).toHaveLength(0);
  });

  it("returns no result when the foundation position is outside terrain coverage", () => {
    const terrain = slopeTerrain();
    const farFoundation = foundation({ position: { x: 100_000, y: 100_000 } });
    const results = validateGroundwaterFoundationIntersection(
      groundwater(),
      farFoundation,
      terrain,
      MAST_ELEVATION,
      NOW
    );
    expect(results).toHaveLength(0);
  });
});
