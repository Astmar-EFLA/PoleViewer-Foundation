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

function dot(a: number, b: number): number {
  return Math.sin(a) * Math.sin(b) + Math.cos(a) * Math.cos(b);
}

/**
 * A raw tangent from a centreline segment carries no inherent direction --
 * it's equally valid read forwards or backwards. This picks whichever of
 * the two matches "low -> high mast number is forward" (the user's own
 * stated convention), via a dot-product sign check against the
 * straight-line direction to/from the neighbouring mast.
 */
function orientTangent(tangentRadians: number, forwardReference: number | null): number {
  if (forwardReference === null) return tangentRadians;
  return normalizeRadians(dot(tangentRadians, forwardReference) >= 0 ? tangentRadians : tangentRadians + Math.PI);
}

/**
 * The line bearing to use for one mast (row index into `masts`, same order
 * as the CSV = line order low-to-high), in priority order:
 *
 * 1. The mast's own surveyed leg-axis pair (`LineMastRow.legAxis`), when the
 *    CSV supplies one -- real survey data for this exact tower, so it's the
 *    most accurate source available and overrides the other two. Used
 *    *directly*, with no forwards/backwards disambiguation at all: unlike a
 *    centreline tangent, `legAxis.a -> legAxis.b`'s bearing is not
 *    ambiguous, because legA/legB order is a required, meaningful
 *    convention (see LineMastRow.legAxis's own docstring) tied to the
 *    imported pole model's own local frame -- confirmed against 6 real,
 *    geographically-spread mast models on this line, every one placing its
 *    "LP" leg at local (0, -y) and "RP" at local (0, +y), i.e. exactly
 *    local +Y (== modelOrientationRadians away from "no rotation") points
 *    from LP to RP. With modelOrientationRadians at its default (0) for
 *    every one of those imports, world bearing(LP -> RP) *is*
 *    lineBearingRadians, exactly, with nothing left to resolve. (An earlier
 *    version of this function tried to orient the raw leg-axis tangent
 *    against the straight mast-to-mast bearing, on the mistaken assumption
 *    that the leg pair was longitudinal, not transverse -- that produced a
 *    consistent 90-degree error against this real dataset, since "closest
 *    to mast-to-mast" is the wrong criterion entirely once the pair is
 *    known to be transverse and the order is known to be meaningful.)
 * 2. A centreline: projects the mast onto the nearest segment and uses that
 *    segment's tangent -- still an assumption (that the tower is aligned
 *    with the centreline), but more accurate than a straight mast-to-mast
 *    line through a curve or angle tower. Oriented via orientTangent
 *    (forwards/backwards only -- a centreline segment's direction is
 *    genuinely undirected, unlike a leg-axis pair's).
 * 3. The straight mast-to-mast bearing -- the fallback when neither of the
 *    above is available; the feature still works with just a CSV.
 */
export function bearingForMast(
  masts: readonly LineMastRow[],
  centreline: readonly PolylinePoint[] | null,
  index: number
): number {
  const mast = masts[index];
  if (!mast) return 0;

  if (mast.legAxis) {
    return bearingBetween(mast.legAxis.a, mast.legAxis.b);
  }

  const next = masts[index + 1] ?? null;
  const previous = masts[index - 1] ?? null;
  const forwardReference = next
    ? bearingBetween(mast.position, next.position)
    : previous
      ? bearingBetween(previous.position, mast.position)
      : null;

  if (centreline && centreline.length >= 2) {
    const nearest = nearestPointOnPolyline(mast.position, centreline);
    if (nearest) return orientTangent(nearest.tangentRadians, forwardReference);
  }

  return forwardReference ?? 0;
}
