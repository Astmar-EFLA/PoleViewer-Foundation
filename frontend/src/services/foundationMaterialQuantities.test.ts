import { describe, expect, it } from "vitest";
import { generateFoundationGeometry } from "../geometry/foundationGeometry";
import { computeFoundationConcreteVolume } from "../geometry/foundationVolume";
import { buildSyntheticDemoProject } from "./buildSyntheticDemoProject";
import type { VolumeByFoundation } from "./foundationMaterialQuantities";
import { addVolumeByFoundation, computeFoundationMaterialQuantities } from "./foundationMaterialQuantities";

describe("computeFoundationMaterialQuantities", () => {
  it("reports each foundation's concrete volume in instance order, summing to the total", () => {
    const project = buildSyntheticDemoProject();
    const result = computeFoundationMaterialQuantities(project);

    expect(result.status).toBe("calculated");
    expect(result.byFoundation.map((f) => f.foundationInstanceId)).toEqual(
      project.foundationInstances.map((f) => f.instanceId)
    );
    project.foundationInstances.forEach((foundation, i) => {
      expect(result.byFoundation[i]!.displayLabel).toBe(foundation.displayLabel);
      expect(result.byFoundation[i]!.volumeM3).toBeCloseTo(
        computeFoundationConcreteVolume(generateFoundationGeometry(foundation)),
        9
      );
    });
    const sum = result.byFoundation.reduce((s, f) => s + f.volumeM3!, 0);
    expect(result.totalVolumeM3).toBeCloseTo(sum, 9);
    expect(result.totalVolumeM3!).toBeGreaterThan(0);
  });

  it("needs no terrain surface", () => {
    const project = { ...buildSyntheticDemoProject(), terrainSurface: null };
    expect(computeFoundationMaterialQuantities(project).status).toBe("calculated");
  });

  it("reports no-foundations when the project has none", () => {
    const project = { ...buildSyntheticDemoProject(), foundationInstances: [] };
    const result = computeFoundationMaterialQuantities(project);
    expect(result.status).toBe("no-foundations");
    expect(result.totalVolumeM3).toBeNull();
    expect(result.byFoundation).toEqual([]);
  });
});

describe("addVolumeByFoundation", () => {
  it("sums repeated entries for the same foundation", () => {
    const entries = new Map<string, VolumeByFoundation>();
    addVolumeByFoundation(entries, "f1", "Leg A", 2);
    addVolumeByFoundation(entries, "f1", "Leg A", 3);
    expect(entries.get("f1")?.volumeM3).toBe(5);
  });

  it("marks a foundation not calculated if any of its entries is blocked", () => {
    const entries = new Map<string, VolumeByFoundation>();
    addVolumeByFoundation(entries, "f1", "Leg A", 2);
    addVolumeByFoundation(entries, "f1", "Leg A", null);
    addVolumeByFoundation(entries, "f1", "Leg A", 3);
    expect(entries.get("f1")?.volumeM3).toBeNull();
  });
});
