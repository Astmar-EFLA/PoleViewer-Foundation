import { describe, expect, it } from "vitest";
import { localCoordinate } from "../domain/coordinates";
import type { FoundationInstance } from "../domain/foundation";
import type { GeotechLayer, Groundwater } from "../domain/geotech";
import { loadTerrainFixturePoints } from "../tests/terrainFixtures";
import { generateTin } from "./terrain";
import {
  measureDepthBelowTerrain,
  measureFoundationToBearingLayerClearance,
  measureFoundationToGroundwaterSeparation,
  measureHorizontalDistance,
  measureSlope,
  measureThreeDDistance,
  measureVerticalDifference,
} from "./measurements";

const NOW = "2026-09-15T00:00:00.000Z";
const PROVENANCE = { originType: "assumed" as const, verificationState: "unverified" as const };

function flatTerrain() {
  // z = 0 everywhere (see fixtures/synthetic/terrain-flat.json).
  return generateTin(loadTerrainFixturePoints("terrain-flat.json"), {
    maxEdgeLengthM: 8.0,
    terrainVersion: "flat-v1",
    generatedAtIso: NOW,
  });
}

function foundation(overrides: Partial<FoundationInstance> = {}): FoundationInstance {
  return {
    instanceId: "foundation-1",
    poleModelId: "test",
    legId: "leg-a",
    anchorId: "anchor-a",
    displayLabel: "leg-a",
    foundationTypeId: "rectangular-pad-pedestal-v1",
    parameters: {
      geometryType: "rectangular-pad-pedestal",
      padWidth: 2.0,
      padLength: 2.0,
      padThickness: 0.5,
      pedestalWidth: 0.5,
      pedestalLength: 0.5,
      pedestalHeight: 0.8,
    },
    position: { x: 0, y: 0 },
    orientationRadians: 0,
    baseElevation: -2.0,
    visible: true,
    colour: "#8899aa",
    opacity: 1,
    provenance: PROVENANCE,
    ...overrides,
  };
}

describe("distance and slope measurements (hand-derived)", () => {
  it("horizontal distance ignores elevation (3-4-5 triangle in XY)", () => {
    const a = localCoordinate(0, 0, 10);
    const b = localCoordinate(3, 4, -5);
    expect(measureHorizontalDistance(a, b)).toBeCloseTo(5, 9);
  });

  it("3D distance is the full 3D hypotenuse", () => {
    const a = localCoordinate(0, 0, 0);
    const b = localCoordinate(3, 4, 12);
    expect(measureThreeDDistance(a, b)).toBeCloseTo(13, 9);
  });

  it("vertical difference is signed (b.z - a.z)", () => {
    const a = localCoordinate(0, 0, 5);
    const b = localCoordinate(0, 0, 2);
    expect(measureVerticalDifference(a, b)).toBeCloseTo(-3, 9);
    expect(measureVerticalDifference(b, a)).toBeCloseTo(3, 9);
  });

  it("slope ratioHtoV matches a known 2:1 (H:V) run", () => {
    const a = localCoordinate(0, 0, 0);
    const b = localCoordinate(4, 0, 2); // 4m horizontal run, 2m vertical rise -> 2H:1V
    const slope = measureSlope(a, b);
    expect(slope.ratioHtoV).toBeCloseTo(2, 9);
    expect(slope.percentGrade).toBeCloseTo(50, 9);
    expect(slope.angleFromHorizontalRadians).toBeCloseTo(Math.atan2(2, 4), 9);
  });

  it("slope ratioHtoV is null for a perfectly flat run (undefined ratio)", () => {
    const a = localCoordinate(0, 0, 3);
    const b = localCoordinate(5, 0, 3);
    expect(measureSlope(a, b).ratioHtoV).toBeNull();
  });
});

describe("measureDepthBelowTerrain", () => {
  it("is positive when the point is below the (flat, z=0) terrain", () => {
    const terrain = flatTerrain();
    const depth = measureDepthBelowTerrain(localCoordinate(0, 0, -3), terrain);
    expect(depth).toBeCloseTo(3, 9);
  });

  it("is negative when the point is above terrain", () => {
    const terrain = flatTerrain();
    const depth = measureDepthBelowTerrain(localCoordinate(0, 0, 2), terrain);
    expect(depth).toBeCloseTo(-2, 9);
  });
});

describe("foundation clearance measurements", () => {
  it("bearing-layer clearance equals foundation base minus the layer's top boundary elevation", () => {
    const terrain = flatTerrain();
    const layer: GeotechLayer = {
      id: "bearing-1",
      name: "Bearing",
      category: "competent-bearing",
      topBoundary: { method: "terrain-relative", depthBelowTerrainM: 5 }, // top at z = 0 - 5 = -5
      bottomBoundary: { method: "terrain-relative", depthBelowTerrainM: 10 },
      colour: "#888",
      opacity: 0.3,
      visible: true,
      wireframe: false,
      source: { originType: "assumed", verificationState: "unverified" },
    };
    const f = foundation({ baseElevation: -2 }); // base above the bearing layer top (-5) by 3m
    const clearance = measureFoundationToBearingLayerClearance(f, layer, terrain, 100);
    expect(clearance).toBeCloseTo(3, 9);
  });

  it("groundwater separation is negative when the foundation base is below the water table", () => {
    const terrain = flatTerrain();
    const groundwater: Groundwater = {
      id: "gw-1",
      name: "Groundwater",
      boundary: { method: "terrain-relative", depthBelowTerrainM: 1 }, // water table at z = -1
      colour: "#3070c0",
      opacity: 0.3,
      visible: true,
      wireframe: false,
      source: { originType: "assumed", verificationState: "unverified" },
    };
    const f = foundation({ baseElevation: -2 }); // base 1m below the water table
    const separation = measureFoundationToGroundwaterSeparation(f, groundwater, terrain, 100);
    expect(separation).toBeCloseTo(-1, 9);
  });
});
