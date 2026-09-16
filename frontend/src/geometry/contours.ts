import type { TerrainPoint, TerrainSurface } from "../domain/terrain";

export interface ContourSegment {
  readonly elevation: number;
  /** True every `indexInterval`-th contour (a bold "index contour" in standard topographic convention). */
  readonly isIndex: boolean;
  readonly a: TerrainPoint;
  readonly b: TerrainPoint;
}

export interface ContourLines {
  readonly intervalM: number;
  readonly indexInterval: number;
  readonly segments: readonly ContourSegment[];
}

const NICE_INTERVALS_M = [0.1, 0.2, 0.25, 0.5, 1, 2, 2.5, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000];
const TARGET_LINE_COUNT = 12;
const DEFAULT_INDEX_INTERVAL = 5;

/**
 * Picks a round contour interval (0.1/0.2/0.25/0.5/1/2/2.5/5/10 m, ...)
 * aiming for roughly `TARGET_LINE_COUNT` lines across the surface's
 * elevation range, rather than a fixed interval that would be far too
 * dense on a steep site or invisible on a near-flat one.
 */
export function chooseContourInterval(elevationRangeM: number): number {
  if (!(elevationRangeM > 0)) return NICE_INTERVALS_M[0]!;
  const rawStep = elevationRangeM / TARGET_LINE_COUNT;
  for (const step of NICE_INTERVALS_M) {
    if (step >= rawStep) return step;
  }
  return NICE_INTERVALS_M[NICE_INTERVALS_M.length - 1]!;
}

function lerpPoint(p: TerrainPoint, q: TerrainPoint, level: number): TerrainPoint {
  const t = (level - p.z) / (q.z - p.z);
  return { x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t, z: level };
}

/**
 * Edge crossing test uses an asymmetric `<` / `>=` comparison (not `<` on
 * both sides) -- the standard marching-squares/triangles trick for handling
 * a vertex that sits exactly on a contour level without producing duplicate
 * or missing crossings on the triangles sharing that vertex.
 */
function edgeCrossing(p: TerrainPoint, q: TerrainPoint, level: number): TerrainPoint | null {
  if ((p.z < level && q.z >= level) || (p.z >= level && q.z < level)) {
    return lerpPoint(p, q, level);
  }
  return null;
}

/**
 * Traces contour lines across a terrain TIN by walking every triangle and,
 * for each contour level that crosses it, finding the two edge crossings
 * (marching triangles -- the 2D analogue of marching cubes). This is a pure
 * function of the surface, so it's cheap to recompute whenever the TIN
 * changes and never needs to be persisted (spec: derived display geometry,
 * not engineering data).
 */
export function generateContours(surface: TerrainSurface, intervalM?: number): ContourLines {
  if (surface.points.length === 0 || surface.triangles.length === 0) {
    return { intervalM: intervalM ?? NICE_INTERVALS_M[0]!, indexInterval: DEFAULT_INDEX_INTERVAL, segments: [] };
  }

  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const p of surface.points) {
    if (p.z < minZ) minZ = p.z;
    if (p.z > maxZ) maxZ = p.z;
  }

  const interval = intervalM ?? chooseContourInterval(maxZ - minZ);
  if (!(interval > 0)) {
    return { intervalM: interval, indexInterval: DEFAULT_INDEX_INTERVAL, segments: [] };
  }

  const startLevel = Math.ceil(minZ / interval) * interval;
  const segments: ContourSegment[] = [];

  for (const triangle of surface.triangles) {
    const a = surface.points[triangle.indices[0]]!;
    const b = surface.points[triangle.indices[1]]!;
    const c = surface.points[triangle.indices[2]]!;
    const triMinZ = Math.min(a.z, b.z, c.z);
    const triMaxZ = Math.max(a.z, b.z, c.z);

    for (let level = startLevel; level <= triMaxZ; level += interval) {
      if (level < triMinZ) continue;

      const crossings: TerrainPoint[] = [];
      const onAB = edgeCrossing(a, b, level);
      if (onAB) crossings.push(onAB);
      const onBC = edgeCrossing(b, c, level);
      if (onBC) crossings.push(onBC);
      const onCA = edgeCrossing(c, a, level);
      if (onCA) crossings.push(onCA);

      if (crossings.length === 2) {
        const [p, q] = crossings as [TerrainPoint, TerrainPoint];
        // A level that lands exactly on a vertex produces two crossings that
        // coincide at that vertex (the asymmetric </>= comparison above
        // counts it on both adjoining edges) -- a zero-length "segment", not
        // a real contour, so it's dropped rather than rendered as a stray point.
        if (Math.hypot(p.x - q.x, p.y - q.y) < 1e-9) continue;

        const levelIndex = Math.round(level / interval);
        segments.push({
          elevation: level,
          isIndex: levelIndex % DEFAULT_INDEX_INTERVAL === 0,
          a: p,
          b: q,
        });
      }
    }
  }

  return { intervalM: interval, indexInterval: DEFAULT_INDEX_INTERVAL, segments };
}
