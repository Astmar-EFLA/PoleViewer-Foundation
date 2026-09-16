/**
 * Bearing/alignment geometry for the whole-line import (services/csvParsing.ts,
 * state/projectStore.ts's selectLineMast). Pure functions, no React/store
 * dependency, same convention as every other geometry/ module.
 */

import type { ProjectCoordinate } from "../domain/coordinates";
import type { LineMastRow } from "../services/csvParsing";
import { normalizeRadians } from "./angles";

export interface PolylinePoint {
  readonly easting: number;
  readonly northing: number;
}

/**
 * Bearing from `from` to `to`, clockwise from project/grid north, in
 * radians -- exactly the convention coordinateTransform.ts fixes
 * ("longitudinal direction in (Easting, Northing) is (sin(beta), cos(beta))"),
 * so atan2(dEasting, dNorthing) here, never atan2(dNorthing, dEasting).
 */
export function bearingBetween(from: ProjectCoordinate | PolylinePoint, to: ProjectCoordinate | PolylinePoint): number {
  const dEasting = to.easting - from.easting;
  const dNorthing = to.northing - from.northing;
  return normalizeRadians(Math.atan2(dEasting, dNorthing));
}

export interface NearestPointResult {
  readonly segmentIndex: number;
  /** The segment's own direction, in the bearing convention above -- undirected in the sense that the polyline's vertex order may not match the line's "forward" (low-to-high mast) direction; callers orient it. */
  readonly tangentRadians: number;
  readonly distanceM: number;
}

/** Standard point-to-polyline projection: closest point on any segment, by perpendicular (clamped-to-segment) distance. Returns null for a degenerate (<2 vertex) polyline. */
export function nearestPointOnPolyline(
  point: PolylinePoint,
  vertices: readonly PolylinePoint[]
): NearestPointResult | null {
  let best: NearestPointResult | null = null;

  for (let i = 0; i < vertices.length - 1; i += 1) {
    const a = vertices[i]!;
    const b = vertices[i + 1]!;
    const dx = b.easting - a.easting;
    const dy = b.northing - a.northing;
    const lengthSq = dx * dx + dy * dy;
    if (lengthSq < 1e-9) continue; // coincident vertices -- degenerate segment, skip

    const t = Math.max(0, Math.min(1, ((point.easting - a.easting) * dx + (point.northing - a.northing) * dy) / lengthSq));
    const projEasting = a.easting + t * dx;
    const projNorthing = a.northing + t * dy;
    const distanceM = Math.hypot(point.easting - projEasting, point.northing - projNorthing);

    if (!best || distanceM < best.distanceM) {
      best = { segmentIndex: i, tangentRadians: bearingBetween(a, b), distanceM };
    }
  }

  return best;
}

/**
 * The line bearing to use for one mast (row index into `masts`, same order
 * as the CSV = line order low-to-high). With a centreline: projects the
 * mast onto the nearest segment and takes that segment's tangent, oriented
 * to match "low -> high mast number is forward" (the user's own stated
 * convention) via a dot-product sign check against the straight-line
 * direction toward the next mast (or from the previous one, for the last
 * mast) -- the centreline segment itself carries no inherent direction, so
 * this is the only way to know which of its two possible orientations is
 * correct. Without a centreline: falls back to that same straight
 * mast-to-mast bearing directly -- less accurate through a curve or angle
 * tower, but the feature still works without the shapefile.
 */
export function bearingForMast(
  masts: readonly LineMastRow[],
  centreline: readonly PolylinePoint[] | null,
  index: number
): number {
  const mast = masts[index];
  if (!mast) return 0;

  const next = masts[index + 1] ?? null;
  const previous = masts[index - 1] ?? null;
  const forwardReference = next
    ? bearingBetween(mast.position, next.position)
    : previous
      ? bearingBetween(previous.position, mast.position)
      : null;

  if (centreline && centreline.length >= 2) {
    const nearest = nearestPointOnPolyline(mast.position, centreline);
    if (nearest) {
      if (forwardReference === null) return nearest.tangentRadians;
      const tangent = { e: Math.sin(nearest.tangentRadians), n: Math.cos(nearest.tangentRadians) };
      const reference = { e: Math.sin(forwardReference), n: Math.cos(forwardReference) };
      const dot = tangent.e * reference.e + tangent.n * reference.n;
      return normalizeRadians(dot >= 0 ? nearest.tangentRadians : nearest.tangentRadians + Math.PI);
    }
  }

  return forwardReference ?? 0;
}
