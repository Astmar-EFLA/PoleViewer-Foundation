import type { FoundationInstance } from "../domain/foundation";
import type { GeotechLayer, Groundwater } from "../domain/geotech";
import type { TerrainSurface } from "../domain/terrain";
import type { ValidationResult } from "../domain/validation";
import { generateBoundarySurface, queryBoundarySurfaceZ } from "../geometry/geotechBoundary";

/** Absorbs float64 rounding noise from the two independent boundary-surface generations being compared. */
const INVERSION_TOLERANCE_M = 1e-6;

/**
 * Flags a geotechnical layer whose top boundary is below its bottom
 * boundary anywhere in the terrain's coverage -- checked pointwise (not as
 * a single top-vs-bottom scalar) because a terrain-relative top mixed with
 * an absolute-elevation bottom (or vice versa) can invert in only part of
 * the covered area on sloping terrain.
 */
export function validateGeotechLayer(
  layer: GeotechLayer,
  terrainSurface: TerrainSurface,
  mastCentreProjectElevation: number,
  nowIso: string
): ValidationResult[] {
  const topSurface = generateBoundarySurface(layer.topBoundary, terrainSurface, mastCentreProjectElevation);
  const bottomSurface = generateBoundarySurface(layer.bottomBoundary, terrainSurface, mastCentreProjectElevation);

  let invertedCount = 0;
  topSurface.points.forEach((topPoint, i) => {
    const bottomPoint = bottomSurface.points[i]!;
    if (topPoint.z < bottomPoint.z - INVERSION_TOLERANCE_M) {
      invertedCount += 1;
    }
  });

  if (invertedCount === 0) return [];

  return [
    {
      ruleId: "geotech.inverted-boundary",
      severity: "blocking",
      affectedObjectIds: [layer.id],
      title: "Geotechnical layer boundaries are inverted",
      detail: `Layer "${layer.name}" has its top boundary below its bottom boundary at ${invertedCount} of ${topSurface.points.length} sampled point(s). Check the depth/elevation values for each boundary.`,
      timestamp: nowIso,
      dataVersion: "0.1.0",
      status: "open",
    },
  ];
}

/**
 * Reports (never hides) a foundation base that sits below the groundwater
 * level at its own XY position -- a warning, not a blocking error: a
 * submerged foundation base is a real, common engineering condition to be
 * aware of, not by itself an invalid geometry.
 */
export function validateGroundwaterFoundationIntersection(
  groundwater: Groundwater,
  foundation: FoundationInstance,
  terrainSurface: TerrainSurface,
  mastCentreProjectElevation: number,
  nowIso: string
): ValidationResult[] {
  const surface = generateBoundarySurface(groundwater.boundary, terrainSurface, mastCentreProjectElevation);
  const waterZ = queryBoundarySurfaceZ(surface, foundation.position.x, foundation.position.y);
  if (waterZ === null || waterZ <= foundation.baseElevation) return [];

  return [
    {
      ruleId: "geotech.foundation-groundwater-intersection",
      severity: "warning",
      affectedObjectIds: [foundation.instanceId, groundwater.id],
      title: "Foundation base is below groundwater level",
      detail: `Foundation "${foundation.instanceId}" base (${foundation.baseElevation.toFixed(
        3
      )} m local) is below the groundwater level (${waterZ.toFixed(3)} m local) at its position.`,
      timestamp: nowIso,
      dataVersion: "0.1.0",
      status: "open",
    },
  ];
}
