import { describe, expect, it } from "vitest";
import type { FillInstance } from "../domain/fill";
import type { FoundationInstance } from "../domain/foundation";
import { generateFillGeometry } from "../geometry/fillGeometry";
import { generateTin } from "../geometry/terrain";
import { loadTerrainFixturePoints } from "../tests/terrainFixtures";
import { generateFoundationGeometry } from "../geometry/foundationGeometry";
import { hasBlockingFillGeometryError, validateFillInstance, validateUpliftFillInstance } from "./fillValidation";

const NOW = "2026-09-15T00:00:00.000Z";
const PROVENANCE = { originType: "assumed" as const, verificationState: "unverified" as const };

function flatTerrain() {
  return generateTin(loadTerrainFixturePoints("terrain-flat.json"), {
    maxEdgeLengthM: 8.0,
    terrainVersion: "flat-v1",
    generatedAtIso: NOW,
  });
}

// baseElevation is positive (above terrain z=0) -- the fill case.
function foundation(): FoundationInstance {
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

describe("validateFillInstance", () => {
  it("passes for a valid fill on adequate terrain", () => {
    const terrain = flatTerrain();
    const f = fill();
    const geometry = generateFillGeometry(f, foundation(), terrain);
    const results = validateFillInstance(f, foundation(), geometry, NOW);
    expect(results).toHaveLength(0);
  });

  it("flags a zero or negative H as an invalid slope ratio", () => {
    const results = validateFillInstance(fill({ sideSlope: { h: 0, v: 1 } }), foundation(), null, NOW);
    expect(results.some((r) => r.ruleId === "fill.invalid-slope-ratio" && r.severity === "blocking")).toBe(true);
  });

  it("flags a zero or negative V as an invalid slope ratio", () => {
    const results = validateFillInstance(fill({ sideSlope: { h: 2, v: -1 } }), foundation(), null, NOW);
    expect(results.some((r) => r.ruleId === "fill.invalid-slope-ratio")).toBe(true);
  });

  it("flags a negative working-space offset as blocking", () => {
    const results = validateFillInstance(fill({ workingSpaceOffsetM: -0.1 }), foundation(), null, NOW);
    expect(results.some((r) => r.ruleId === "fill.negative-working-space" && r.severity === "blocking")).toBe(true);
  });

  it("flags a fill top below the foundation base as blocking", () => {
    // Foundation base at +2.0; fill top at +1.5 does not reach up to it.
    const results = validateFillInstance(fill({ topElevationM: 1.5 }), foundation(), null, NOW);
    expect(results.some((r) => r.ruleId === "fill.top-below-foundation-base" && r.severity === "blocking")).toBe(
      true
    );
  });

  it("does not flag a fill top exactly at the foundation base", () => {
    const results = validateFillInstance(fill({ topElevationM: 2.0 }), foundation(), null, NOW);
    expect(results.some((r) => r.ruleId === "fill.top-below-foundation-base")).toBe(false);
  });

  it("flags a truncated terrain intersection as a warning, not blocking", () => {
    const terrain = flatTerrain();
    const farFoundation: FoundationInstance = { ...foundation(), position: { x: 24, y: 0 } };
    const f = fill();
    const geometry = generateFillGeometry(f, farFoundation, terrain);

    const results = validateFillInstance(f, farFoundation, geometry, NOW);
    const truncationResult = results.find((r) => r.ruleId === "fill.terrain-intersection-truncated");
    expect(truncationResult).toBeDefined();
    expect(truncationResult?.severity).toBe("warning");
  });
});

describe("hasBlockingFillGeometryError", () => {
  it("is true when a blocking geometry-affecting rule is present", () => {
    const results = validateFillInstance(fill({ workingSpaceOffsetM: -1 }), foundation(), null, NOW);
    expect(hasBlockingFillGeometryError(results)).toBe(true);
  });

  it("is false for a truncation-only warning (truncation blocks volume, not general geometry)", () => {
    const terrain = flatTerrain();
    const farFoundation: FoundationInstance = { ...foundation(), position: { x: 24, y: 0 } };
    const f = fill();
    const geometry = generateFillGeometry(f, farFoundation, terrain);
    const results = validateFillInstance(f, farFoundation, geometry, NOW);
    expect(hasBlockingFillGeometryError(results)).toBe(false);
  });
});

describe("validateUpliftFillInstance", () => {
  it("passes for a valid uplift-fill reaching the top of the foundation", () => {
    const terrain = flatTerrain();
    const foundationInstance = foundation();
    const topConnectionZ = generateFoundationGeometry(foundationInstance).topConnectionPoint.z;
    const f = fill({ topElevationM: topConnectionZ });
    const geometry = generateFillGeometry(f, foundationInstance, terrain);
    const results = validateUpliftFillInstance(f, foundationInstance, geometry, NOW);
    expect(results).toHaveLength(0);
  });

  it("flags an uplift-fill top below the foundation's own top (pad + pedestal) as blocking", () => {
    const foundationInstance = foundation();
    const topConnectionZ = generateFoundationGeometry(foundationInstance).topConnectionPoint.z;
    // Reaches the foundation's *base* (2.0) but not its top (~3.3) -- would not cover the whole body.
    const results = validateUpliftFillInstance(
      fill({ topElevationM: foundationInstance.baseElevation }),
      foundationInstance,
      null,
      NOW
    );
    expect(results.some((r) => r.ruleId === "fill.top-below-foundation-top" && r.severity === "blocking")).toBe(
      true
    );
    expect(foundationInstance.baseElevation).toBeLessThan(topConnectionZ);
  });

  it("does not flag an uplift-fill top exactly at the foundation's own top", () => {
    const foundationInstance = foundation();
    const topConnectionZ = generateFoundationGeometry(foundationInstance).topConnectionPoint.z;
    const results = validateUpliftFillInstance(fill({ topElevationM: topConnectionZ }), foundationInstance, null, NOW);
    expect(results.some((r) => r.ruleId === "fill.top-below-foundation-top")).toBe(false);
  });

  it("shares the same slope/working-space checks as validateFillInstance", () => {
    const results = validateUpliftFillInstance(fill({ workingSpaceOffsetM: -0.1 }), foundation(), null, NOW);
    expect(results.some((r) => r.ruleId === "fill.negative-working-space" && r.severity === "blocking")).toBe(true);
  });
});

describe("hasBlockingFillGeometryError: recognizes the uplift-fill rule", () => {
  it("is true for fill.top-below-foundation-top", () => {
    const foundationInstance = foundation();
    const results = validateUpliftFillInstance(
      fill({ topElevationM: foundationInstance.baseElevation }),
      foundationInstance,
      null,
      NOW
    );
    expect(hasBlockingFillGeometryError(results)).toBe(true);
  });
});
