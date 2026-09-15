import { describe, expect, it } from "vitest";
import type { FoundationInstance, RectangularPadPedestalParameters } from "../domain/foundation";
import { loadSyntheticFixtureJson } from "../tests/fixtures";
import { placedAnchorPosition } from "../geometry/polePlacement";
import { parsePoleModel } from "./poleModelSchema";
import { validateFoundationInstance } from "./foundationValidation";

const NOW = "2026-09-15T00:00:00.000Z";
const BASE_PROVENANCE = {
  originType: "assumed" as const,
  verificationState: "unverified" as const,
};

const PARAMS: RectangularPadPedestalParameters = {
  padWidth: 1.8,
  padLength: 1.8,
  padThickness: 0.5,
  pedestalWidth: 0.5,
  pedestalLength: 0.5,
  pedestalHeight: 0.8,
};

function baseInstance(overrides: Partial<FoundationInstance> = {}): FoundationInstance {
  return {
    instanceId: "foundation-leg-ne",
    poleModelId: "synthetic-lattice-4leg-001",
    legId: "leg-ne",
    anchorId: "anchor-leg-ne",
    foundationTypeId: "rectangular-pad-pedestal-v1",
    parameters: PARAMS,
    position: { x: 2.0, y: 2.0 },
    orientationRadians: 0,
    baseElevation: -1.4, // -0.1 (anchor z) - 0.5 - 0.8 => solved to connect correctly
    visible: true,
    colour: "#8899aa",
    opacity: 1,
    provenance: BASE_PROVENANCE,
    ...overrides,
  };
}

describe("validateFoundationInstance: dimensions", () => {
  it("passes for a correctly-connected foundation with valid dimensions", () => {
    const parsed = parsePoleModel(loadSyntheticFixtureJson("pole-lattice-4leg.json"));
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    const anchorPos = placedAnchorPosition("anchor-leg-ne", parsed.data);

    const results = validateFoundationInstance(baseInstance(), anchorPos, NOW);
    expect(results).toHaveLength(0);
  });

  it("flags a non-positive dimension as blocking", () => {
    const parsed = parsePoleModel(loadSyntheticFixtureJson("pole-lattice-4leg.json"));
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    const anchorPos = placedAnchorPosition("anchor-leg-ne", parsed.data);

    const instance = baseInstance({ parameters: { ...PARAMS, padThickness: 0 } });
    const results = validateFoundationInstance(instance, anchorPos, NOW);
    expect(results.some((r) => r.ruleId === "foundation.non-positive-dimension")).toBe(true);
    expect(results.find((r) => r.ruleId === "foundation.non-positive-dimension")?.severity).toBe(
      "blocking"
    );
  });

  it("flags a negative dimension as blocking", () => {
    const parsed = parsePoleModel(loadSyntheticFixtureJson("pole-lattice-4leg.json"));
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    const anchorPos = placedAnchorPosition("anchor-leg-ne", parsed.data);

    const instance = baseInstance({ parameters: { ...PARAMS, pedestalWidth: -0.5 } });
    const results = validateFoundationInstance(instance, anchorPos, NOW);
    expect(results.some((r) => r.ruleId === "foundation.non-positive-dimension")).toBe(true);
  });
});

describe("validateFoundationInstance: connection mismatch", () => {
  it("flags a mismatched base elevation (foundation top does not meet the anchor) rather than silently accepting it", () => {
    const parsed = parsePoleModel(loadSyntheticFixtureJson("pole-lattice-4leg.json"));
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    const anchorPos = placedAnchorPosition("anchor-leg-ne", parsed.data);

    // Deliberately wrong base elevation: 20 cm too low.
    const instance = baseInstance({ baseElevation: -1.6 });
    const results = validateFoundationInstance(instance, anchorPos, NOW);
    const mismatch = results.find((r) => r.ruleId === "foundation.connection-mismatch");
    expect(mismatch).toBeDefined();
    expect(mismatch?.severity).toBe("warning");
  });

  it("flags a horizontal position mismatch even when elevation matches", () => {
    const parsed = parsePoleModel(loadSyntheticFixtureJson("pole-lattice-4leg.json"));
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    const anchorPos = placedAnchorPosition("anchor-leg-ne", parsed.data);

    const instance = baseInstance({ position: { x: anchorPos.x + 0.5, y: anchorPos.y } });
    const results = validateFoundationInstance(instance, anchorPos, NOW);
    expect(results.some((r) => r.ruleId === "foundation.connection-mismatch")).toBe(true);
  });
});
