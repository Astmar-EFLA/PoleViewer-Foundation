import { describe, expect, it } from "vitest";
import type { FillInstance } from "../domain/fill";
import { queryElevation } from "../geometry/terrain";
import { validateUpliftFillInstance } from "../validation/fillValidation";
import { buildSyntheticDemoProject } from "./buildSyntheticDemoProject";
import { computeFillMaterialQuantities } from "./fillMaterialQuantities";
import { buildDefaultUpliftFillInstances } from "./projectDefaults";

const PROVENANCE = { originType: "assumed" as const, verificationState: "unverified" as const };

/**
 * The demo project's default fill instances (buildDefaultFillInstances)
 * mirror each foundation's own baseElevation, which in the demo sits
 * *below* terrain (the demo represents an excavation scenario) -- not a
 * meaningful fill case. These tests instead give each fill a top elevation
 * genuinely above the terrain at its own foundation, the actual case this
 * feature exists for.
 */
function withFillsAboveTerrain(project: ReturnType<typeof buildSyntheticDemoProject>) {
  const terrainSurface = project.terrainSurface!;
  const fillInstances: FillInstance[] = project.foundationInstances.map((foundation) => {
    const terrainZ = queryElevation(terrainSurface, foundation.position.x, foundation.position.y).elevation ?? 0;
    const topElevationM = terrainZ + 3;
    return {
      id: `fill-${foundation.instanceId}`,
      foundationInstanceId: foundation.instanceId,
      topElevationM,
      workingSpaceOffsetM: 0.5,
      sideSlope: { h: 2, v: 1 },
      colour: "#8a6d3b",
      opacity: 0.35,
      visible: true,
      wireframe: false,
      provenance: PROVENANCE,
    };
  });
  return { ...project, fillInstances };
}

describe("computeFillMaterialQuantities", () => {
  it("returns a calculated total for fills genuinely above terrain", () => {
    const project = withFillsAboveTerrain(buildSyntheticDemoProject());
    const result = computeFillMaterialQuantities(project);

    expect(result.status).toBe("calculated");
    expect(result.totalVolumeM3).not.toBeNull();
    expect(result.totalVolumeM3!).toBeGreaterThan(0);
    expect(result.fillsCalculated).toBe(project.fillInstances.length);
    expect(result.fillsBlocked).toBe(0);
  });

  it("reports no-terrain-surface when the project has no terrain", () => {
    const project = { ...withFillsAboveTerrain(buildSyntheticDemoProject()), terrainSurface: null };
    const result = computeFillMaterialQuantities(project);
    expect(result.status).toBe("no-terrain-surface");
    expect(result.totalVolumeM3).toBeNull();
  });

  it("reports no-fills when the project has none", () => {
    const project = { ...buildSyntheticDemoProject(), fillInstances: [] };
    const result = computeFillMaterialQuantities(project);
    expect(result.status).toBe("no-fills");
    expect(result.totalVolumeM3).toBeNull();
  });

  it("excludes a fill that does not reach its foundation from the total, counting it as blocked", () => {
    const project = withFillsAboveTerrain(buildSyntheticDemoProject());
    const brokenFillInstances = project.fillInstances.map((f, i) =>
      i === 0 ? { ...f, topElevationM: f.topElevationM - 100 } : f
    );
    const result = computeFillMaterialQuantities({ ...project, fillInstances: brokenFillInstances });

    expect(result.status).toBe("calculated");
    expect(result.fillsBlocked).toBe(1);
    expect(result.fillsCalculated).toBe(brokenFillInstances.length - 1);
  });

  it("computes a calculated total for uplift-fill instances, passed explicitly with validateUpliftFillInstance", () => {
    const project = buildSyntheticDemoProject();
    const terrainSurface = project.terrainSurface!;
    // Shallow-buried (0.3m below terrain) so the foundation's own top
    // (base + padThickness 0.5 + pedestalHeight 0.8 = +1.0m) rises above
    // terrain -- the real case a pad-pedestal foundation represents, and
    // the one buildDefaultUpliftFillInstances needs to produce a
    // meaningfully positive cover volume.
    const shallowFoundations = project.foundationInstances.map((f) => {
      const terrainZ = queryElevation(terrainSurface, f.position.x, f.position.y).elevation ?? 0;
      return { ...f, baseElevation: terrainZ - 0.3 };
    });
    const upliftFillInstances = buildDefaultUpliftFillInstances(shallowFoundations);
    const result = computeFillMaterialQuantities(
      { ...project, foundationInstances: shallowFoundations },
      upliftFillInstances,
      validateUpliftFillInstance
    );

    expect(result.status).toBe("calculated");
    expect(result.totalVolumeM3).not.toBeNull();
    expect(result.totalVolumeM3!).toBeGreaterThan(0);
    expect(result.fillsCalculated).toBe(upliftFillInstances.length);
    expect(result.fillsBlocked).toBe(0);
  });
});
