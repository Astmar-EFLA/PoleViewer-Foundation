import type { LocalCoordinate } from "../domain/coordinates";
import { localCoordinate } from "../domain/coordinates";
import type { ExcavationInstance } from "../domain/excavation";
import type { FoundationInstance } from "../domain/foundation";
import type { TerrainSurface } from "../domain/terrain";
import { generateFoundationGeometry } from "./foundationGeometry";
import { queryElevation } from "./terrain";

export interface RectangularFootprint {
  readonly centre: { readonly x: number; readonly y: number };
  readonly halfWidth: number;
  readonly halfLength: number;
  readonly orientationRadians: number;
}

/**
 * The foundation's own footprint is its bottom-most geometry part (index 0
 * of generateFoundationGeometry's parts -- the pad, or the widest step) --
 * the excavation must contain at least this, before any working space.
 */
export function foundationBottomFootprint(foundation: FoundationInstance): RectangularFootprint {
  const geometry = generateFoundationGeometry(foundation);
  const bottomPart = geometry.parts[0];
  if (!bottomPart) {
    throw new Error(`Foundation "${foundation.instanceId}" produced no geometry parts.`);
  }
  return {
    centre: { x: bottomPart.centre.x, y: bottomPart.centre.y },
    halfWidth: bottomPart.halfExtents.x,
    halfLength: bottomPart.halfExtents.y,
    orientationRadians: bottomPart.orientationRadians,
  };
}

export function excavationBottomFootprint(
  foundationFootprint: RectangularFootprint,
  workingSpaceOffsetM: number
): RectangularFootprint {
  return {
    centre: foundationFootprint.centre,
    halfWidth: foundationFootprint.halfWidth + workingSpaceOffsetM,
    halfLength: foundationFootprint.halfLength + workingSpaceOffsetM,
    orientationRadians: foundationFootprint.orientationRadians,
  };
}

interface PerimeterSample {
  readonly x0: number;
  readonly y0: number;
  /** Whether this sample's local X grows outward with height (true for east/west edge points and all corners). */
  readonly growX: boolean;
  /** Whether this sample's local Y grows outward with height (true for north/south edge points and all corners). */
  readonly growY: boolean;
}

/**
 * Ordered (perimeter-traversal) samples of a rectangle's boundary, in the
 * rectangle's own unrotated local frame. Offsetting a rectangle outward by
 * a uniform distance moves edge-interior points perpendicular to their own
 * edge only, and corners diagonally by that same distance in both axes
 * (a standard mitred/sharp-corner rectangle offset) -- growX/growY encode
 * which axis (or both, for corners) grows for each sample, so
 * `perimeterPointAtOffset` doesn't need to re-derive edge-vs-corner per call.
 */
export function rectanglePerimeterSamples(
  halfWidth: number,
  halfLength: number,
  samplesPerEdge: number
): PerimeterSample[] {
  const corners = [
    { x: -halfWidth, y: -halfLength },
    { x: halfWidth, y: -halfLength },
    { x: halfWidth, y: halfLength },
    { x: -halfWidth, y: halfLength },
  ];
  const samples: PerimeterSample[] = [];
  for (let c = 0; c < 4; c += 1) {
    const a = corners[c]!;
    const b = corners[(c + 1) % 4]!;
    samples.push({ x0: a.x, y0: a.y, growX: true, growY: true });

    const movingAlongX = a.y === b.y; // south/north edges move along x; east/west move along y
    for (let i = 1; i <= samplesPerEdge; i += 1) {
      const t = i / (samplesPerEdge + 1);
      samples.push({
        x0: a.x + (b.x - a.x) * t,
        y0: a.y + (b.y - a.y) * t,
        growX: !movingAlongX,
        growY: movingAlongX,
      });
    }
  }
  return samples;
}

function perimeterPointAtOffset(sample: PerimeterSample, offset: number): { x: number; y: number } {
  return {
    x: sample.growX ? sample.x0 + Math.sign(sample.x0) * offset : sample.x0,
    y: sample.growY ? sample.y0 + Math.sign(sample.y0) * offset : sample.y0,
  };
}

function toWorldXY(
  localUnrotated: { x: number; y: number },
  footprint: RectangularFootprint
): { x: number; y: number } {
  const cos = Math.cos(footprint.orientationRadians);
  const sin = Math.sin(footprint.orientationRadians);
  return {
    x: footprint.centre.x + localUnrotated.x * cos - localUnrotated.y * sin,
    y: footprint.centre.y + localUnrotated.x * sin + localUnrotated.y * cos,
  };
}

export interface TerrainIntersectionPoint {
  readonly point: LocalCoordinate;
  /** True if terrain was never reached within the search bound, or the search ran outside terrain coverage (no-data). */
  readonly truncated: boolean;
}

const DEFAULT_MAX_SEARCH_HEIGHT_M = 15;
const DEFAULT_SEARCH_STEP_M = 0.1;

