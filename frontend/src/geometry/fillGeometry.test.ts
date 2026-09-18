import { describe, expect, it } from "vitest";
import type { FillInstance } from "../domain/fill";
import type { FoundationInstance } from "../domain/foundation";
import { loadTerrainFixturePoints } from "../tests/terrainFixtures";
import { generateTin } from "./terrain";
import { generateFillGeometry, solvePerimeterFillTerrainIntersection } from "./fillGeometry";
import { rectanglePerimeterSamples } from "./excavationGeometry";

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

// baseElevation is positive (above terrain z=0), the fill case -- the
// mirror of excavationGeometry.test.ts's foundation() which sits below.
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
    baseElevation: 2.0,
    visible: true,
    colour: "#8899aa",
    opacity: 1,
    provenance: PROVENANCE,
    ...overrides,
  };
}

function fill(overrides: Partial<FillInstance> = {}): FillInstance {
  return {
    id: "fill-1",
    foundationInstanceId: "foundation-1",
    topElevationM: 2.0,
    workingSpaceOffsetM: 0.5,
    sideSlope: { h: 2, v: 1 },
    colour: "#8a6d3b",
    opacity: 0.5,
    visible: true,
    wireframe: false,
    provenance: PROVENANCE,
    ...overrides,
  };
}

describe("solvePerimeterFillTerrainIntersection: flat terrain (closed form)", () => {
  it("every perimeter sample meets terrain at the same height below the top plate, regardless of position or slope ratio", () => {
    const terrain = flatTerrain(); // z = 0 everywhere within [-25,25]^2
    const topFootprint = { centre: { x: 0, y: 0 }, halfWidth: 1.5, halfLength: 1.5, orientationRadians: 0 };
    const topElevationM = 2.0;
    const expectedH = topElevationM - 0; // top elevation - terrain z

    const samples = rectanglePerimeterSamples(1.5, 1.5, 3);
    for (const s of samples) {
      const result = solvePerimeterFillTerrainIntersection(s, topFootprint, topElevationM, 2.0, terrain);
      expect(result.truncated).toBe(false);
      expect(result.point.z).toBeCloseTo(0, 6);
      expect(topElevationM - result.point.z).toBeCloseTo(expectedH, 6);
    }
  });
});

describe("solvePerimeterFillTerrainIntersection: linear-sloped terrain (closed form)", () => {
  it("matches the hand-derived closed form for a pure-X-growth sample on a pure-X-slope terrain", () => {
    // terrain z = 0.05 * x (terrain-slope.json). Sample grows purely in +x
    // (y0 = 0, growX=true, growY=false), footprint centred at origin.
    const terrain = slopeTerrain();
    const topFootprint = { centre: { x: 0, y: 0 }, halfWidth: 2, halfLength: 2, orientationRadians: 0 };
    const topElevationM = 2.0;
    const slopeHtoV = 1.5; // 1.5H:1V
    const terrainSlope = 0.05;
    const z0 = 0; // terrain z at x=0

    // Closed form (mirrors the excavation case, sign of the slope term
    // inverted since the search walks downward instead of upward):
    // terrainZ(halfWidth + h*slopeHtoV) = topElevation - h
    // => z0 + terrainSlope*(halfWidth + h*slopeHtoV) = topElevation - h
    // => h*(1 + terrainSlope*slopeHtoV) = topElevation - z0 - terrainSlope*halfWidth
    const expectedH =
      (topElevationM - z0 - terrainSlope * topFootprint.halfWidth) / (1 + terrainSlope * slopeHtoV);

    const eastMidSample = { x0: topFootprint.halfWidth, y0: 0, growX: true, growY: false };
    const result = solvePerimeterFillTerrainIntersection(eastMidSample, topFootprint, topElevationM, slopeHtoV, terrain);

    expect(result.truncated).toBe(false);
    expect(topElevationM - result.point.z).toBeCloseTo(expectedH, 3);
    expect(result.point.x).toBeCloseTo(topFootprint.halfWidth + expectedH * slopeHtoV, 3);
  });
});

describe("solvePerimeterFillTerrainIntersection: truncation", () => {
  it("reports truncated when the sample's growing position exits terrain coverage", () => {
    const terrain = flatTerrain(); // coverage roughly [-25, 25]^2
    // Footprint centred near the edge of coverage so the east-growing
    // sample immediately steps outside it.
    const topFootprint = { centre: { x: 24, y: 0 }, halfWidth: 3, halfLength: 1, orientationRadians: 0 };
    const eastSample = { x0: 3, y0: 0, growX: true, growY: false };

    const result = solvePerimeterFillTerrainIntersection(eastSample, topFootprint, 2.0, 1.5, terrain);
    expect(result.truncated).toBe(true);
  });
});

describe("generateFillGeometry", () => {
  it("produces an untruncated geometry with 4 top corners on adequate flat terrain", () => {
    const terrain = flatTerrain();
    const geometry = generateFillGeometry(fill(), foundation(), terrain);

    expect(geometry.topCorners).toHaveLength(4);
    expect(geometry.truncated).toBe(false);
    expect(geometry.bottomRing.length).toBeGreaterThan(4);
    // Flat terrain: min and max height at the top footprint corners are identical.
    expect(geometry.minHeightM).toBeCloseTo(geometry.maxHeightM, 6);
    expect(geometry.minHeightM).toBeCloseTo(2.0, 6); // terrain z=0, top plate at +2
  });

  it("min/max height differ on sloping terrain, and increasing working space moves the top footprint outward", () => {
    const terrain = slopeTerrain();
    const geometryNarrow = generateFillGeometry(fill({ workingSpaceOffsetM: 0.5 }), foundation(), terrain);
    const geometryWide = generateFillGeometry(fill({ workingSpaceOffsetM: 2.0 }), foundation(), terrain);

    expect(geometryNarrow.maxHeightM).not.toBeCloseTo(geometryNarrow.minHeightM, 3);
    expect(geometryWide.topFootprint.halfWidth).toBeGreaterThan(geometryNarrow.topFootprint.halfWidth);
  });
});
