import type { SideSlope } from "./excavation";
import type { Provenance } from "./provenance";

/**
 * One fill per foundation instance, used by two layers:
 *
 * - The **gravel pad** (`project.fillInstances`): a flat slab of compacted
 *   gravel under the foundation's pad, filling the whole excavation floor
 *   (geometry/gravelPadGeometry.ts). Its top is the foundation base; its
 *   thickness is `padThicknessM`; the excavation floor sits at its bottom.
 * - The **uplift fill** (`project.upliftFillInstances`): backfill over the
 *   foundation body, sloped down to terrain (geometry/fillGeometry.ts),
 *   whose weight resists uplift.
 *
 * Nothing here is a rendering object, only the calculation parameters, per
 * ADR-006.
 */
export interface FillInstance {
  readonly id: string;
  readonly foundationInstanceId: string;
  /** Local Z of the fill's flat top plate -- normally equal to the foundation's own base elevation (see services/fillFoundationSync.ts). */
  readonly topElevationM: number;
  /** Horizontal offset from the foundation's own (bottom-most part) footprint to the fill top plate's edge; must be >= 0. */
  readonly workingSpaceOffsetM: number;
  readonly sideSlope: SideSlope;
  /** Gravel pad only: slab thickness below the foundation base, m. Absent (projects saved before the gravel pad existed): DEFAULT_GRAVEL_PAD_THICKNESS_M. */
  readonly padThicknessM?: number;
  readonly colour: string;
  readonly opacity: number;
  readonly visible: boolean;
  readonly wireframe: boolean;
  readonly provenance: Provenance;
}

/** Default gravel pad (malarpúði) under a foundation, m. */
export const DEFAULT_GRAVEL_PAD_THICKNESS_M = 0.2;

/** Default distance from the foundation top down to the uplift fill's top -- the pedestal stands this far proud of the backfill, m. */
export const DEFAULT_UPLIFT_FILL_BELOW_TOP_M = 0.2;

export function gravelPadThickness(fill: FillInstance): number {
  return fill.padThicknessM ?? DEFAULT_GRAVEL_PAD_THICKNESS_M;
}

/** Thickness of the gravel pad under a foundation, or undefined when it has none. */
export function gravelPadThicknessFor(
  foundationInstanceId: string,
  gravelPads: readonly FillInstance[]
): number | undefined {
  const pad = gravelPads.find((p) => p.foundationInstanceId === foundationInstanceId);
  return pad ? gravelPadThickness(pad) : undefined;
}

export type FillVolumeCalculationStatus = "calculated" | "blocked-truncated" | "blocked-invalid-geometry";

/**
 * Approximate only -- never a final construction quantity (mirrors
 * ExcavationVolumeResult's own caveat, spec sections 13/20). `method` and
 * the version fields exist specifically so a reader can tell how a number
 * was produced and whether it's still current, not just what the number is.
 */
export interface FillVolumeResult {
  readonly status: FillVolumeCalculationStatus;
  readonly method: string;
  readonly terrainVersion: string | null;
  readonly approximateVolumeM3: number | null;
  readonly limitations: readonly string[];
  readonly truncatedByTerrainCoverage: boolean;
}
