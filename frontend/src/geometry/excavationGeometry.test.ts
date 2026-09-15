import { describe, expect, it } from "vitest";
import type { ExcavationInstance } from "../domain/excavation";
import type { FoundationInstance } from "../domain/foundation";
import { loadTerrainFixturePoints } from "../tests/terrainFixtures";
import { generateTin } from "./terrain";
import {
  excavationBottomFootprint,
  foundationBottomFootprint,
  generateExcavationGeometry,
  rectanglePerimeterSamples,
  solvePerimeterTerrainIntersection,
} from "./excavationGeometry";

const NOW = "2026-09-15T00:00:00.000Z";
const PROVENANCE = { originType: "assumed" as const, verificationState: "unverified" as const };

function flatTerrain() {
  return generateTin(loadTerrainFixturePoints("terrain-flat.json"), {
    maxEdgeLengthM: 8.0,
    terrainVersion: "flat-v1",
    generatedAtIso: NOW,
  });
}

function slopeTerrain() {
  // z = 0.05 * x
  return generateTin(loadTerrainFixturePoints("terrain-slope.json"), {
    maxEdgeLengthM: 8.0,
    terrainVersion: "slope-v1",
    generatedAtIso: NOW,
  });
}

function foundation(overrides: Partial<FoundationInstance> = {}): FoundationInstance {
  return {
    instanceId: "foundation-1",
    poleModelId: "test",
    legId: "leg-a",
    anchorId: "anchor-a",
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

function excavation(overrides: Partial<ExcavationInstance> = {}): ExcavationInstance {
  return {
    id: "excavation-1",
    foundationInstanceId: "foundation-1",
    bottomElevationM: -2.0,
    workingSpaceOffsetM: 0.5,
    sideSlope: { h: 1.5, v: 1 },
    colour: "#c9a227",
    opacity: 0.5,
    visible: true,
    wireframe: false,
    provenance: PROVENANCE,
    ...overrides,
  };
}

describe("rectanglePerimeterSamples", () => {
  it("with 0 samples per edge, returns exactly the 4 corners, all growing on both axes", () => {
    const samples = rectanglePerimeterSamples(2, 3, 0);
    expect(samples).toHaveLength(4);
    for (const s of samples) {
      expect(s.growX).toBe(true);
      expect(s.growY).toBe(true);
    }
    const xs = samples.map((s) => s.x0).sort((a, b) => a - b);
    const ys = samples.map((s) => s.y0).sort((a, b) => a - b);
    expect(xs).toEqual([-2, -2, 2, 2]);
    expect(ys).toEqual([-3, -3, 3, 3]);
  });

  it("with N samples per edge, returns 4*(N+1) points total, with edge-interior points growing on exactly one axis", () => {
    const samples = rectanglePerimeterSamples(2, 3, 2);
    expect(samples).toHaveLength(12);
    const corners = samples.filter((s) => s.growX && s.growY);
    const edgePoints = samples.filter((s) => s.growX !== s.growY);
    expect(corners).toHaveLength(4);
    expect(edgePoints).toHaveLength(8);
  });
});

describe("foundationBottomFootprint / excavationBottomFootprint", () => {
  it("excavation footprint expands the foundation footprint by the working-space offset on every side", () => {
    const f = foundationBottomFootprint(foundation());
    // pad half-extents = padWidth/2, padLength/2 = 1.0, 1.0
    expect(f.halfWidth).toBeCloseTo(1.0, 9);
    expect(f.halfLength).toBeCloseTo(1.0, 9);

    const e = excavationBottomFootprint(f, 0.5);
    expect(e.halfWidth).toBeCloseTo(1.5, 9);
    expect(e.halfLength).toBeCloseTo(1.5, 9);
    expect(e.centre).toEqual(f.centre);
  });
});

describe("solvePerimeterTerrainIntersection: flat terrain (closed form)", () => {
  it("every perimeter sample meets terrain at the same height, regardless of position or slope ratio", () => {
    const terrain = flatTerrain(); // z = 0 everywhere within [-25,25]^2
    const bottomFootprint = { centre: { x: 0, y: 0 }, halfWidth: 1.5, halfLength: 1.5, orientationRadians: 0 };
    const bottomElevationM = -2.0;
    const expectedH = 0 - bottomElevationM; // terrain z (0) - bottom elevation

    const samples = rectanglePerimeterSamples(1.5, 1.5, 3);
    for (const s of samples) {
      const result = solvePerimeterTerrainIntersection(s, bottomFootprint, bottomElevationM, 1.5, terrain);
      expect(result.truncated).toBe(false);
      expect(result.point.z).toBeCloseTo(0, 6);
      expect(result.point.z - bottomElevationM).toBeCloseTo(expectedH, 6);
    }
  });
});

describe("solvePerimeterTerrainIntersection: linear-sloped terrain (closed form)", () => {
  it("matches the hand-derived closed form for a pure-X-growth sample on a pure-X-slope terrain", () => {
    // terrain z = 0.05 * x (terrain-slope.json). Sample grows purely in +x
    // (y0 = 0, growX=true, growY=false), footprint centred at origin.
    const terrain = slopeTerrain();
    const bottomFootprint = { centre: { x: 0, y: 0 }, halfWidth: 2, halfLength: 2, orientationRadians: 0 };
    const bottomElevationM = -2.0;
    const slopeHtoV = 1.5; // 1.5H:1V
    const terrainSlope = 0.05;
    const z0 = 0; // terrain z at x=0

    // Closed form: bottomElevation + h = z0 + terrainSlope*(halfWidth + h*slopeHtoV)
    // => h*(1 - terrainSlope*slopeHtoV) = z0 + terrainSlope*halfWidth - bottomElevation
    const expectedH =
      (z0 + terrainSlope * bottomFootprint.halfWidth - bottomElevationM) / (1 - terrainSlope * slopeHtoV);

    const eastMidSample = { x0: bottomFootprint.halfWidth, y0: 0, growX: true, growY: false };
    const result = solvePerimeterTerrainIntersection(
      eastMidSample,
      bottomFootprint,
      bottomElevationM,
      slopeHtoV,
      terrain
    );

    expect(result.truncated).toBe(false);
    expect(result.point.z - bottomElevationM).toBeCloseTo(expectedH, 3);
    expect(result.point.x).toBeCloseTo(bottomFootprint.halfWidth + expectedH * slopeHtoV, 3);
  });
});

describe("solvePerimeterTerrainIntersection: truncation", () => {
  it("reports truncated when the sample's growing position exits terrain coverage", () => {
    const terrain = flatTerrain(); // coverage roughly [-25, 25]^2
    // Footprint centred near the edge of coverage so the east-growing
    // sample immediately steps outside it.
    const bottomFootprint = { centre: { x: 24, y: 0 }, halfWidth: 3, halfLength: 1, orientationRadians: 0 };
    const eastSample = { x0: 3, y0: 0, growX: true, growY: false };

    const result = solvePerimeterTerrainIntersection(eastSample, bottomFootprint, -2.0, 1.5, terrain);
    expect(result.truncated).toBe(true);
  });
});

describe("generateExcavationGeometry", () => {
  it("produces an untruncated geometry with 4 bottom corners on adequate flat terrain", () => {
    const terrain = flatTerrain();
    const geometry = generateExcavationGeometry(excavation(), foundation(), terrain);

    expect(geometry.bottomCorners).toHaveLength(4);
    expect(geometry.truncated).toBe(false);
    expect(geometry.topRing.length).toBeGreaterThan(4);
    // Flat terrain: min and max depth at the bottom footprint corners are identical.
    expect(geometry.minDepthM).toBeCloseTo(geometry.maxDepthM, 6);
    expect(geometry.minDepthM).toBeCloseTo(2.0, 6); // terrain z=0, bottom at -2
  });

  it("min/max depth differ on sloping terrain, and increasing working space moves the bottom footprint outward", () => {
    const terrain = slopeTerrain();
    const geometryNarrow = generateExcavationGeometry(excavation({ workingSpaceOffsetM: 0.5 }), foundation(), terrain);
    const geometryWide = generateExcavationGeometry(excavation({ workingSpaceOffsetM: 2.0 }), foundation(), terrain);

    expect(geometryNarrow.maxDepthM).not.toBeCloseTo(geometryNarrow.minDepthM, 3);
    expect(geometryWide.bottomFootprint.halfWidth).toBeGreaterThan(geometryNarrow.bottomFootprint.halfWidth);
  });
});
