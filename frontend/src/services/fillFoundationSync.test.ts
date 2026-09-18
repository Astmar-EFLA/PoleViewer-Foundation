import { describe, expect, it } from "vitest";
import type { FillInstance } from "../domain/fill";
import type { FoundationInstance } from "../domain/foundation";
import { generateFoundationGeometry } from "../geometry/foundationGeometry";
import { syncFillTopsToFoundations, syncFoundationBaseToFill, syncUpliftFillTopsToFoundations } from "./fillFoundationSync";

const PROVENANCE = { originType: "assumed" as const, verificationState: "unverified" as const };

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
    opacity: 0.35,
    visible: true,
    wireframe: false,
    provenance: PROVENANCE,
    ...overrides,
  };
}

describe("syncFillTopsToFoundations", () => {
  it("pulls a fill's top elevation to match its foundation's base when they differ", () => {
    const foundations = [foundation({ baseElevation: 3.5 })];
    const fills = [fill({ topElevationM: 2.0 })];
    const result = syncFillTopsToFoundations(fills, foundations);
    expect(result[0]!.topElevationM).toBe(3.5);
  });

  it("returns the same instance (referential no-op) when already in sync", () => {
    const foundations = [foundation({ baseElevation: 2.0 })];
    const fills = [fill({ topElevationM: 2.0 })];
    const result = syncFillTopsToFoundations(fills, foundations);
    expect(result[0]).toBe(fills[0]);
  });

  it("leaves a fill unchanged if its foundation can't be found", () => {
    const fills = [fill({ foundationInstanceId: "does-not-exist" })];
    const result = syncFillTopsToFoundations(fills, [foundation()]);
    expect(result[0]).toBe(fills[0]);
  });
});

describe("syncFoundationBaseToFill", () => {
  it("pulls a foundation's base elevation to match a directly-edited fill top", () => {
    const foundations = [foundation({ baseElevation: 2.0 })];
    const editedFill = fill({ topElevationM: 4.0 });
    const result = syncFoundationBaseToFill(foundations, editedFill);
    expect(result[0]!.baseElevation).toBe(4.0);
  });

  it("only updates the foundation the fill is linked to", () => {
    const foundations = [foundation({ instanceId: "a", baseElevation: 2.0 }), foundation({ instanceId: "b", baseElevation: 5.0 })];
    const editedFill = fill({ foundationInstanceId: "a", topElevationM: 4.0 });
    const result = syncFoundationBaseToFill(foundations, editedFill);
    expect(result.find((f) => f.instanceId === "a")!.baseElevation).toBe(4.0);
    expect(result.find((f) => f.instanceId === "b")!.baseElevation).toBe(5.0);
  });
});

describe("syncUpliftFillTopsToFoundations", () => {
  it("pulls an uplift-fill's top elevation to the foundation's own top (pad + pedestal), not its base", () => {
    // baseElevation 2.0 + padThickness 0.5 + pedestalHeight 0.8 = 3.3 (topConnectionPoint.z).
    const foundations = [foundation({ baseElevation: 2.0 })];
    const upliftFills = [fill({ topElevationM: 0 })];
    const result = syncUpliftFillTopsToFoundations(upliftFills, foundations);
    expect(result[0]!.topElevationM).toBeCloseTo(3.3, 9);
  });

  it("targets a different elevation than the base-fill sync for the same foundation", () => {
    const foundations = [foundation({ baseElevation: 2.0 })];
    const baseFillResult = syncFillTopsToFoundations([fill({ topElevationM: 0 })], foundations);
    const upliftFillResult = syncUpliftFillTopsToFoundations([fill({ topElevationM: 0 })], foundations);
    expect(baseFillResult[0]!.topElevationM).toBe(2.0);
    expect(upliftFillResult[0]!.topElevationM).toBeCloseTo(3.3, 9);
    expect(upliftFillResult[0]!.topElevationM).not.toBe(baseFillResult[0]!.topElevationM);
  });

  it("returns the same instance (referential no-op) when already in sync", () => {
    const f = foundation({ baseElevation: 2.0 });
    const topConnectionZ = generateFoundationGeometry(f).topConnectionPoint.z;
    const upliftFills = [fill({ topElevationM: topConnectionZ })];
    const result = syncUpliftFillTopsToFoundations(upliftFills, [f]);
    expect(result[0]).toBe(upliftFills[0]);
  });

  it("leaves an uplift-fill unchanged if its foundation can't be found", () => {
    const upliftFills = [fill({ foundationInstanceId: "does-not-exist" })];
    const result = syncUpliftFillTopsToFoundations(upliftFills, [foundation()]);
    expect(result[0]).toBe(upliftFills[0]);
  });
});
