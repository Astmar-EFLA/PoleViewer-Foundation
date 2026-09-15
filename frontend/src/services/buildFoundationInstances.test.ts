import { describe, expect, it } from "vitest";
import { FOUNDATION_LIBRARY, requireFoundationTypeById } from "../domain/foundationLibrary";
import { placedAnchorPosition } from "../geometry/polePlacement";
import { generateFoundationGeometry } from "../geometry/foundationGeometry";
import { loadSyntheticFixtureJson } from "../tests/fixtures";
import { parsePoleModel } from "../validation/poleModelSchema";
import { validateFoundationInstance } from "../validation/foundationValidation";
import {
  buildDefaultFoundationInstances,
  buildFoundationInstanceForLeg,
  withFoundationType,
} from "./buildFoundationInstances";

const NOW = "2026-09-15T00:00:00.000Z";
const PAD_PEDESTAL = requireFoundationTypeById("rectangular-pad-pedestal-v1");
const STEPPED = requireFoundationTypeById("stepped-rectangular-v1");

describe("buildDefaultFoundationInstances", () => {
  it("produces one foundation per leg, each passing its own connection-mismatch validation, for the 4-leg lattice fixture", () => {
    const parsed = parsePoleModel(loadSyntheticFixtureJson("pole-lattice-4leg.json"));
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;

    const instances = buildDefaultFoundationInstances(parsed.data, PAD_PEDESTAL, NOW);
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

    const instances = buildDefaultFoundationInstances(parsed.data, PAD_PEDESTAL, NOW);
    const baseElevations = instances.map((i) => i.baseElevation);
    expect(new Set(baseElevations).size).toBe(4);
  });

  it("solves the correct base elevation for a stepped-rectangular default too (type-agnostic height solving)", () => {
    const parsed = parsePoleModel(loadSyntheticFixtureJson("pole-lattice-4leg.json"));
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;

    const instances = buildDefaultFoundationInstances(parsed.data, STEPPED, NOW);
    for (const instance of instances) {
      const anchorPos = placedAnchorPosition(instance.anchorId, parsed.data);
      const results = validateFoundationInstance(instance, anchorPos, NOW);
      expect(results.filter((r) => r.ruleId === "foundation.connection-mismatch")).toHaveLength(0);
    }
  });

  it("provenance is library-default when no override is supplied", () => {
    const parsed = parsePoleModel(loadSyntheticFixtureJson("pole-lattice-4leg.json"));
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;

    const [instance] = buildDefaultFoundationInstances(parsed.data, PAD_PEDESTAL, NOW);
    expect(instance!.provenance.originType).toBe("library-default");
  });
});

describe("buildFoundationInstanceForLeg with a user override", () => {
  it("tags provenance as user-entered when a parameter override is supplied, and still connects correctly", () => {
    const parsed = parsePoleModel(loadSyntheticFixtureJson("pole-lattice-4leg.json"));
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;

    const overrideParams = { ...PAD_PEDESTAL.defaultParameters, padWidth: 2.5 } as typeof PAD_PEDESTAL.defaultParameters;
    const instance = buildFoundationInstanceForLeg(parsed.data, "leg-ne", PAD_PEDESTAL, NOW, overrideParams);

    expect(instance.provenance.originType).toBe("user-entered");
    expect(instance.parameters).toEqual(overrideParams);

    const anchorPos = placedAnchorPosition(instance.anchorId, parsed.data);
    const results = validateFoundationInstance(instance, anchorPos, NOW);
    expect(results.filter((r) => r.ruleId === "foundation.connection-mismatch")).toHaveLength(0);
  });
});

describe("withFoundationType", () => {
  it("changes a leg from one foundation type to another while preserving connection to its own anchor", () => {
    const parsed = parsePoleModel(loadSyntheticFixtureJson("pole-lattice-4leg.json"));
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;

    const [original] = buildDefaultFoundationInstances(parsed.data, PAD_PEDESTAL, NOW);
    const changed = withFoundationType(original!, parsed.data, STEPPED, NOW);

    expect(changed.foundationTypeId).toBe("stepped-rectangular-v1");
    expect(changed.parameters.geometryType).toBe("stepped-rectangular");
    // legId/anchorId/position are unchanged -- this is a type swap, not a new placement.
    expect(changed.legId).toBe(original!.legId);
    expect(changed.anchorId).toBe(original!.anchorId);
    expect(changed.position).toEqual(original!.position);

    const anchorPos = placedAnchorPosition(changed.anchorId, parsed.data);
    const results = validateFoundationInstance(changed, anchorPos, NOW);
    expect(results.filter((r) => r.ruleId === "foundation.connection-mismatch")).toHaveLength(0);
  });

  it("preserves visibility/colour/opacity/instanceId when swapping type (only geometry-affecting fields change)", () => {
    const parsed = parsePoleModel(loadSyntheticFixtureJson("pole-lattice-4leg.json"));
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;

    const [original] = buildDefaultFoundationInstances(parsed.data, PAD_PEDESTAL, NOW);
    const edited = { ...original!, visible: false, colour: "#123456", opacity: 0.4 };
    const changed = withFoundationType(edited, parsed.data, STEPPED, NOW);

    expect(changed.instanceId).toBe(edited.instanceId);
    expect(changed.visible).toBe(false);
    expect(changed.colour).toBe("#123456");
    expect(changed.opacity).toBe(0.4);
  });
});

describe("foundation library sanity", () => {
  it("every library entry's default parameters generate valid (non-empty) geometry", () => {
    for (const type of FOUNDATION_LIBRARY) {
      const geometry = generateFoundationGeometry({
        instanceId: "sanity",
        poleModelId: "sanity",
        legId: "sanity",
        anchorId: "sanity",
        foundationTypeId: type.foundationTypeId,
        parameters: type.defaultParameters,
        position: { x: 0, y: 0 },
        orientationRadians: 0,
        baseElevation: 0,
        visible: true,
        colour: type.defaultColour,
        opacity: type.defaultOpacity,
        provenance: { originType: "library-default", verificationState: "unverified" },
      });
      expect(geometry.parts.length).toBeGreaterThan(0);
    }
  });

  it("has no duplicate foundationTypeId entries", () => {
    const ids = FOUNDATION_LIBRARY.map((t) => t.foundationTypeId);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
