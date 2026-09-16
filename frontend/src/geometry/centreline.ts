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
 * A raw tangent (from a leg-axis pair or a centreline segment) carries no
 * inherent direction -- it's equally valid read forwards or backwards. This
 * picks whichever of the two matches "low -> high mast number is forward"
 * (the user's own stated convention), via a dot-product sign check against
 * the straight-line direction to/from the neighbouring mast.
 */
function orientTangent(tangentRadians: number, forwardReference: number | null): number {
  if (forwardReference === null) return tangentRadians;
  const tangent = { e: Math.sin(tangentRadians), n: Math.cos(tangentRadians) };
  const reference = { e: Math.sin(forwardReference), n: Math.cos(forwardReference) };
  const dot = tangent.e * reference.e + tangent.n * reference.n;
  return normalizeRadians(dot >= 0 ? tangentRadians : tangentRadians + Math.PI);
}

/**
 * The line bearing to use for one mast (row index into `masts`, same order
 * as the CSV = line order low-to-high), in priority order:
 *
 * 1. The mast's own surveyed leg-axis pair (`LineMastRow.legAxis`), when the
 *    CSV supplies one -- real survey data for this exact tower, so it's the
 *    most accurate source available and overrides the other two.
 * 2. A centreline: projects the mast onto the nearest segment and uses that
 *    segment's tangent -- still an assumption (that the tower is aligned
 *    with the centreline), but more accurate than a straight mast-to-mast
 *    line through a curve or angle tower.
 * 3. The straight mast-to-mast bearing -- the fallback when neither of the
 *    above is available; the feature still works with just a CSV.
 *
 * Both the leg-axis pair and a centreline segment are undirected (see
 * orientTangent above), so both are oriented against the same
 * mast-to-mast forward reference before being returned.
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

  if (mast.legAxis) {
    return orientTangent(bearingBetween(mast.legAxis.a, mast.legAxis.b), forwardReference);
  }

  if (centreline && centreline.length >= 2) {
    const nearest = nearestPointOnPolyline(mast.position, centreline);
    if (nearest) return orientTangent(nearest.tangentRadians, forwardReference);
  }

  return forwardReference ?? 0;
}
