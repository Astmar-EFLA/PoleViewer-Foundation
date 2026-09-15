import { describe, expect, it } from "vitest";
import type { FoundationInstance, RectangularPadPedestalParameters } from "../domain/foundation";
import { loadSyntheticFixtureJson } from "../tests/fixtures";
import { parsePoleModel } from "../validation/poleModelSchema";
import { placedAnchorPosition } from "./polePlacement";
import { generateRectangularPadPedestalGeometry } from "./foundationGeometry";

const BASE_PROVENANCE = {
  originType: "assumed" as const,
  verificationState: "unverified" as const,
  notes: "Synthetic fixture.",
};

function instanceFor(
  legId: string,
  anchorId: string,
  position: { x: number; y: number },
  baseElevation: number,
  parameters: RectangularPadPedestalParameters
): FoundationInstance {
  return {
    instanceId: `foundation-${legId}`,
    poleModelId: "synthetic-lattice-4leg-001",
    legId,
    anchorId,
    foundationTypeId: "rectangular-pad-pedestal-v1",
    parameters,
    position,
    orientationRadians: 0,
    baseElevation,
    visible: true,
    colour: "#8899aa",
    opacity: 1,
    provenance: BASE_PROVENANCE,
  };
}

describe("generateRectangularPadPedestalGeometry", () => {
  const params: RectangularPadPedestalParameters = {
    padWidth: 2.0,
    padLength: 2.0,
    padThickness: 0.6,
    pedestalWidth: 0.6,
    pedestalLength: 0.6,
    pedestalHeight: 0.9,
  };

  it("computes pad/pedestal centres and top connection point from base elevation and parameters", () => {
    const instance = instanceFor("leg-a", "anchor-leg-a", { x: -1.5, y: 0 }, -1.5, params);
    const geometry = generateRectangularPadPedestalGeometry(instance);

    expect(geometry.pad.centre.z).toBeCloseTo(-1.5 + 0.3, 9); // baseElevation + padThickness/2
    expect(geometry.pedestal.centre.z).toBeCloseTo(-1.5 + 0.6 + 0.45, 9); // + padThickness + pedestalHeight/2
    expect(geometry.topConnectionPoint.z).toBeCloseTo(-1.5 + 0.6 + 0.9, 9); // + padThickness + pedestalHeight
    expect(geometry.topConnectionPoint.x).toBeCloseTo(-1.5, 9);
    expect(geometry.topConnectionPoint.y).toBeCloseTo(0, 9);
  });

  it("half-extents reflect the instance's own dimensions", () => {
    const instance = instanceFor("leg-a", "anchor-leg-a", { x: 0, y: 0 }, 0, params);
    const geometry = generateRectangularPadPedestalGeometry(instance);
    expect(geometry.pad.halfExtents.x).toBeCloseTo(1.0, 9);
    expect(geometry.pedestal.halfExtents.z).toBeCloseTo(0.45, 9);
  });
});

describe("independent per-leg foundations (4-leg lattice fixture)", () => {
  it("each foundation's pedestal top meets its own leg's placed anchor, at that leg's own elevation", () => {
    const parsed = parsePoleModel(loadSyntheticFixtureJson("pole-lattice-4leg.json"));
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;

    const commonParams: RectangularPadPedestalParameters = {
      padWidth: 1.8,
      padLength: 1.8,
      padThickness: 0.5,
      pedestalWidth: 0.5,
      pedestalLength: 0.5,
      pedestalHeight: 0.8,
    };

    const instances = parsed.data.structuralLegs.map((leg) => {
      const anchorPos = placedAnchorPosition(leg.linkedFoundationAnchorId, parsed.data);
      // baseElevation solved so this foundation's own top meets this leg's own anchor exactly.
      const baseElevation =
        anchorPos.z - commonParams.padThickness - commonParams.pedestalHeight;
      return {
        leg,
        anchorPos,
        instance: instanceFor(
          leg.id,
          leg.linkedFoundationAnchorId,
          { x: anchorPos.x, y: anchorPos.y },
          baseElevation,
          commonParams
        ),
      };
    });

    // Confirm the fixture really does have 4 distinct elevations, so this
    // test is actually exercising "independent per-leg elevation", not
    // coincidentally uniform data.
    const anchorElevations = instances.map((i) => i.anchorPos.z);
    expect(new Set(anchorElevations).size).toBe(4);

    for (const { anchorPos, instance } of instances) {
      const geometry = generateRectangularPadPedestalGeometry(instance);
      expect(geometry.topConnectionPoint.x).toBeCloseTo(anchorPos.x, 9);
      expect(geometry.topConnectionPoint.y).toBeCloseTo(anchorPos.y, 9);
      expect(geometry.topConnectionPoint.z).toBeCloseTo(anchorPos.z, 9);
    }
  });

  it("changing one foundation's parameters does not affect another foundation's geometry", () => {
    const parsed = parsePoleModel(loadSyntheticFixtureJson("pole-lattice-4leg.json"));
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;

    const paramsA: RectangularPadPedestalParameters = {
      padWidth: 1.8,
      padLength: 1.8,
      padThickness: 0.5,
      pedestalWidth: 0.5,
      pedestalLength: 0.5,
      pedestalHeight: 0.8,
    };
    const paramsB: RectangularPadPedestalParameters = { ...paramsA, padWidth: 3.2, padThickness: 1.1 };

    const anchorA = placedAnchorPosition("anchor-leg-ne", parsed.data);
    const anchorB = placedAnchorPosition("anchor-leg-se", parsed.data);

    const instanceA = instanceFor(
      "leg-ne",
      "anchor-leg-ne",
      { x: anchorA.x, y: anchorA.y },
      anchorA.z - paramsA.padThickness - paramsA.pedestalHeight,
      paramsA
    );
    const instanceBBefore = instanceFor(
      "leg-se",
      "anchor-leg-se",
      { x: anchorB.x, y: anchorB.y },
      anchorB.z - paramsA.padThickness - paramsA.pedestalHeight,
      paramsA
    );
    const geometryBBefore = generateRectangularPadPedestalGeometry(instanceBBefore);

    // Now "edit" foundation A only (a new instance object, as an edit would produce).
    const instanceAEdited = { ...instanceA, parameters: paramsB };
    generateRectangularPadPedestalGeometry(instanceAEdited);

    // B's instance object and its previously computed geometry are untouched.
    const geometryBAfter = generateRectangularPadPedestalGeometry(instanceBBefore);
    expect(geometryBAfter).toEqual(geometryBBefore);
  });
});
