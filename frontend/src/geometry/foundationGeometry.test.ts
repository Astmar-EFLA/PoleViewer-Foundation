import { describe, expect, it } from "vitest";
import type {
  FoundationInstance,
  RectangularPadPedestalParameters,
  SteppedRectangularParameters,
} from "../domain/foundation";
import { loadSyntheticFixtureJson } from "../tests/fixtures";
import { parsePoleModel } from "../validation/poleModelSchema";
import { placedAnchorPosition } from "./polePlacement";
import { generateFoundationGeometry } from "./foundationGeometry";

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
  parameters: FoundationInstance["parameters"]
): FoundationInstance {
  return {
    instanceId: `foundation-${legId}`,
    poleModelId: "synthetic-lattice-4leg-001",
    legId,
    anchorId,
    foundationTypeId:
      parameters.geometryType === "rectangular-pad-pedestal"
        ? "rectangular-pad-pedestal-v1"
        : "stepped-rectangular-v1",
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

describe("generateFoundationGeometry: rectangular-pad-pedestal", () => {
  const params: RectangularPadPedestalParameters = {
    geometryType: "rectangular-pad-pedestal",
    padWidth: 2.0,
    padLength: 2.0,
    padThickness: 0.6,
    pedestalWidth: 0.6,
    pedestalLength: 0.6,
    pedestalHeight: 0.9,
  };

  it("computes pad/pedestal centres and top connection point from base elevation and parameters", () => {
    const instance = instanceFor("leg-a", "anchor-leg-a", { x: -1.5, y: 0 }, -1.5, params);
    const geometry = generateFoundationGeometry(instance);

    expect(geometry.parts).toHaveLength(2);
    const [pad, pedestal] = geometry.parts;
    expect(pad!.centre.z).toBeCloseTo(-1.5 + 0.3, 9); // baseElevation + padThickness/2
    expect(pedestal!.centre.z).toBeCloseTo(-1.5 + 0.6 + 0.45, 9); // + padThickness + pedestalHeight/2
    expect(geometry.topConnectionPoint.z).toBeCloseTo(-1.5 + 0.6 + 0.9, 9); // + padThickness + pedestalHeight
    expect(geometry.topConnectionPoint.x).toBeCloseTo(-1.5, 9);
    expect(geometry.topConnectionPoint.y).toBeCloseTo(0, 9);
  });

  it("half-extents reflect the instance's own dimensions", () => {
    const instance = instanceFor("leg-a", "anchor-leg-a", { x: 0, y: 0 }, 0, params);
    const geometry = generateFoundationGeometry(instance);
    const [pad, pedestal] = geometry.parts;
    expect(pad!.halfExtents.x).toBeCloseTo(1.0, 9);
    expect(pedestal!.halfExtents.z).toBeCloseTo(0.45, 9);
  });
});

describe("generateFoundationGeometry: stepped-rectangular", () => {
  const params: SteppedRectangularParameters = {
    geometryType: "stepped-rectangular",
    steps: [
      { width: 2.0, length: 2.0, height: 0.4 },
      { width: 1.2, length: 1.2, height: 0.4 },
      { width: 0.5, length: 0.5, height: 0.5 },
    ],
  };

  it("stacks steps bottom to top, each centred on the instance's own position", () => {
    const instance = instanceFor("leg-a", "anchor-leg-a", { x: 3, y: -2 }, 10.0, params);
    const geometry = generateFoundationGeometry(instance);

    expect(geometry.parts).toHaveLength(3);
    expect(geometry.parts[0]!.centre.z).toBeCloseTo(10.0 + 0.2, 9); // base + step0.height/2
    expect(geometry.parts[1]!.centre.z).toBeCloseTo(10.0 + 0.4 + 0.2, 9); // + step0.height + step1.height/2
    expect(geometry.parts[2]!.centre.z).toBeCloseTo(10.0 + 0.4 + 0.4 + 0.25, 9);
    for (const part of geometry.parts) {
      expect(part.centre.x).toBeCloseTo(3, 9);
      expect(part.centre.y).toBeCloseTo(-2, 9);
    }
    expect(geometry.topConnectionPoint.z).toBeCloseTo(10.0 + 0.4 + 0.4 + 0.5, 9); // sum of all step heights
  });

  it("half-extents reflect each step's own width/length", () => {
    const instance = instanceFor("leg-a", "anchor-leg-a", { x: 0, y: 0 }, 0, params);
    const geometry = generateFoundationGeometry(instance);
    expect(geometry.parts[0]!.halfExtents.x).toBeCloseTo(1.0, 9);
    expect(geometry.parts[2]!.halfExtents.x).toBeCloseTo(0.25, 9);
  });

  it("a single-step foundation still produces a valid top connection point", () => {
    const oneStep: SteppedRectangularParameters = {
      geometryType: "stepped-rectangular",
      steps: [{ width: 1, length: 1, height: 0.6 }],
    };
    const instance = instanceFor("leg-a", "anchor-leg-a", { x: 0, y: 0 }, -1, oneStep);
    const geometry = generateFoundationGeometry(instance);
    expect(geometry.parts).toHaveLength(1);
    expect(geometry.topConnectionPoint.z).toBeCloseTo(-1 + 0.6, 9);
  });
});

describe("independent per-leg foundations (4-leg lattice fixture)", () => {
  it("each foundation's top meets its own leg's placed anchor, at that leg's own elevation", () => {
    const parsed = parsePoleModel(loadSyntheticFixtureJson("pole-lattice-4leg.json"));
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;

    const commonParams: RectangularPadPedestalParameters = {
      geometryType: "rectangular-pad-pedestal",
      padWidth: 1.8,
      padLength: 1.8,
      padThickness: 0.5,
      pedestalWidth: 0.5,
      pedestalLength: 0.5,
      pedestalHeight: 0.8,
    };

    const instances = parsed.data.structuralLegs.map((leg) => {
      const anchorPos = placedAnchorPosition(leg.linkedFoundationAnchorId, parsed.data);
      const baseElevation = anchorPos.z - commonParams.padThickness - commonParams.pedestalHeight;
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

    const anchorElevations = instances.map((i) => i.anchorPos.z);
    expect(new Set(anchorElevations).size).toBe(4);

    for (const { anchorPos, instance } of instances) {
      const geometry = generateFoundationGeometry(instance);
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
      geometryType: "rectangular-pad-pedestal",
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
    const geometryBBefore = generateFoundationGeometry(instanceBBefore);

    const instanceAEdited = { ...instanceA, parameters: paramsB };
    generateFoundationGeometry(instanceAEdited);

    const geometryBAfter = generateFoundationGeometry(instanceBBefore);
    expect(geometryBAfter).toEqual(geometryBBefore);
  });

  it("different legs may use entirely different foundation types independently", () => {
    const parsed = parsePoleModel(loadSyntheticFixtureJson("pole-lattice-4leg.json"));
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;

    const padParams: RectangularPadPedestalParameters = {
      geometryType: "rectangular-pad-pedestal",
      padWidth: 1.8,
      padLength: 1.8,
      padThickness: 0.5,
      pedestalWidth: 0.5,
      pedestalLength: 0.5,
      pedestalHeight: 0.8,
    };
    const steppedParams: SteppedRectangularParameters = {
      geometryType: "stepped-rectangular",
      steps: [
        { width: 2.0, length: 2.0, height: 0.4 },
        { width: 1.0, length: 1.0, height: 0.6 },
      ],
    };

    const anchorNe = placedAnchorPosition("anchor-leg-ne", parsed.data);
    const anchorSe = placedAnchorPosition("anchor-leg-se", parsed.data);

    const padInstance = instanceFor(
      "leg-ne",
      "anchor-leg-ne",
      { x: anchorNe.x, y: anchorNe.y },
      anchorNe.z - padParams.padThickness - padParams.pedestalHeight,
      padParams
    );
    const steppedInstance = instanceFor(
      "leg-se",
      "anchor-leg-se",
      { x: anchorSe.x, y: anchorSe.y },
      anchorSe.z - 1.0,
      steppedParams
    );

    expect(generateFoundationGeometry(padInstance).parts).toHaveLength(2);
    expect(generateFoundationGeometry(steppedInstance).parts).toHaveLength(2);
    expect(generateFoundationGeometry(padInstance).topConnectionPoint.z).toBeCloseTo(anchorNe.z, 9);
    expect(generateFoundationGeometry(steppedInstance).topConnectionPoint.z).toBeCloseTo(anchorSe.z, 9);
  });
});
