import { describe, expect, it } from "vitest";
import { loadSyntheticFixtureJson } from "../tests/fixtures";
import { parsePoleModel } from "./poleModelSchema";
import { validatePoleModelReferences } from "./poleModelValidation";

const NOW = "2026-09-15T00:00:00.000Z";

describe("validatePoleModelReferences", () => {
  it("produces no blocking results for the valid 2-leg portal fixture", () => {
    const parsed = parsePoleModel(loadSyntheticFixtureJson("pole-portal-2leg.json"));
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;

    const results = validatePoleModelReferences(parsed.data, NOW);
    expect(results.filter((r) => r.severity === "blocking")).toHaveLength(0);
  });

  it("produces no blocking results for the valid 4-leg lattice fixture", () => {
    const parsed = parsePoleModel(loadSyntheticFixtureJson("pole-lattice-4leg.json"));
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;

    const results = validatePoleModelReferences(parsed.data, NOW);
    expect(results.filter((r) => r.severity === "blocking")).toHaveLength(0);
  });

  it("flags a dangling leg-to-anchor reference as blocking, never silently ignored", () => {
    const parsed = parsePoleModel(
      loadSyntheticFixtureJson("pole-invalid-dangling-leg-reference.json")
    );
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;

    const results = validatePoleModelReferences(parsed.data, NOW);
    const blocking = results.filter((r) => r.severity === "blocking");
    expect(blocking.length).toBeGreaterThan(0);
    expect(blocking.some((r) => r.ruleId === "pole.invalid-leg-anchor-reference")).toBe(true);
    expect(blocking[0]?.affectedObjectIds).toContain("leg-a");
  });

  it("flags duplicate anchor ids as blocking", () => {
    const parsed = parsePoleModel(loadSyntheticFixtureJson("pole-portal-2leg.json"));
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;

    const duplicated = {
      ...parsed.data,
      anchors: [...parsed.data.anchors, { ...parsed.data.anchors[1]! }],
    };

    const results = validatePoleModelReferences(duplicated, NOW);
    expect(results.some((r) => r.ruleId === "pole.duplicate-anchor-id")).toBe(true);
  });

  it("flags a mastCentreAnchorId that does not resolve to a declared anchor", () => {
    const parsed = parsePoleModel(loadSyntheticFixtureJson("pole-portal-2leg.json"));
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;

    const broken = { ...parsed.data, mastCentreAnchorId: "does-not-exist" };
    const results = validatePoleModelReferences(broken, NOW);
    expect(results.some((r) => r.ruleId === "pole.missing-mast-centre-anchor")).toBe(true);
  });
});
