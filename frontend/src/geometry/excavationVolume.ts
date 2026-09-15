import type { ExcavationInstance, ExcavationVolumeResult } from "../domain/excavation";
import type { TerrainSurface } from "../domain/terrain";
import type { ExcavationGeometry } from "./excavationGeometry";

const METHOD = "mean-height rectangular frustum approximation";

const BASE_LIMITATIONS = [
  "Assumes a uniform rectangular frustum (mitred/sharp corners, no benches); the true terrain intersection is irregular and only approximated by the mean of the sampled intersection heights.",
  "Side slopes are linear with no allowance for berms, shoring, or over-excavation.",
];

/**
 * Approximate only (spec sections 13/20) -- never a final construction
 * quantity. Blocks (status != "calculated", approximateVolumeM3 null)
 * rather than silently returning a number computed from incomplete or
 * invalid geometry (principle: never present approximate excavation
 * quantities as final; never continue with a blocking inconsistency).
 */
export function computeApproximateVolume(
  excavation: ExcavationInstance,
  geometry: ExcavationGeometry,
  terrainSurface: TerrainSurface,
  isGeometryValid: boolean
): ExcavationVolumeResult {
  if (!isGeometryValid) {
    return {
      status: "blocked-invalid-geometry",
      method: METHOD,
      terrainVersion: terrainSurface.terrainVersion,
      approximateVolumeM3: null,
      limitations: BASE_LIMITATIONS,
      truncatedByTerrainCoverage: geometry.truncated,
    };
  }

  if (geometry.truncated) {
    return {
      status: "blocked-truncated",
      method: METHOD,
      terrainVersion: terrainSurface.terrainVersion,
      approximateVolumeM3: null,
      limitations: [
        ...BASE_LIMITATIONS,
        "One or more excavation-to-terrain intersection points fell outside the extracted terrain coverage, or the search reached its maximum height bound without meeting terrain.",
      ],
      truncatedByTerrainCoverage: true,
    };
  }

  const heights = geometry.topRing.map((p) => p.point.z - excavation.bottomElevationM);
  const meanHeight = heights.reduce((sum, h) => sum + h, 0) / heights.length;

  const bottomWidth = geometry.bottomFootprint.halfWidth * 2;
  const bottomLength = geometry.bottomFootprint.halfLength * 2;
  const slopeOffset = meanHeight * (excavation.sideSlope.h / excavation.sideSlope.v);
  const topWidth = bottomWidth + 2 * slopeOffset;
  const topLength = bottomLength + 2 * slopeOffset;

  const bottomArea = bottomWidth * bottomLength;
  const topArea = topWidth * topLength;
  const volume = (meanHeight / 3) * (bottomArea + topArea + Math.sqrt(bottomArea * topArea));

  return {
    status: "calculated",
    method: METHOD,
    terrainVersion: terrainSurface.terrainVersion,
    approximateVolumeM3: volume,
    limitations: BASE_LIMITATIONS,
    truncatedByTerrainCoverage: false,
  };
}
