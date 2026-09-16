import { describe, expect, it } from "vitest";
import type { TerrainSurface } from "../domain/terrain";
import { chooseContourInterval, generateContours } from "./contours";

const GENERATED_AT = "2026-09-16T00:00:00.000Z";

function surfaceFromPoints(points: readonly { x: number; y: number; z: number }[], triangles: readonly [number, number, number][]): TerrainSurface {
  return {
    points,
    triangles: triangles.map((indices) => ({ indices })),
    maxEdgeLengthM: 100,
    rejectedTriangleCount: 0,
    duplicatePointCount: 0,
    generatedAt: GENERATED_AT,
    terrainVersion: "test-v1",
  };
}

describe("chooseContourInterval", () => {
  it("picks a round interval that gives roughly a dozen lines across the range", () => {
    expect(chooseContourInterval(12)).toBe(1);
    expect(chooseContourInterval(1.2)).toBe(0.1);
    expect(chooseContourInterval(120)).toBe(10);
  });

  it("falls back to the smallest interval for a zero/negative range (flat or degenerate terrain)", () => {
    expect(chooseContourInterval(0)).toBe(0.1);
    expect(chooseContourInterval(-5)).toBe(0.1);
  });
});

describe("generateContours: flat terrain", () => {
  it("produces no contour segments -- there is no elevation change to trace", () => {
    const surface = surfaceFromPoints(
      [
        { x: 0, y: 0, z: 5 },
        { x: 10, y: 0, z: 5 },
        { x: 0, y: 10, z: 5 },
        { x: 10, y: 10, z: 5 },
      ],
      [
        [0, 1, 2],
        [1, 3, 2],
      ]
    );
    const result = generateContours(surface, 1);
    expect(result.segments).toHaveLength(0);
  });
});

describe("generateContours: single sloping triangle (z = x, 0..10)", () => {
  const surface = surfaceFromPoints(
    [
      { x: 0, y: 0, z: 0 },
      { x: 10, y: 0, z: 10 },
      { x: 0, y: 10, z: 0 },
    ],
    [[0, 1, 2]]
  );

  it("traces one crossing segment per integer contour level strictly inside the elevation range", () => {
    const result = generateContours(surface, 1);
    // z ranges 0..10 on this triangle; levels 1..9 cross it (0 and 10 sit exactly on a vertex).
    const levels = result.segments.map((s) => s.elevation).sort((a, b) => a - b);
    expect(levels).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });

  it("places each crossing at the correct x for the known plane z = x", () => {
    const result = generateContours(surface, 1);
    const level5 = result.segments.find((s) => s.elevation === 5)!;
    expect(level5).toBeDefined();
    for (const point of [level5.a, level5.b]) {
      expect(point.z).toBeCloseTo(5, 9);
      expect(point.x).toBeCloseTo(5, 6);
    }
  });

  it("marks every 5th level as an index contour", () => {
    const result = generateContours(surface, 1);
    const indexLevels = result.segments.filter((s) => s.isIndex).map((s) => s.elevation);
    expect(indexLevels).toEqual([5]);
  });

  it("auto-selects a round interval when none is given", () => {
    const result = generateContours(surface);
    expect(result.intervalM).toBeGreaterThan(0);
    expect(result.segments.length).toBeGreaterThan(0);
  });
});

describe("generateContours: empty surface", () => {
  it("returns no segments without throwing", () => {
    const surface = surfaceFromPoints([], []);
    const result = generateContours(surface, 1);
    expect(result.segments).toHaveLength(0);
  });
});
