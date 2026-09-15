import { describe, expect, it } from "vitest";
import { loadTerrainFixturePoints } from "../tests/terrainFixtures";
import { generateTin, queryElevation } from "./terrain";

const GENERATED_AT = "2026-09-15T00:00:00.000Z";
const NORMAL_MAX_EDGE_M = 8.0; // > normal grid diagonal (5*sqrt(2) ~= 7.07m), see terrain-sparse-hole.json fixture notes

describe("generateTin: flat synthetic terrain", () => {
  const points = loadTerrainFixturePoints("terrain-flat.json");
  const surface = generateTin(points, {
    maxEdgeLengthM: NORMAL_MAX_EDGE_M,
    terrainVersion: "test-flat-v1",
    generatedAtIso: GENERATED_AT,
  });

  it("produces triangles and no rejected/duplicate points for a dense regular grid", () => {
    expect(surface.triangles.length).toBeGreaterThan(0);
    expect(surface.rejectedTriangleCount).toBe(0);
    expect(surface.duplicatePointCount).toBe(0);
  });

  it("returns the exact source elevation at a known vertex", () => {
    const result = queryElevation(surface, 0, 0);
    expect(result.source).toBe("point");
    expect(result.elevation).toBeCloseTo(0.0, 9);
  });

  it("returns the (correctly constant) interpolated elevation between vertices", () => {
    const result = queryElevation(surface, 2.5, 2.5);
    expect(result.source).toBe("interpolated");
    expect(result.elevation).toBeCloseTo(0.0, 9);
  });
});

describe("generateTin: sloping synthetic terrain (z = 0.05 * x)", () => {
  const points = loadTerrainFixturePoints("terrain-slope.json");
  const surface = generateTin(points, {
    maxEdgeLengthM: NORMAL_MAX_EDGE_M,
    terrainVersion: "test-slope-v1",
    generatedAtIso: GENERATED_AT,
  });

  it("produces triangles with no rejections for a dense regular grid", () => {
    expect(surface.triangles.length).toBeGreaterThan(0);
    expect(surface.rejectedTriangleCount).toBe(0);
  });

  it("returns the exact source elevation at a known vertex", () => {
    const result = queryElevation(surface, 5, -10);
    expect(result.source).toBe("point");
    expect(result.elevation).toBeCloseTo(0.05 * 5, 9);
  });

  it("reproduces the exact analytic plane elevation at an arbitrary interior point (barycentric interpolation of a plane is exact)", () => {
    const queryPoints: Array<[number, number]> = [
      [2.5, 2.5],
      [-7.3, 12.1],
      [18.4, -4.6],
      [-1.1, -1.1],
    ];
    for (const [x, y] of queryPoints) {
      const result = queryElevation(surface, x, y);
      expect(result.source).toBe("interpolated");
      expect(result.elevation).toBeCloseTo(0.05 * x, 6);
    }
  });

  it("returns no-data well outside the point-cloud extent", () => {
    const result = queryElevation(surface, 1000, 1000);
    expect(result.source).toBe("no-data");
    expect(result.elevation).toBeNull();
  });
});

describe("generateTin: sparse coverage with a deliberate hole", () => {
  const points = loadTerrainFixturePoints("terrain-sparse-hole.json");
  const surface = generateTin(points, {
    maxEdgeLengthM: NORMAL_MAX_EDGE_M,
    terrainVersion: "test-sparse-v1",
    generatedAtIso: GENERATED_AT,
  });

  it("rejects the large triangles that would otherwise bridge the hole", () => {
    expect(surface.rejectedTriangleCount).toBeGreaterThan(0);
  });

  it("does not silently interpolate across the hole: a query inside the gap is no-data, not a bridged guess", () => {
    const result = queryElevation(surface, 0, 0);
    expect(result.source).toBe("no-data");
    expect(result.elevation).toBeNull();
  });

  it("still answers correctly for points well within the covered (non-hole) area", () => {
    const result = queryElevation(surface, 20, 20);
    expect(result.source).not.toBe("no-data");
    expect(result.elevation).toBeCloseTo(0.05 * 20, 6);
  });
});

describe("generateTin: determinism", () => {
  it("produces identical output across repeated runs on the same input", () => {
    const points = loadTerrainFixturePoints("terrain-slope.json");
    const options = {
      maxEdgeLengthM: NORMAL_MAX_EDGE_M,
      terrainVersion: "determinism-test",
      generatedAtIso: GENERATED_AT,
    };
    const first = generateTin(points, options);
    const second = generateTin(points, options);
    expect(second).toEqual(first);
  });
});

describe("generateTin: duplicate point handling", () => {
  it("collapses exact-duplicate (x,y) points to the first occurrence and records the count, never silently averaging or crashing", () => {
    const points = [
      { x: 0, y: 0, z: 10 },
      { x: 10, y: 0, z: 12 },
      { x: 0, y: 10, z: 11 },
      { x: 0, y: 0, z: 999 }, // duplicate xy, different z -- must not be silently blended in
    ];
    const surface = generateTin(points, {
      maxEdgeLengthM: 50,
      terrainVersion: "duplicate-test",
      generatedAtIso: GENERATED_AT,
    });

    expect(surface.duplicatePointCount).toBe(1);
    expect(surface.points).toHaveLength(3);

    const atOrigin = queryElevation(surface, 0, 0);
    expect(atOrigin.source).toBe("point");
    expect(atOrigin.elevation).toBe(10); // first occurrence kept, not the duplicate's 999
  });
});
