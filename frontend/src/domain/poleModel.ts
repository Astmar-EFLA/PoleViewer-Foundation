import type { LocalCoordinate } from "./coordinates";
import type { Provenance, VerificationState } from "./provenance";

/**
 * Extensible anchor type. "custom" plus a free-text label on the anchor
 * itself covers cases not yet enumerated, without requiring a schema change
 * for every new structure type encountered.
 */
export type AnchorType =
  | "mast-centre"
  | "leg-to-foundation"
  | "pole-base"
  | "pedestal-connection"
  | "guy-attachment"
  | "guy-ground-anchor"
  | "cross-arm-reference"
  | "conductor-attachment"
  | "local-alignment-reference"
  | "custom";

/**
 * An explicit, named engineering connection point. Anchors are the sole
 * source of truth for foundation placement and section generation (ADR-005)
 * -- never inferred from the visual mesh. `localPosition` is expressed in
 * the pole model's own authoring frame; see `placePoleModelAnchor` in the
 * geometry layer for how it is placed into the project's mast-centred local
 * engineering frame via the model's `localOrigin` and `modelOrientationRadians`.
 */
export interface Anchor {
  readonly id: string;
  readonly name: string;
  readonly anchorType: AnchorType;
  readonly localPosition: LocalCoordinate;
  readonly linkedLegId?: string;
  readonly source: Provenance;
  readonly verificationState: VerificationState;
  readonly notes?: string;
}

export interface StructuralLeg {
  readonly id: string;
  readonly name: string;
  readonly linkedFoundationAnchorId: string;
  readonly source: Provenance;
}

export type PoleMemberCategory = "structure" | "cable" | "insulator";

/** Matches the colour legend of the reference PLS-POLE viewer this geometry is imported via, so the same structure reads the same way in the 3D view, the section view and the tools it came from. */
export const POLE_MEMBER_COLOURS: Readonly<Record<PoleMemberCategory, string>> = {
  structure: "#0C2A59",
  cable: "#F00000",
  insulator: "#586E2F",
};

/**
 * One structural/cable/insulator segment of an imported pole/tower's real
 * geometry (e.g. from a PLS-POLE .pol import -- see
 * services/backendClient.ts's requestPoleModelImport). Rendering-only:
 * never consulted for foundation placement or any other calculation
 * (ADR-005 -- anchors, not this, are the source of truth). `a`/`b` are in
 * the pole model's own authoring frame, same as `Anchor.localPosition`.
 */
export interface PoleMember {
  readonly a: LocalCoordinate;
  readonly b: LocalCoordinate;
  readonly category: PoleMemberCategory;
  /** Readable size/profile label, e.g. "Tube 1 · Ø177.8×8.0 mm" or "2x21mm". */
  readonly component: string;
}

export interface PoleVisualGeometry {
  readonly members: readonly PoleMember[];
  readonly source: Provenance;
}

/**
 * The pole/tower model. Leg count is never assumed (2 or 4); `structuralLegs`
 * is a plain array supporting any count including 1 (single pole) and N > 4
 * for future structure types.
 */
export interface PoleModel {
  readonly schemaVersion: string;
  readonly modelId: string;
  readonly name: string;
  readonly description?: string;
  readonly source: Provenance;
  readonly units: "m" | "ft" | "us-ft";
  /**
   * States the axis convention this file was authored against, so a file
   * from a different convention is caught by validation rather than
   * silently mis-placed. The application currently supports exactly one
   * convention (see docs/architecture/coordinate-strategy.md); this field
   * exists so that assumption is checked per-file, not just documented.
   */
  readonly coordinateConvention: "right-handed-x-transverse-y-longitudinal-z-up";
  /** Translation applied when placing this model into the project's mast-centred local frame. */
  readonly localOrigin: LocalCoordinate;
  /** Rotation about Z applied (before the localOrigin translation) when placing this model. */
  readonly modelOrientationRadians: number;
  readonly mastCentreAnchorId: string;
  readonly visualAssetRef?: string;
  readonly anchors: readonly Anchor[];
  readonly structuralLegs: readonly StructuralLeg[];
  readonly metadata?: Readonly<Record<string, unknown>>;
  readonly warnings: readonly string[];
  /** Rendering-only structural geometry (e.g. from a PLS-POLE import); absent for a model authored/imported without one. */
  readonly visualGeometry?: PoleVisualGeometry;
}
