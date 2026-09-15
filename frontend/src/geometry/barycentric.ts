/**
 * Barycentric point-in-triangle test and Z interpolation, shared by every
 * surface that needs "what's the Z at this XY" (terrain, and now
 * geotechnical boundary surfaces which reuse terrain's own triangulation
 * topology -- see geotechBoundary.ts). Extracted from terrain.ts's
 * queryElevation so this math exists in exactly one place; a change here
 * changes it everywhere consistently instead of risking silent divergence
 * between two hand-written copies.
 */

export interface XYZ {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface IndexedTriangle {
  readonly indices: readonly [number, number, number];
}

export interface InterpolationResult {
  readonly z: number;
  readonly triangleIndex: number;
}

const EDGE_TOLERANCE = -1e-9; // tolerate points exactly on a triangle edge

export function interpolateZAtXY(
  points: readonly XYZ[],
  triangles: readonly IndexedTriangle[],
  x: number,
  y: number
): InterpolationResult | null {
  for (let t = 0; t < triangles.length; t += 1) {
    const [ia, ib, ic] = triangles[t]!.indices;
    const a = points[ia]!;
    const b = points[ib]!;
    const c = points[ic]!;

    const denom = (b.y - c.y) * (a.x - c.x) + (c.x - b.x) * (a.y - c.y);
    if (denom === 0) continue; // degenerate triangle, skip

    const wa = ((b.y - c.y) * (x - c.x) + (c.x - b.x) * (y - c.y)) / denom;
    const wb = ((c.y - a.y) * (x - c.x) + (a.x - c.x) * (y - c.y)) / denom;
    const wc = 1 - wa - wb;

    if (wa >= EDGE_TOLERANCE && wb >= EDGE_TOLERANCE && wc >= EDGE_TOLERANCE) {
      return { z: wa * a.z + wb * b.z + wc * c.z, triangleIndex: t };
    }
  }
  return null;
}
