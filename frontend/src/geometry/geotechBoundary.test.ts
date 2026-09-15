import { describe, expect, it } from "vitest";
import type { AbsoluteElevationBoundary, TerrainRelativeBoundary } from "../domain/geotech";
import { loadTerrainFixturePoints } from "../tests/terrainFixtures";
import { boundaryLocalZ, generateBoundarySurface, queryBoundarySurfaceZ } from "./geotechBoundary";
import { generateTin } from "./terrain";

const MAST_ELEVATION = 123.456;

function slopeTerrain() {
  const points = loadTerrainFixturePoints("terrain-slope.json"); // z = 0.05 * x (local)
  return generateTin(points, {
    maxEdgeLengthM: 8.0,
    terrainVersion: "test-v1",
    generatedAtIso: "2026-09-15T00:00:00.000Z",
  });
}

describe("boundaryLocalZ", () => {
  it("terrain-relative: subtracts the positive depth from terrain-local Z", () => {
    const boundary: TerrainRelativeBoundary = { method: "terrain-relative", depthBelowTerrainM: 0.8 };
    expect(boundaryLocalZ(boundary, 5.0, MAST_ELEVATION)).toBeCloseTo(5.0 - 0.8, 9);
    expect(boundaryLocalZ(boundary, -2.0, MAST_ELEVATION)).toBeCloseTo(-2.0 - 0.8, 9);
  });

  it("absolute-elevation: ignores terrain-local Z entirely, offset only by mast elevation", () => {
    const boundary: AbsoluteElevationBoundary = { method: "absolute-elevation", elevationProjectM: 120.0 };
    expect(boundaryLocalZ(boundary, 5.0, MAST_ELEVATION)).toBeCloseTo(120.0 - MAST_ELEVATION, 9);
    expect(boundaryLocalZ(boundary, -99.0, MAST_ELEVATION)).toBeCloseTo(120.0 - MAST_ELEVATION, 9);
  });
});

describe("generateBoundarySurface: terrain-relative boundaries follow terrain", () => {
  it("every point's Z equals the corresponding terrain point's Z minus the depth", () => {
    const terrain = slopeTerrain();
    const boundary: TerrainRelativeBoundary = { method: "terrain-relative", depthBelowTerrainM: 1.5 };
    const surface = generateBoundarySurface(boundary, terrain, MAST_ELEVATION);

    expect(surface.points).toHaveLength(terrain.points.length);
    surface.points.forEach((p, i) => {
      expect(p.z).toBeCloseTo(terrain.points[i]!.z - 1.5, 9);
      expect(p.x).toBe(terrain.points[i]!.x);
      expect(p.y).toBe(terrain.points[i]!.y);
    });
  });

  it("reuses the terrain's own triangle topology exactly (same mesh, shifted vertically)", () => {
    const terrain = slopeTerrain();
    const boundary: TerrainRelativeBoundary = { method: "terrain-relative", depthBelowTerrainM: 1.5 };
    const surface = generateBoundarySurface(boundary, terrain, MAST_ELEVATION);
    expect(surface.triangles).toEqual(terrain.triangles);
  });
});

describe("generateBoundarySurface: absolute-elevation boundaries stay constant", () => {
  it("every point has the same Z regardless of the underlying (sloping) terrain", () => {
    const terrain = slopeTerrain();
    const boundary: AbsoluteElevationBoundary = { method: "absolute-elevation", elevationProjectM: 121.0 };
    const surface = generateBoundarySurface(boundary, terrain, MAST_ELEVATION);

    const expectedZ = 121.0 - MAST_ELEVATION;
    for (const p of surface.points) {
      expect(p.z).toBeCloseTo(expectedZ, 9);
    }
    // Sanity: the terrain itself is NOT flat, so this is a meaningful assertion.
    const terrainZs = new Set(terrain.points.map((p) => p.z));
    expect(terrainZs.size).toBeGreaterThan(1);
  });
});

describe("queryBoundarySurfaceZ", () => {
  it("interpolates a terrain-relative boundary at an arbitrary XY consistent with the analytic slope formula", () => {
    const terrain = slopeTerrain();
    const boundary: TerrainRelativeBoundary = { method: "terrain-relative", depthBelowTerrainM: 0.8 };
    const surface = generateBoundarySurface(boundary, terrain, MAST_ELEVATION);

    // terrain z = 0.05 * x (see terrain-slope.json), so boundary z = 0.05*x - 0.8
    const z = queryBoundarySurfaceZ(surface, 7.3, -2.1);
    expect(z).not.toBeNull();
    expect(z!).toBeCloseTo(0.05 * 7.3 - 0.8, 6);
  });

  it("returns null outside the surface's coverage", () => {
    const terrain = slopeTerrain();
    const boundary: AbsoluteElevationBoundary = { method: "absolute-elevation", elevationProjectM: 121.0 };
    const surface = generateBoundarySurface(boundary, terrain, MAST_ELEVATION);
    expect(queryBoundarySurfaceZ(surface, 10_000, 10_000)).toBeNull();
  });
});
