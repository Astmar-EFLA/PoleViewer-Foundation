import { describe, expect, it } from "vitest";
import { buildSyntheticDemoProject } from "../services/buildSyntheticDemoProject";
import { buildProjectValidationSummary } from "./projectReport";

const NOW = "2026-09-15T00:00:00.000Z";

describe("buildProjectValidationSummary", () => {
  it("returns no blocking errors for the (internally consistent) synthetic demo project", () => {
    const project = buildSyntheticDemoProject();
    const results = buildProjectValidationSummary(project, NOW);
    const blocking = results.filter((r) => r.severity === "blocking");
    expect(blocking).toHaveLength(0);
  });

  it("surfaces a blocking foundation error introduced into the project", () => {
    const project = buildSyntheticDemoProject();
    const brokenFoundation = {
      ...project.foundationInstances[0]!,
      parameters: {
        ...project.foundationInstances[0]!.parameters,
        padWidth: -1,
      } as typeof project.foundationInstances[0]["parameters"],
    };
    const broken = {
      ...project,
      foundationInstances: [brokenFoundation, ...project.foundationInstances.slice(1)],
    };

    const results = buildProjectValidationSummary(broken, NOW);
    expect(results.some((r) => r.ruleId === "foundation.non-positive-dimension" && r.severity === "blocking")).toBe(
      true
    );
  });

  it("skips terrain-dependent checks (geotech, groundwater, excavation) when there is no terrain surface", () => {
    const project = { ...buildSyntheticDemoProject(), terrainSurface: null };
    const results = buildProjectValidationSummary(project, NOW);
    expect(results.some((r) => r.ruleId.startsWith("geotech."))).toBe(false);
    expect(results.some((r) => r.ruleId.startsWith("excavation."))).toBe(false);
  });
});
