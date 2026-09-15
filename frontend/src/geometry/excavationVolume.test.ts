import { describe, expect, it } from "vitest";
import type { ExcavationInstance } from "../domain/excavation";
import type { FoundationInstance } from "../domain/foundation";
import { loadTerrainFixturePoints } from "../tests/terrainFixtures";
import { generateExcavationGeometry } from "./excavationGeometry";
import { computeApproximateVolume } from "./excavationVolume";
import { generateTin } from "./terrain";

const NOW = "2026-09-15T00:00:00.000Z";
const PROVENANCE = { originType: "assumed" as const, verificationState: "unverified" as const };

function flatTerrain() {
  return generateTin(loadTerrainFixturePoints("terrain-flat.json"), {
    maxEdgeLengthM: 8.0,
    terrainVersion: "flat-v1",
    generatedAtIso: NOW,
  });
}

function foundation(): FoundationInstance {
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

describe("computeApproximateVolume: flat terrain matches the exact closed-form frustum volume", () => {
  it("computes V = (H/3)(A1 + A2 + sqrt(A1*A2)) exactly (terrain is flat, so the 'approximation' is exact here)", () => {
    const terrain = flatTerrain();
    const exc = excavation();
    const geometry = generateExcavationGeometry(exc, foundation(), terrain);
    const result = computeApproximateVolume(exc, geometry, terrain, true);

    expect(result.status).toBe("calculated");
    expect(result.approximateVolumeM3).not.toBeNull();

    // Hand-computed expected value (see geometry: bottomFootprint half-extents
    // 1.0 + 0.5 working space = 1.5 -> bottom 3x3; height = 0 - (-2) = 2;
    // slopeOffset = 2 * 1.5 = 3 -> top 9x9).
    const bottomArea = 3 * 3;
    const topArea = 9 * 9;
    const expectedVolume = (2 / 3) * (bottomArea + topArea + Math.sqrt(bottomArea * topArea));

    expect(result.approximateVolumeM3!).toBeCloseTo(expectedVolume, 3);
    expect(result.approximateVolumeM3!).toBeCloseTo(78, 3);
  });

  it("reports the method and terrain version, and no truncation", () => {
    const terrain = flatTerrain();
    const exc = excavation();
    const geometry = generateExcavationGeometry(exc, foundation(), terrain);
    const result = computeApproximateVolume(exc, geometry, terrain, true);

    expect(result.method).toContain("approximation");
    expect(result.terrainVersion).toBe("flat-v1");
    expect(result.truncatedByTerrainCoverage).toBe(false);
    expect(result.limitations.length).toBeGreaterThan(0);
  });
});

describe("computeApproximateVolume: blocking conditions", () => {
  it("blocks with status blocked-invalid-geometry and a null volume when geometry is invalid", () => {
    const terrain = flatTerrain();
    const exc = excavation();
    const geometry = generateExcavationGeometry(exc, foundation(), terrain);
    const result = computeApproximateVolume(exc, geometry, terrain, false);

    expect(result.status).toBe("blocked-invalid-geometry");
    expect(result.approximateVolumeM3).toBeNull();
  });

  it("blocks with status blocked-truncated and a null volume when the terrain intersection is truncated", () => {
    const terrain = flatTerrain();
    // Foundation positioned so the excavation footprint pokes outside the
    // flat terrain's coverage, forcing a truncated intersection.
    const farFoundation: FoundationInstance = { ...foundation(), position: { x: 24, y: 0 } };
    const exc = excavation();
    const geometry = generateExcavationGeometry(exc, farFoundation, terrain);

    expect(geometry.truncated).toBe(true);
    const result = computeApproximateVolume(exc, geometry, terrain, true);
    expect(result.status).toBe("blocked-truncated");
    expect(result.approximateVolumeM3).toBeNull();
    expect(result.truncatedByTerrainCoverage).toBe(true);
  });
});
