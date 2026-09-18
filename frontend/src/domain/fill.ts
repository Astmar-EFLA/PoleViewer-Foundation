import type { SideSlope } from "./excavation";
import type { Provenance } from "./provenance";

/**
 * One fill per foundation instance -- the vertical mirror of
 * ExcavationInstance (domain/excavation.ts), for a foundation whose base
 * sits *above* existing terrain and needs material added underneath/around
 * it to bring grade up to that base, instead of ground dug away to reach
 * it. Geometry is derived (geometry/fillGeometry.ts) from this instance
 * plus the linked foundation's own geometry and the terrain surface --
 * nothing here is a rendering object, only the calculation parameters, per
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
  readonly colour: string;
  readonly opacity: number;
  readonly visible: boolean;
  readonly wireframe: boolean;
  readonly provenance: Provenance;
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
