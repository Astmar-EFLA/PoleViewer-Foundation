import { describe, expect, it } from "vitest";
import type { RectangularPadPedestalParameters } from "../domain/foundation";
import { placedAnchorPosition } from "../geometry/polePlacement";
import { loadSyntheticFixtureJson } from "../tests/fixtures";
import { parsePoleModel } from "../validation/poleModelSchema";
import { validateFoundationInstance } from "../validation/foundationValidation";
import { buildDefaultFoundationInstances } from "./buildFoundationInstances";

const NOW = "2026-09-15T00:00:00.000Z";
const PARAMS: RectangularPadPedestalParameters = {
  padWidth: 1.8,
  padLength: 1.8,
  padThickness: 0.5,
  pedestalWidth: 0.5,
  pedestalLength: 0.5,
  pedestalHeight: 0.8,
};

describe("buildDefaultFoundationInstances", () => {
  it("produces one foundation per leg, each passing its own connection-mismatch validation, for the 4-leg lattice fixture", () => {
    const parsed = parsePoleModel(loadSyntheticFixtureJson("pole-lattice-4leg.json"));
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;

    const instances = buildDefaultFoundationInstances(parsed.data, PARAMS, NOW);
    expect(instances).toHaveLength(4);

    const legIds = instances.map((i) => i.legId);
    expect(new Set(legIds).size).toBe(4);

    for (const instance of instances) {
      const anchorPos = placedAnchorPosition(instance.anchorId, parsed.data);
      const results = validateFoundationInstance(instance, anchorPos, NOW);
      expect(results.filter((r) => r.ruleId === "foundation.connection-mismatch")).toHaveLength(0);
    }
  });

  it("gives each leg an independent base elevation reflecting that leg's own anchor level", () => {
    const parsed = parsePoleModel(loadSyntheticFixtureJson("pole-lattice-4leg.json"));
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;

    const instances = buildDefaultFoundationInstances(parsed.data, PARAMS, NOW);
    const baseElevations = instances.map((i) => i.baseElevation);
    expect(new Set(baseElevations).size).toBe(4);
  });
});
