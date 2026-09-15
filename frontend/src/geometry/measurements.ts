/**
 * Pure measurement calculations (spec section 15). Each function takes only
 * the domain values it needs and returns a plain result -- assembling a
 * persisted `Measurement` record (id, label, geometry version, timestamp)
 * is a state/store concern, not a geometry concern.
 */

import type { LocalCoordinate } from "../domain/coordinates";
import type { FoundationInstance } from "../domain/foundation";
import type { GeotechLayer, Groundwater } from "../domain/geotech";
import type { TerrainSurface } from "../domain/terrain";
import { generateBoundarySurface, queryBoundarySurfaceZ } from "./geotechBoundary";
import { queryElevation } from "./terrain";

export function measureHorizontalDistance(a: LocalCoordinate, b: LocalCoordinate): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

export function measureThreeDDistance(a: LocalCoordinate, b: LocalCoordinate): number {
  return Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
}

export function measureVerticalDifference(a: LocalCoordinate, b: LocalCoordinate): number {
  return b.z - a.z;
}

export interface SlopeResult {
  /** Horizontal run per unit vertical rise, same convention as ADR-009 (SideSlope). Null when there is no vertical difference (a slope ratio is undefined for a flat run). */
  readonly ratioHtoV: number | null;
  readonly percentGrade: number | null;
  readonly angleFromHorizontalRadians: number;
}

export function measureSlope(a: LocalCoordinate, b: LocalCoordinate): SlopeResult {
  const horizontal = measureHorizontalDistance(a, b);
  const vertical = Math.abs(b.z - a.z);
  return {
    ratioHtoV: vertical === 0 ? null : horizontal / vertical,
    percentGrade: horizontal === 0 ? null : (vertical / horizontal) * 100,
    angleFromHorizontalRadians: Math.atan2(vertical, horizontal),
  };
}

/** Positive = terrain is above the point (the point is below terrain, i.e. buried); negative = the point is above terrain. Null if the point falls outside terrain coverage. */
export function measureDepthBelowTerrain(point: LocalCoordinate, terrainSurface: TerrainSurface): number | null {
  const query = queryElevation(terrainSurface, point.x, point.y);
  return query.elevation === null ? null : query.elevation - point.z;
}

/** Positive = the foundation base sits above (clear of) the bearing layer's top boundary at the foundation's own position; negative = the base is already into or below it. Null if the boundary has no coverage there. */
export function measureFoundationToBearingLayerClearance(
  foundation: FoundationInstance,
  bearingLayer: GeotechLayer,
  terrainSurface: TerrainSurface,
  mastCentreProjectElevation: number
): number | null {
  const surface = generateBoundarySurface(bearingLayer.topBoundary, terrainSurface, mastCentreProjectElevation);
  const boundaryZ = queryBoundarySurfaceZ(surface, foundation.position.x, foundation.position.y);
  return boundaryZ === null ? null : foundation.baseElevation - boundaryZ;
}

/** Positive = the foundation base sits above the water table at the foundation's own position; negative = below it (submerged). Null if the boundary has no coverage there. */
export function measureFoundationToGroundwaterSeparation(
  foundation: FoundationInstance,
  groundwater: Groundwater,
  terrainSurface: TerrainSurface,
  mastCentreProjectElevation: number
): number | null {
  const surface = generateBoundarySurface(groundwater.boundary, terrainSurface, mastCentreProjectElevation);
  const boundaryZ = queryBoundarySurfaceZ(surface, foundation.position.x, foundation.position.y);
  return boundaryZ === null ? null : foundation.baseElevation - boundaryZ;
}
