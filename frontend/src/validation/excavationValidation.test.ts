import { describe, expect, it } from "vitest";
import type { ExcavationInstance } from "../domain/excavation";
import type { FoundationInstance } from "../domain/foundation";
import { generateExcavationGeometry } from "../geometry/excavationGeometry";
import { generateTin } from "../geometry/terrain";
import { loadTerrainFixturePoints } from "../tests/terrainFixtures";
import { hasBlockingExcavationGeometryError, validateExcavationInstance } from "./excavationValidation";

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

describe("validateExcavationInstance", () => {
  it("passes for a valid excavation on adequate terrain", () => {
    const terrain = flatTerrain();
    const exc = excavation();
    const geometry = generateExcavationGeometry(exc, foundation(), terrain);
    const results = validateExcavationInstance(exc, foundation(), geometry, NOW);
    expect(results).toHaveLength(0);
  });

  it("flags a zero or negative H as an invalid slope ratio", () => {
    const results = validateExcavationInstance(
      excavation({ sideSlope: { h: 0, v: 1 } }),
      foundation(),
      null,
      NOW
    );
    expect(results.some((r) => r.ruleId === "excavation.invalid-slope-ratio" && r.severity === "blocking")).toBe(
      true
    );
  });

  it("flags a zero or negative V as an invalid slope ratio", () => {
    const results = validateExcavationInstance(
      excavation({ sideSlope: { h: 1.5, v: -1 } }),
      foundation(),
      null,
      NOW
    );
    expect(results.some((r) => r.ruleId === "excavation.invalid-slope-ratio")).toBe(true);
  });

  it("flags a negative working-space offset as blocking", () => {
    const results = validateExcavationInstance(
      excavation({ workingSpaceOffsetM: -0.1 }),
      foundation(),
      null,
      NOW
    );
    expect(results.some((r) => r.ruleId === "excavation.negative-working-space" && r.severity === "blocking")).toBe(
      true
    );
  });

  it("flags an excavation bottom above the foundation base as blocking", () => {
    // Foundation base at -2.0; excavation bottom at -1.5 is shallower (above it).
    const results = validateExcavationInstance(
      excavation({ bottomElevationM: -1.5 }),
      foundation(),
      null,
      NOW
    );
    expect(
      results.some((r) => r.ruleId === "excavation.bottom-above-foundation-base" && r.severity === "blocking")
    ).toBe(true);
  });

  it("does not flag an excavation bottom exactly at the foundation base", () => {
    const results = validateExcavationInstance(
      excavation({ bottomElevationM: -2.0 }),
      foundation(),
      null,
      NOW
    );
    expect(results.some((r) => r.ruleId === "excavation.bottom-above-foundation-base")).toBe(false);
  });

  it("flags a truncated terrain intersection as a warning, not blocking", () => {
    const terrain = flatTerrain();
    const farFoundation: FoundationInstance = { ...foundation(), position: { x: 24, y: 0 } };
    const exc = excavation();
    const geometry = generateExcavationGeometry(exc, farFoundation, terrain);

    const results = validateExcavationInstance(exc, farFoundation, geometry, NOW);
    const truncationResult = results.find((r) => r.ruleId === "excavation.terrain-intersection-truncated");
    expect(truncationResult).toBeDefined();
    expect(truncationResult?.severity).toBe("warning");
  });
});

describe("hasBlockingExcavationGeometryError", () => {
  it("is true when a blocking geometry-affecting rule is present", () => {
    const results = validateExcavationInstance(excavation({ workingSpaceOffsetM: -1 }), foundation(), null, NOW);
    expect(hasBlockingExcavationGeometryError(results)).toBe(true);
  });

  it("is false for a truncation-only warning (truncation blocks volume, not general geometry)", () => {
    const terrain = flatTerrain();
    const farFoundation: FoundationInstance = { ...foundation(), position: { x: 24, y: 0 } };
    const exc = excavation();
    const geometry = generateExcavationGeometry(exc, farFoundation, terrain);
    const results = validateExcavationInstance(exc, farFoundation, geometry, NOW);
    expect(hasBlockingExcavationGeometryError(results)).toBe(false);
  });
});
