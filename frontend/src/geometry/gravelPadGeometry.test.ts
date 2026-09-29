import { describe, expect, it } from "vitest";
import { DEFAULT_GRAVEL_PAD_THICKNESS_M } from "../domain/fill";
import { buildSyntheticDemoProject } from "../services/buildSyntheticDemoProject";
import { computeGravelPadMaterialQuantities } from "../services/fillMaterialQuantities";
import { excavationBottomFootprint, foundationBottomFootprint } from "./excavationGeometry";
import { excavationForPad, generateGravelPadBox, gravelPadVolumeM3 } from "./gravelPadGeometry";

function demoPad() {
  const project = buildSyntheticDemoProject();
  const pad = project.fillInstances[0]!;
  const foundation = project.foundationInstances.find((f) => f.instanceId === pad.foundationInstanceId)!;
  const excavation = excavationForPad(pad, project.excavationInstances)!;
  return { project, pad, foundation, excavation };
}

describe("generateGravelPadBox", () => {
  it("fills the whole excavation floor, from the foundation base down by the pad thickness", () => {
    const { pad, foundation, excavation } = demoPad();
    const box = generateGravelPadBox(pad, foundation, excavation);
    const floor = excavationBottomFootprint(foundationBottomFootprint(foundation), excavation.workingSpaceOffsetM);

    expect(box.halfExtents.x).toBeCloseTo(floor.halfWidth, 9);
    expect(box.halfExtents.y).toBeCloseTo(floor.halfLength, 9);
    expect(box.centre.x).toBeCloseTo(floor.centre.x, 9);
    expect(box.centre.y).toBeCloseTo(floor.centre.y, 9);
    expect(box.centre.z + box.halfExtents.z).toBeCloseTo(foundation.baseElevation, 9);
    expect(box.centre.z - box.halfExtents.z).toBeCloseTo(foundation.baseElevation - DEFAULT_GRAVEL_PAD_THICKNESS_M, 9);
    // ...which is exactly where the default excavation floor is dug to.
    expect(box.centre.z - box.halfExtents.z).toBeCloseTo(excavation.bottomElevationM, 9);
  });

  it("follows the excavation's working space, not its own", () => {
    const { pad, foundation, excavation } = demoPad();
    const wide = generateGravelPadBox({ ...pad, workingSpaceOffsetM: 0 }, foundation, { ...excavation, workingSpaceOffsetM: 1.2 });
    const floor = excavationBottomFootprint(foundationBottomFootprint(foundation), 1.2);
    expect(wide.halfExtents.x).toBeCloseTo(floor.halfWidth, 9);
  });

  it("falls back to its own working space when the foundation has no excavation", () => {
    const { pad, foundation } = demoPad();
    const box = generateGravelPadBox({ ...pad, workingSpaceOffsetM: 0.3 }, foundation);
    const floor = excavationBottomFootprint(foundationBottomFootprint(foundation), 0.3);
    expect(box.halfExtents.x).toBeCloseTo(floor.halfWidth, 9);
  });

  it("has volume = floor area x thickness", () => {
    const { pad, foundation, excavation } = demoPad();
    const box = generateGravelPadBox({ ...pad, padThicknessM: 0.35 }, foundation, excavation);
    expect(gravelPadVolumeM3(box)).toBeCloseTo(4 * box.halfExtents.x * box.halfExtents.y * 0.35, 9);
  });
});

describe("computeGravelPadMaterialQuantities", () => {
  it("reports every pad, needs no terrain, and totals the per-foundation volumes", () => {
    const { project } = demoPad();
    const result = computeGravelPadMaterialQuantities({ ...project, terrainSurface: null });

    expect(result.status).toBe("calculated");
    expect(result.fillsCalculated).toBe(project.fillInstances.length);
    expect(result.fillsBlocked).toBe(0);
    const sum = result.byFoundation.reduce((s, f) => s + (f.volumeM3 ?? 0), 0);
    expect(sum).toBeCloseTo(result.totalVolumeM3!, 9);
    expect(result.totalVolumeM3!).toBeGreaterThan(0);
  });

  it("counts a zero-thickness pad as blocked, never as a silent zero", () => {
    const { project } = demoPad();
    const fillInstances = project.fillInstances.map((f, i) => (i === 0 ? { ...f, padThicknessM: 0 } : f));
    const result = computeGravelPadMaterialQuantities({ ...project, fillInstances });
    expect(result.fillsBlocked).toBe(1);
    expect(result.byFoundation.find((f) => f.foundationInstanceId === fillInstances[0]!.foundationInstanceId)?.volumeM3).toBeNull();
  });
});
