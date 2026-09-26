import { describe, expect, it } from "vitest";
import { validateUpliftFillInstance } from "../validation/fillValidation";
import { buildSyntheticDemoProject } from "./buildSyntheticDemoProject";
import { computeExcavationMaterialQuantities } from "./excavationMaterialQuantities";
import { computeFillMaterialQuantities } from "./fillMaterialQuantities";
import { computeFoundationMaterialQuantities } from "./foundationMaterialQuantities";
import { buildPerFoundationVolumeTable } from "./perFoundationVolumeTable";

function buildTable(project: ReturnType<typeof buildSyntheticDemoProject>) {
  return buildPerFoundationVolumeTable(
    project,
    computeFoundationMaterialQuantities(project),
    computeExcavationMaterialQuantities(project),
    computeFillMaterialQuantities(project),
    computeFillMaterialQuantities(project, project.upliftFillInstances, validateUpliftFillInstance)
  );
}

describe("buildPerFoundationVolumeTable", () => {
  it("has one row per foundation instance, in instance order, labelled by displayLabel", () => {
    const project = buildSyntheticDemoProject();
    const table = buildTable(project);

    expect(table.rows.map((r) => r.foundationInstanceId)).toEqual(project.foundationInstances.map((f) => f.instanceId));
    expect(table.rows.map((r) => r.label)).toEqual(project.foundationInstances.map((f) => f.displayLabel));
  });

  it("totals match the sum of the calculated rows in every column", () => {
    const table = buildTable(buildSyntheticDemoProject());
    const columns = ["concreteM3", "excavationM3", "fillM3", "upliftFillM3"] as const;

    for (const column of columns) {
      const total = table.totals[column];
      if (total === null) continue;
      const sum = table.rows.reduce((s, r) => s + (r[column] ?? 0), 0);
      expect(sum).toBeCloseTo(total, 6);
    }
    expect(table.totals.concreteM3).not.toBeNull();
    expect(table.totals.excavationM3).not.toBeNull();
  });

  it("leaves a column null for a foundation with no instance of that kind", () => {
    const project = buildSyntheticDemoProject();
    const withoutFirstExcavation = { ...project, excavationInstances: project.excavationInstances.slice(1) };
    const table = buildTable(withoutFirstExcavation);

    const missingId = project.excavationInstances[0]!.foundationInstanceId;
    const row = table.rows.find((r) => r.foundationInstanceId === missingId);
    expect(row?.excavationM3).toBeNull();
    expect(row?.concreteM3).not.toBeNull();
  });
});
