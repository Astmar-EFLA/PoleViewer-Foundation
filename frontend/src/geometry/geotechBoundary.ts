import type { BoundaryDefinition } from "../domain/geotech";
import type { TerrainPoint, TerrainSurface, TerrainTriangle } from "../domain/terrain";
import { interpolateZAtXY } from "./barycentric";

export interface BoundarySurface {
  readonly points: readonly TerrainPoint[];
  readonly triangles: readonly TerrainTriangle[];
}

/**
 * Local Z of a boundary definition at a point whose terrain-local-Z is
 * already known. Pure, single-purpose: this is the one place
 * terrain-relative-vs-absolute is resolved into a local Z, so every
 * consumer (surface generation, validation, foundation/groundwater
 * intersection) agrees.
 */
export function boundaryLocalZ(
  boundary: BoundaryDefinition,
  terrainLocalZ: number,
  mastCentreProjectElevation: number
): number {
  switch (boundary.method) {
    case "terrain-relative":
      return terrainLocalZ - boundary.depthBelowTerrainM;
    case "absolute-elevation":
      return boundary.elevationProjectM - mastCentreProjectElevation;
  }
}

/**
 * Builds a renderable boundary surface by reusing the terrain TIN's own
 * XY positions and triangle topology (same mesh, Z re-derived per point) --
 * a terrain-relative boundary is then guaranteed to actually follow the
 * terrain shape, and an absolute-elevation boundary is guaranteed flat,
 * because both come from the same per-point boundaryLocalZ function, not
 * two independently-implemented surface generators.
 */
export function generateBoundarySurface(
  boundary: BoundaryDefinition,
  terrainSurface: TerrainSurface,
  mastCentreProjectElevation: number
): BoundarySurface {
  const points: TerrainPoint[] = terrainSurface.points.map((p) => ({
    x: p.x,
    y: p.y,
    z: boundaryLocalZ(boundary, p.z, mastCentreProjectElevation),
  }));
  return { points, triangles: terrainSurface.triangles };
}

/** Interpolated local Z of a boundary surface at an arbitrary XY (e.g. a foundation's position, which is generally not a terrain vertex). Null if XY falls outside the surface's coverage. */
export function queryBoundarySurfaceZ(surface: BoundarySurface, x: number, y: number): number | null {
  const result = interpolateZAtXY(surface.points, surface.triangles, x, y);
  return result ? result.z : null;
}
