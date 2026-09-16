import { describe, expect, it } from "vitest";
import { loadSyntheticFixtureJson } from "../tests/fixtures";
import { parsePoleModel } from "./poleModelSchema";

describe("parsePoleModel: valid synthetic fixtures", () => {
  it("accepts the 2-leg portal fixture", () => {
    const json = loadSyntheticFixtureJson("pole-portal-2leg.json");
    const result = parsePoleModel(json);
    expect(result.success).toBe(true);
    if (result.success) {
      // mast-centre + 2 leg-to-foundation + 2 guy-ground-anchor anchors.
      expect(result.data.anchors).toHaveLength(5);
      expect(result.data.structuralLegs).toHaveLength(2);
    }
  });

  it("accepts the 4-leg lattice fixture", () => {
    const json = loadSyntheticFixtureJson("pole-lattice-4leg.json");
    const result = parsePoleModel(json);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.anchors).toHaveLength(5);
      expect(result.data.structuralLegs).toHaveLength(4);
    }
  });

  it("does not hard-code leg count: both 2-leg and 4-leg fixtures pass the same schema", () => {
    const portal = parsePoleModel(loadSyntheticFixtureJson("pole-portal-2leg.json"));
    const lattice = parsePoleModel(loadSyntheticFixtureJson("pole-lattice-4leg.json"));
    expect(portal.success && lattice.success).toBe(true);
    if (portal.success && lattice.success) {
      expect(portal.data.structuralLegs.length).not.toBe(lattice.data.structuralLegs.length);
    }
  });
});

describe("parsePoleModel: visualGeometry", () => {
  it("accepts a model with no visualGeometry (optional field, absent for authored/synthetic models)", () => {
    const json = loadSyntheticFixtureJson("pole-portal-2leg.json");
    const result = parsePoleModel(json);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.visualGeometry).toBeUndefined();
  });

  it("accepts a model with visualGeometry members (e.g. from a PLS-POLE import)", () => {
    const base = loadSyntheticFixtureJson("pole-portal-2leg.json") as Record<string, unknown>;
    const withGeometry = {
      ...base,
      visualGeometry: {
        members: [
          {
            a: { space: "local", x: 0, y: 0, z: 0 },
            b: { space: "local", x: 0, y: 0, z: 10 },
            category: "structure",
            component: "Tube 1 · Ø177.8×8.0 mm",
          },
        ],
        source: { originType: "imported", verificationState: "unverified" },
      },
    };
    const result = parsePoleModel(withGeometry);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.visualGeometry?.members).toHaveLength(1);
  });

  it("rejects a visualGeometry member with an unrecognised category", () => {
    const base = loadSyntheticFixtureJson("pole-portal-2leg.json") as Record<string, unknown>;
    const broken = {
      ...base,
      visualGeometry: {
        members: [
          {
            a: { space: "local", x: 0, y: 0, z: 0 },
            b: { space: "local", x: 0, y: 0, z: 10 },
            category: "conductor",
            component: "x",
          },
        ],
        source: { originType: "imported", verificationState: "unverified" },
      },
    };
    const result = parsePoleModel(broken);
    expect(result.success).toBe(false);
  });
});

describe("parsePoleModel: structural (shape) rejection", () => {
  it("rejects a model with zero anchors", () => {
    const base = loadSyntheticFixtureJson("pole-portal-2leg.json") as Record<string, unknown>;
    const broken = { ...base, anchors: [] };
    const result = parsePoleModel(broken);
    expect(result.success).toBe(false);
  });

  it("rejects a model with zero structural legs", () => {
    const base = loadSyntheticFixtureJson("pole-portal-2leg.json") as Record<string, unknown>;
    const broken = { ...base, structuralLegs: [] };
    const result = parsePoleModel(broken);
    expect(result.success).toBe(false);
  });

  it("rejects a non-finite anchor coordinate rather than silently coercing it", () => {
    const base = loadSyntheticFixtureJson("pole-portal-2leg.json") as {
      anchors: Array<{ localPosition: { x: number } }>;
    };
    const broken = JSON.parse(JSON.stringify(base));
    broken.anchors[0].localPosition.x = Number.NaN;
    const result = parsePoleModel(broken);
    expect(result.success).toBe(false);
  });

  it("rejects an unknown coordinateConvention rather than assuming the default", () => {
    const base = loadSyntheticFixtureJson("pole-portal-2leg.json") as Record<string, unknown>;
    const broken = { ...base, coordinateConvention: "y-up-left-handed" };
    const result = parsePoleModel(broken);
    expect(result.success).toBe(false);
  });
});
