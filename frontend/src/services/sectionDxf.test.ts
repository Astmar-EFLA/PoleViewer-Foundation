import { describe, expect, it } from "vitest";
import { generateSectionResult } from "../geometry/section";
import { dxfEntities } from "../tests/dxfParsing";
import { buildSyntheticDemoProject } from "./buildSyntheticDemoProject";
import { buildSectionDxf } from "./sectionDxf";

function transverseResult() {
  const project = buildSyntheticDemoProject();
  const section = project.sections.find((s) => s.mode === "transverse")!;
  return { project, result: generateSectionResult(project, section) };
}

describe("buildSectionDxf", () => {
  it("writes one LINE per section segment on the right layer", () => {
    const { project, result } = transverseResult();
    const dxf = buildSectionDxf(result, { elevationOffsetM: project.mastCentreProject.elevation, title: "M-1" });
    const lines = dxfEntities(dxf).filter((e) => e.type === "LINE");
    const onLayer = (prefix: string) => lines.filter((l) => l.codes.get("8")![0]!.startsWith(prefix)).length;

    expect(result.terrainSegments.length).toBeGreaterThan(0);
    expect(onLayer("TERRAIN")).toBe(result.terrainSegments.length);
    expect(onLayer("FOUNDATION")).toBe(result.foundations.reduce((n, f) => n + f.segments.length, 0));
    expect(onLayer("EXCAVATION")).toBe(result.excavations.reduce((n, e) => n + e.segments.length, 0));
    expect(onLayer("GEOTECH-")).toBe(result.geotechBoundaries.reduce((n, b) => n + b.segments.length, 0));
    expect(onLayer("MAST-CENTRE")).toBe(1);
  });

  it("uses X = offset along the section and Y = absolute elevation", () => {
    const { result } = transverseResult();
    const offset = 123.5;
    const dxf = buildSectionDxf(result, { elevationOffsetM: offset, title: "M-1" });
    const firstTerrain = dxfEntities(dxf).find((e) => e.type === "LINE" && e.codes.get("8")![0] === "TERRAIN")!;
    const seg = result.terrainSegments[0]!;

    expect(Number(firstTerrain.codes.get("10")![0])).toBeCloseTo(seg.a.s, 3);
    expect(Number(firstTerrain.codes.get("20")![0])).toBeCloseTo(seg.a.z + offset, 3);
    expect(Number(firstTerrain.codes.get("11")![0])).toBeCloseTo(seg.b.s, 3);
    expect(Number(firstTerrain.codes.get("21")![0])).toBeCloseTo(seg.b.z + offset, 3);
  });

  it("labels each anchor and writes the title", () => {
    const { result } = transverseResult();
    const dxf = buildSectionDxf(result, { elevationOffsetM: 0, title: "M-12 - Transverse (through mast centre)" });
    const texts = dxfEntities(dxf).filter((e) => e.type === "TEXT");
    const values = texts.map((t) => t.codes.get("1")![0]);

    expect(values).toContain("M-12 - Transverse (through mast centre)");
    for (const anchor of result.anchors) expect(values).toContain(anchor.name);
    expect(dxfEntities(dxf).filter((e) => e.type === "POINT")).toHaveLength(result.anchors.length);
  });

  it("draws the projected tower on one layer per member category", () => {
    const { result } = transverseResult();
    const withTower = {
      ...result,
      poleMembers: [
        { category: "structure" as const, a: { s: -1.5, z: 0 }, b: { s: -1.5, z: 20 } },
        { category: "structure" as const, a: { s: 1.5, z: 0 }, b: { s: 1.5, z: 20 } },
        { category: "insulator" as const, a: { s: 2, z: 18 }, b: { s: 2, z: 16.5 } },
        { category: "cable" as const, a: { s: -4, z: 0 }, b: { s: -1.5, z: 15 } },
      ],
    };
    const dxf = buildSectionDxf(withTower, { elevationOffsetM: 100, title: "t" });
    const lines = dxfEntities(dxf).filter((e) => e.type === "LINE");
    const count = (layer: string) => lines.filter((l) => l.codes.get("8")![0] === layer).length;

    expect(count("TOWER")).toBe(2);
    expect(count("TOWER-INSULATOR")).toBe(1);
    expect(count("TOWER-CABLE")).toBe(1);
    // The mast-centre line now reaches the tower's top (z 20 + 100).
    const centre = lines.find((l) => l.codes.get("8")![0] === "MAST-CENTRE")!;
    expect(Number(centre.codes.get("21")![0])).toBeCloseTo(120, 6);
  });

  it("writes no tower layers when there are no tower members", () => {
    const { result } = transverseResult();
    const dxf = buildSectionDxf({ ...result, poleMembers: [] }, { elevationOffsetM: 0, title: "t" });
    expect(dxf).not.toContain("TOWER");
  });

  it("puts projected (off-plane) foundations on their own dashed layer", () => {
    const { result } = transverseResult();
    const projected = {
      ...result,
      foundations: [
        {
          instanceId: "guy-1",
          legId: null,
          colour: "#888888",
          projected: true,
          segments: [{ a: { s: 2, z: -1 }, b: { s: 3, z: -1 } }],
        },
      ],
    };
    const dxf = buildSectionDxf(projected, { elevationOffsetM: 0, title: "t" });
    const lines = dxfEntities(dxf).filter((e) => e.type === "LINE");
    expect(lines.filter((l) => l.codes.get("8")![0] === "FOUNDATION-PROJECTED")).toHaveLength(1);
    expect(lines.filter((l) => l.codes.get("8")![0] === "FOUNDATION")).toHaveLength(0);
    expect(dxf).toMatch(/LAYER\r\n2\r\nFOUNDATION-PROJECTED\r\n70\r\n0\r\n62\r\n8\r\n6\r\nDASHED/);
  });

  it("puts truncated excavations on their own layer", () => {
    const { result } = transverseResult();
    const truncated = {
      ...result,
      excavations: result.excavations.map((e) => ({ ...e, truncated: true })),
    };
    const dxf = buildSectionDxf(truncated, { elevationOffsetM: 0, title: "t" });
    const layers = new Set(dxfEntities(dxf).map((e) => e.codes.get("8")![0]));
    expect(layers.has("EXCAVATION-TRUNCATED")).toBe(result.excavations.some((e) => e.segments.length > 0));
    expect(layers.has("EXCAVATION")).toBe(false);
  });
});
