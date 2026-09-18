import type { LocalCoordinate } from "../domain/coordinates";
import { localCoordinate } from "../domain/coordinates";
import type { FillInstance } from "../domain/fill";
import type { FoundationInstance } from "../domain/foundation";
import type { TerrainSurface } from "../domain/terrain";
import {
  excavationBottomFootprint,
  foundationBottomFootprint,
  perimeterPointAtOffset,
  rectanglePerimeterSamples,
  toWorldXY,
  type PerimeterSample,
  type RectangularFootprint,
  type TerrainIntersectionPoint,
} from "./excavationGeometry";
import { queryElevation } from "./terrain";

// foundationBottomFootprint/excavationBottomFootprint/rectanglePerimeterSamples/
// perimeterPointAtOffset/toWorldXY are plain rectangle-offset geometry with
// nothing excavation-specific about them beyond their filename -- reused
// here as-is rather than duplicated. (excavationBottomFootprint's "outward
// offset by a uniform distance" math is exactly what a fill's top plate
// footprint needs too.)

const DEFAULT_MAX_SEARCH_DEPTH_M = 15;
const DEFAULT_SEARCH_STEP_M = 0.1;

/**
 * The vertical mirror of excavationGeometry.ts's
 * solvePerimeterTerrainIntersection: walks *downward and outward* along one
 * perimeter sample's sloped path (offset(h) = h * slope.h / slope.v) from
 * the fill's top plate, until the slope's elevation (topElevation - h) meets
 * the terrain elevation at that sample's current XY *from above*, refining
 * the last step by linear interpolation. Same search-loop structure as the
 * excavation version (including no-data / max-search-depth truncation
 * handling) -- only the elevation formula and the crossing-delta sign are
 * mirrored, per the excavation case walking up to meet terrain from below.
 */
export function solvePerimeterFillTerrainIntersection(
  sample: PerimeterSample,
  topFootprint: RectangularFootprint,
  topElevationM: number,
  slopeHtoV: number,
  terrainSurface: TerrainSurface,
  maxSearchDepthM: number = DEFAULT_MAX_SEARCH_DEPTH_M,
  stepM: number = DEFAULT_SEARCH_STEP_M
): TerrainIntersectionPoint {
  const worldXYAt = (h: number) => toWorldXY(perimeterPointAtOffset(sample, h * slopeHtoV), topFootprint);

  let previousDelta: number | null = null;
  let previousH = 0;

  for (let h = 0; h <= maxSearchDepthM + 1e-9; h += stepM) {
    const xy = worldXYAt(h);
    const query = queryElevation(terrainSurface, xy.x, xy.y);

    if (query.source === "no-data") {
      return { point: localCoordinate(xy.x, xy.y, topElevationM - h), truncated: true };
    }

    const delta = query.elevation! - (topElevationM - h);
    if (delta >= 0) {
      if (previousDelta !== null && previousDelta < 0) {
        const frac = -previousDelta / (delta - previousDelta);
        const hRefined = previousH + frac * (h - previousH);
        const refinedXY = worldXYAt(hRefined);
        return { point: localCoordinate(refinedXY.x, refinedXY.y, topElevationM - hRefined), truncated: false };
      }
      return { point: localCoordinate(xy.x, xy.y, topElevationM - h), truncated: false };
    }
    previousDelta = delta;
    previousH = h;
  }

  const xy = worldXYAt(maxSearchDepthM);
  return { point: localCoordinate(xy.x, xy.y, topElevationM - maxSearchDepthM), truncated: true };
}

export interface FillGeometry {
  readonly topFootprint: RectangularFootprint;
  readonly topCorners: readonly LocalCoordinate[];
  /** Same order/resolution as bottomRing and perimeterSamples, at the top plate's own elevation -- pairs 1:1 with bottomRing to build the sloped side "skirt" surface. */
  readonly topRing: readonly LocalCoordinate[];
  readonly perimeterSamples: readonly PerimeterSample[];
  readonly bottomRing: readonly TerrainIntersectionPoint[];
  readonly truncated: boolean;
  readonly minHeightM: number;
  readonly maxHeightM: number;
}

const SAMPLES_PER_EDGE = 3;

export function generateFillGeometry(
  fill: FillInstance,
  foundation: FoundationInstance,
  terrainSurface: TerrainSurface
): FillGeometry {
  const foundationFootprint = foundationBottomFootprint(foundation);
  const topFootprint = excavationBottomFootprint(foundationFootprint, fill.workingSpaceOffsetM);

  const cornerSamples = rectanglePerimeterSamples(topFootprint.halfWidth, topFootprint.halfLength, 0);
  const topCorners = cornerSamples.map((s) => {
    const xy = toWorldXY({ x: s.x0, y: s.y0 }, topFootprint);
    return localCoordinate(xy.x, xy.y, fill.topElevationM);
  });

  const perimeterSamples = rectanglePerimeterSamples(topFootprint.halfWidth, topFootprint.halfLength, SAMPLES_PER_EDGE);
  const topRing = perimeterSamples.map((s) => {
    const xy = toWorldXY({ x: s.x0, y: s.y0 }, topFootprint);
    return localCoordinate(xy.x, xy.y, fill.topElevationM);
  });
  const bottomRing = perimeterSamples.map((s) =>
    solvePerimeterFillTerrainIntersection(
      s,
      topFootprint,
      fill.topElevationM,
      fill.sideSlope.h / fill.sideSlope.v,
      terrainSurface
    )
  );
  const truncated = bottomRing.some((p) => p.truncated);

  const topHeights = cornerSamples.map((s) => {
    const xy = toWorldXY({ x: s.x0, y: s.y0 }, topFootprint);
    const q = queryElevation(terrainSurface, xy.x, xy.y);
    return q.elevation === null ? null : fill.topElevationM - q.elevation;
  });
  const validHeights = topHeights.filter((h): h is number => h !== null);

  return {
    topFootprint,
    topCorners,
    topRing,
    perimeterSamples,
    bottomRing,
    truncated,
    minHeightM: validHeights.length > 0 ? Math.min(...validHeights) : NaN,
    maxHeightM: validHeights.length > 0 ? Math.max(...validHeights) : NaN,
  };
}
