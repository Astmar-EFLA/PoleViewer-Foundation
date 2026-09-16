import { describe, expect, it } from "vitest";
import { buildSyntheticDemoProject } from "./buildSyntheticDemoProject";
import { computeExcavationMaterialQuantities, UNCLASSIFIED_MATERIAL_CATEGORY } from "./excavationMaterialQuantities";

describe("computeExcavationMaterialQuantities", () => {
  it("returns a calculated total and a per-category breakdown for the synthetic demo project", () => {
    const project = buildSyntheticDemoProject();
    const result = computeExcavationMaterialQuantities(project);

    expect(result.status).toBe("calculated");
    expect(result.totalVolumeM3).not.toBeNull();
    expect(result.totalVolumeM3!).toBeGreaterThan(0);
    expect(result.excavationsCalculated).toBe(project.excavationInstances.length);
    expect(result.excavationsBlocked).toBe(0);
    expect(result.byCategory.length).toBeGreaterThan(0);

    // Every category slice (including any "unclassified" remainder, e.g. from
    // sloped terrain making the layer boundary at the footprint centre not
    // exactly match the excavation's own perimeter-mean top elevation) should
    // sum back to the excavation's total volume -- nothing silently dropped.
    const sum = result.byCategory.reduce((s, c) => s + c.volumeM3, 0);
    expect(sum).toBeCloseTo(result.totalVolumeM3!, 3);
    // The demo's three geotech layers (topsoil/loose-soil/competent-bearing)
    // span most of each excavation's depth range, so most of the total
    // should land in a real category, not "unclassified".
    const unclassified = result.byCategory.find((c) => c.category === UNCLASSIFIED_MATERIAL_CATEGORY)?.volumeM3 ?? 0;
    expect(unclassified).toBeLessThan(result.totalVolumeM3! * 0.5);

    // Sorted by descending volume.
    for (let i = 1; i < result.byCategory.length; i += 1) {
      expect(result.byCategory[i - 1]!.volumeM3).toBeGreaterThanOrEqual(result.byCategory[i]!.volumeM3);
    }
  });

  it("reports no-terrain-surface when the project has no terrain", () => {
    const project = { ...buildSyntheticDemoProject(), terrainSurface: null };
    const result = computeExcavationMaterialQuantities(project);
    expect(result.status).toBe("no-terrain-surface");
    expect(result.totalVolumeM3).toBeNull();
    expect(result.byCategory).toEqual([]);
  });

  it("reports no-excavations when the project has none", () => {
    const project = { ...buildSyntheticDemoProject(), excavationInstances: [] };
    const result = computeExcavationMaterialQuantities(project);
    expect(result.status).toBe("no-excavations");
    expect(result.totalVolumeM3).toBeNull();
  });

  it("falls back to the unclassified bucket for depth no geotech layer covers", () => {
    const project = buildSyntheticDemoProject();
    // Remove the geotech layers so nothing can be classified.
    const result = computeExcavationMaterialQuantities({ ...project, geotechLayers: [] });

    expect(result.status).toBe("calculated");
    expect(result.byCategory).toHaveLength(1);
    expect(result.byCategory[0]!.category).toBe(UNCLASSIFIED_MATERIAL_CATEGORY);
    expect(result.byCategory[0]!.volumeM3).toBeCloseTo(result.totalVolumeM3!, 3);
  });
});
