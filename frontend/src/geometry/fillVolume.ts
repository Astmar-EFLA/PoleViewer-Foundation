import type { FillInstance, FillVolumeResult } from "../domain/fill";
import type { TerrainSurface } from "../domain/terrain";
import type { FillGeometry } from "./fillGeometry";

const METHOD = "mean-height rectangular frustum approximation";

const BASE_LIMITATIONS = [
  "Assumes a uniform rectangular frustum (mitred/sharp corners, no benches); the true terrain intersection is irregular and only approximated by the mean of the sampled intersection heights.",
  "Side slopes are linear with no allowance for berms, compaction lifts, or geotextile/reinforcement.",
];

/**
 * The vertical mirror of excavationVolume.ts's computeApproximateVolume --
 * same frustum formula, with the fixed small end at the top plate
 * (topFootprint) and the wide end derived from the mean height down to the
 * terrain-intersection ring (bottomRing), instead of excavation's fixed
 * small end at the dig floor and wide end up to terrain. Approximate only
 * (spec sections 13/20) -- never a final construction quantity. Blocks
 * (status != "calculated", approximateVolumeM3 null) rather than silently
 * returning a number computed from incomplete or invalid geometry.
 */
export function computeApproximateFillVolume(
  fill: FillInstance,
  geometry: FillGeometry,
  terrainSurface: TerrainSurface,
  isGeometryValid: boolean
): FillVolumeResult {
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
        "One or more fill-to-terrain intersection points fell outside the extracted terrain coverage, or the search reached its maximum depth bound without meeting terrain.",
      ],
      truncatedByTerrainCoverage: true,
    };
  }

  const heights = geometry.bottomRing.map((p) => fill.topElevationM - p.point.z);
  const meanHeight = heights.reduce((sum, h) => sum + h, 0) / heights.length;

  const topWidth = geometry.topFootprint.halfWidth * 2;
  const topLength = geometry.topFootprint.halfLength * 2;
  const slopeOffset = meanHeight * (fill.sideSlope.h / fill.sideSlope.v);
  const bottomWidth = topWidth + 2 * slopeOffset;
  const bottomLength = topLength + 2 * slopeOffset;

  const topArea = topWidth * topLength;
  const bottomArea = bottomWidth * bottomLength;
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