/**
 * Walks outward and upward along one perimeter sample's sloped path
 * (offset(h) = h * slope.h / slope.v) until the slope's elevation
 * (bottomElevation + h) reaches the terrain elevation at that sample's
 * current XY, refining the last step by linear interpolation. Deterministic
 * for a fixed step size; verified against closed-form flat- and
 * linear-slope terrain cases (see excavationGeometry.test.ts) rather than
 * assumed correct from the algorithm description alone.
 */
export function solvePerimeterTerrainIntersection(
  sample: PerimeterSample,
  bottomFootprint: RectangularFootprint,
  bottomElevationM: number,
  slopeHtoV: number,
  terrainSurface: TerrainSurface,
  maxSearchHeightM: number = DEFAULT_MAX_SEARCH_HEIGHT_M,
  stepM: number = DEFAULT_SEARCH_STEP_M
): TerrainIntersectionPoint {
  const worldXYAt = (h: number) => toWorldXY(perimeterPointAtOffset(sample, h * slopeHtoV), bottomFootprint);

  let previousDelta: number | null = null;
  let previousH = 0;

  for (let h = 0; h <= maxSearchHeightM + 1e-9; h += stepM) {
    const xy = worldXYAt(h);
    const query = queryElevation(terrainSurface, xy.x, xy.y);

    if (query.source === "no-data") {
      return { point: localCoordinate(xy.x, xy.y, bottomElevationM + h), truncated: true };
    }

    const delta = bottomElevationM + h - query.elevation!;
    if (delta >= 0) {
      if (previousDelta !== null && previousDelta < 0) {
        const frac = -previousDelta / (delta - previousDelta);
        const hRefined = previousH + frac * (h - previousH);
        const refinedXY = worldXYAt(hRefined);
        return { point: localCoordinate(refinedXY.x, refinedXY.y, bottomElevationM + hRefined), truncated: false };
      }
      return { point: localCoordinate(xy.x, xy.y, bottomElevationM + h), truncated: false };
    }
    previousDelta = delta;
    previousH = h;
  }

  const xy = worldXYAt(maxSearchHeightM);
  return { point: localCoordinate(xy.x, xy.y, bottomElevationM + maxSearchHeightM), truncated: true };
}

export interface ExcavationGeometry {
  readonly bottomFootprint: RectangularFootprint;
  readonly bottomCorners: readonly LocalCoordinate[];
  /** Same order/resolution as topRing and perimeterSamples, at height 0 -- pairs 1:1 with topRing to build the sloped side "skirt" surface. */
  readonly bottomRing: readonly LocalCoordinate[];
  readonly perimeterSamples: readonly PerimeterSample[];
  readonly topRing: readonly TerrainIntersectionPoint[];
  readonly truncated: boolean;
  readonly minDepthM: number;
  readonly maxDepthM: number;
}

const SAMPLES_PER_EDGE = 3;

export function generateExcavationGeometry(
  excavation: ExcavationInstance,
  foundation: FoundationInstance,
  terrainSurface: TerrainSurface
): ExcavationGeometry {
  const foundationFootprint = foundationBottomFootprint(foundation);
  const bottomFootprint = excavationBottomFootprint(foundationFootprint, excavation.workingSpaceOffsetM);

  const cornerSamples = rectanglePerimeterSamples(bottomFootprint.halfWidth, bottomFootprint.halfLength, 0);
  const bottomCorners = cornerSamples.map((s) => {
    const xy = toWorldXY({ x: s.x0, y: s.y0 }, bottomFootprint);
    return localCoordinate(xy.x, xy.y, excavation.bottomElevationM);
  });

  const perimeterSamples = rectanglePerimeterSamples(
    bottomFootprint.halfWidth,
    bottomFootprint.halfLength,
    SAMPLES_PER_EDGE
  );
  const bottomRing = perimeterSamples.map((s) => {
    const xy = toWorldXY({ x: s.x0, y: s.y0 }, bottomFootprint);
    return localCoordinate(xy.x, xy.y, excavation.bottomElevationM);
  });
  const topRing = perimeterSamples.map((s) =>
    solvePerimeterTerrainIntersection(
      s,
      bottomFootprint,
      excavation.bottomElevationM,
      excavation.sideSlope.h / excavation.sideSlope.v,
      terrainSurface
    )
  );
  const truncated = topRing.some((p) => p.truncated);

  const bottomDepths = cornerSamples.map((s) => {
    const xy = toWorldXY({ x: s.x0, y: s.y0 }, bottomFootprint);
    const q = queryElevation(terrainSurface, xy.x, xy.y);
    return q.elevation === null ? null : q.elevation - excavation.bottomElevationM;
  });
  const validDepths = bottomDepths.filter((d): d is number => d !== null);

  return {
    bottomFootprint,
    bottomCorners,
    bottomRing,
    perimeterSamples,
    topRing,
    truncated,
    minDepthM: validDepths.length > 0 ? Math.min(...validDepths) : NaN,
    maxDepthM: validDepths.length > 0 ? Math.max(...validDepths) : NaN,
  };
}
