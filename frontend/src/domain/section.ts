/**
 * Section/clipping tool definitions (spec section 14). A section is defined
 * purely as a vertical cutting plane plus a point-display tolerance -- the
 * actual section content (terrain line, foundation outline, etc.) is never
 * stored here; it is derived on demand from the project's own authoritative
 * geometry by geometry/section.ts (spec: "do not generate an independent
 * illustrative section").
 */

export type SectionMode = "longitudinal" | "transverse" | "leg" | "custom";

/**
 * A vertical plane in the local engineering frame, defined by a point it
 * passes through (originX, originY) and the direction of its own "along
 * section" axis (s) in the local XY plane. The plane extends infinitely in Z.
 */
export interface SectionPlane {
  readonly originX: number;
  readonly originY: number;
  readonly directionRadians: number;
}

export interface SectionDefinition {
  readonly id: string;
  readonly name: string;
  readonly mode: SectionMode;
  /** Set only when mode === "leg". */
  readonly legId: string | null;
  readonly plane: SectionPlane;
  /** Perpendicular distance (m) within which source terrain points and anchors are still shown, projected onto the section. */
  readonly pointToleranceM: number;
  readonly visible: boolean;
}
