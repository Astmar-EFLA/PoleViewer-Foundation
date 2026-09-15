import Delaunator from "delaunator";
import type { ElevationQueryResult, TerrainPoint, TerrainSurface } from "../domain/terrain";
import { interpolateZAtXY } from "./barycentric";

export interface GenerateTinOptions {
  readonly maxEdgeLengthM: number;
  readonly terrainVersion: string;
  readonly generatedAtIso: string;
}

/**
 * Exact-duplicate (x,y) points are collapsed to the first occurrence before
 * triangulation. Duplicate/near-duplicate points are a known source of
 * non-deterministic tie-breaking in Delaunay triangulation (ADR-007); this
 * keeps triangulation input point-set genuinely point-distinct rather than
 * relying on the triangulation library to handle ties consistently.
 */
function dedupePoints(points: readonly TerrainPoint[]): {
  deduped: TerrainPoint[];
  duplicateCount: number;
} {
  const seen = new Map<string, true>();
  const deduped: TerrainPoint[] = [];
  let duplicateCount = 0;

  for (const point of points) {
    const key = `${point.x}:${point.y}`;
    if (seen.has(key)) {
      duplicateCount += 1;
      continue;
    }
    seen.set(key, true);
    deduped.push(point);
  }

  return { deduped, duplicateCount };
}

function edgeLengthXY(a: TerrainPoint, b: TerrainPoint): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/**
 * 2D (XY) Delaunay triangulation of ground points (ADR-007). Triangles with
 * any edge longer than `maxEdgeLengthM` are excluded from the returned
 * surface (and counted) rather than silently rendered -- an oversized
 * triangle almost always means the triangulation is bridging a real data
 * gap, not real terrain (principle: never treat interpolated terrain as
 * measured terrain where point data is absent).
 */
export function generateTin(
  points: readonly TerrainPoint[],
  options: GenerateTinOptions
): TerrainSurface {
  const { deduped, duplicateCount } = dedupePoints(points);

  if (deduped.length < 3) {
    return {
      points: deduped,
      triangles: [],
      maxEdgeLengthM: options.maxEdgeLengthM,
      rejectedTriangleCount: 0,
      duplicatePointCount: duplicateCount,
      generatedAt: options.generatedAtIso,
      terrainVersion: options.terrainVersion,
    };
  }

  const coords = new Float64Array(deduped.length * 2);
  for (let i = 0; i < deduped.length; i += 1) {
    coords[i * 2] = deduped[i]!.x;
    coords[i * 2 + 1] = deduped[i]!.y;
  }

  const delaunay = new Delaunator(coords);
  const triangles: { indices: readonly [number, number, number] }[] = [];
  let rejectedTriangleCount = 0;

  for (let t = 0; t < delaunay.triangles.length; t += 3) {
    const ia = delaunay.triangles[t]!;
    const ib = delaunay.triangles[t + 1]!;
    const ic = delaunay.triangles[t + 2]!;
    const a = deduped[ia]!;
    const b = deduped[ib]!;
    const c = deduped[ic]!;

    const maxEdge = Math.max(edgeLengthXY(a, b), edgeLengthXY(b, c), edgeLengthXY(c, a));
    if (maxEdge > options.maxEdgeLengthM) {
      rejectedTriangleCount += 1;
      continue;
    }

    triangles.push({ indices: [ia, ib, ic] });
  }

  return {
    points: deduped,
    triangles,
    maxEdgeLengthM: options.maxEdgeLengthM,
    rejectedTriangleCount,
    duplicatePointCount: duplicateCount,
    generatedAt: options.generatedAtIso,
    terrainVersion: options.terrainVersion,
  };
}

const POINT_SNAP_TOLERANCE_M_DEFAULT = 1e-9;

/**
 * Barycentric point-in-triangle test and elevation interpolation. Returns
 * source "point" only when the query coordinate matches a source vertex
 * within `pointSnapToleranceM` (default: exact match only) -- an arbitrary
 * cursor position essentially never exactly equals a vertex, so most
 * queries correctly come back "interpolated", not "point".
 */
export function queryElevation(
  surface: TerrainSurface,
  x: number,
  y: number,
  pointSnapToleranceM: number = POINT_SNAP_TOLERANCE_M_DEFAULT
): ElevationQueryResult {
  for (let i = 0; i < surface.points.length; i += 1) {
    const p = surface.points[i]!;
    if (Math.hypot(p.x - x, p.y - y) <= pointSnapToleranceM) {
      return { source: "point", elevation: p.z, pointIndex: i };
    }
  }

  const interpolated = interpolateZAtXY(surface.points, surface.triangles, x, y);
  if (interpolated) {
    return { source: "interpolated", elevation: interpolated.z, triangleIndex: interpolated.triangleIndex };
  }

  return { source: "no-data", elevation: null };
}
