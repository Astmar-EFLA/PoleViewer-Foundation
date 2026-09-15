import type { Provenance } from "./provenance";

/**
 * Internal convention: horizontal run per unit vertical rise (spec section
 * 13, ADR-009), e.g. 1.5H:1V. Displayed and stored as H and V explicitly,
 * never a single ratio number, so the convention is never ambiguous. If a
 * source document uses a different convention (V:H, a gradient percentage),
 * convert explicitly at entry and keep the original value in provenance --
 * never silently reinterpret an H:V-labelled UI field.
 */
export interface SideSlope {
  readonly h: number;
  readonly v: number;
}

/**
 * One excavation per foundation instance (spec section 13). Geometry is
 * derived (geometry/excavationGeometry.ts) from this instance plus the
 * linked foundation's own geometry and the terrain surface -- nothing here
 * is a rendering object, only the calculation parameters, per ADR-006.
 */
export interface ExcavationInstance {
  readonly id: string;
  readonly foundationInstanceId: string;
  /** Local Z of the excavation's flat bottom. */
  readonly bottomElevationM: number;
  /** Horizontal offset from the foundation's own (bottom-most part) footprint to the excavation bottom edge; must be >= 0. */
  readonly workingSpaceOffsetM: number;
  readonly sideSlope: SideSlope;
  readonly colour: string;
  readonly opacity: number;
  readonly visible: boolean;
  readonly wireframe: boolean;
  readonly provenance: Provenance;
}

export type VolumeCalculationStatus = "calculated" | "blocked-truncated" | "blocked-invalid-geometry";

/**
 * Approximate only -- never a final construction quantity (spec section
 * 13/20). `method` and the version fields exist specifically so a reader
 * can tell how a number was produced and whether it's still current, not
 * just what the number is.
 */
export interface ExcavationVolumeResult {
  readonly status: VolumeCalculationStatus;
  readonly method: string;
  readonly terrainVersion: string | null;
  readonly approximateVolumeM3: number | null;
  readonly limitations: readonly string[];
  readonly truncatedByTerrainCoverage: boolean;
}
