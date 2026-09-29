import type { Provenance, VerificationState } from "./provenance";

/**
 * Foundation type #1 from the parametric library (spec: "rectangular pad
 * with pedestal").
 */
export interface RectangularPadPedestalParameters {
  readonly geometryType: "rectangular-pad-pedestal";
  /** Pad width along local X (transverse), m. */
  readonly padWidth: number;
  /** Pad length along local Y (longitudinal), m. */
  readonly padLength: number;
  /** Pad thickness (vertical), m. */
  readonly padThickness: number;
  /** Pedestal width along local X, m. */
  readonly pedestalWidth: number;
  /** Pedestal length along local Y, m. */
  readonly pedestalLength: number;
  /** Pedestal height, pad top to pedestal top, m. */
  readonly pedestalHeight: number;
}

/**
 * Foundation type #3 from the parametric library: a flat pad, a tapered
 * (frustum) transition, then a flat pedestal -- the pad/pedestal fields are
 * identical to RectangularPadPedestalParameters; frustumHeight is the only
 * new dimension (the sloped section's own height, pad-top to
 * pedestal-bottom). Real-world use case: a footing whose sides batter
 * inward to the column instead of stepping sharply, saving concrete.
 */
export interface RectangularPadTaperedPedestalParameters {
  readonly geometryType: "rectangular-pad-tapered-pedestal";
  /** Pad width along local X (transverse), m. */
  readonly padWidth: number;
  /** Pad length along local Y (longitudinal), m. */
  readonly padLength: number;
  /** Pad thickness (vertical), m. */
  readonly padThickness: number;
  /** Height of the tapered frustum, pad top to pedestal bottom, m. */
  readonly frustumHeight: number;
  /** Pedestal width along local X, m. */
  readonly pedestalWidth: number;
  /** Pedestal length along local Y, m. */
  readonly pedestalLength: number;
  /** Pedestal height, frustum top to pedestal top, m (vertical, even when the pedestal leans). */
  readonly pedestalHeight: number;
  /**
   * Angle of the pedestal's axis from vertical, degrees, leaning toward local
   * +X -- a precast footing whose pedestal follows its leg's batter (e.g.
   * Hólasandslína 3's B/F types, 1:8 = 7.125°). Absent or 0: vertical.
   * The pedestal top (the leg connection) stays at the instance's
   * `position`; the pad shifts the other way (see
   * generateRectangularPadTaperedPedestalGeometry).
   */
  readonly pedestalLeanDegrees?: number;
  /** Horizontal offset of the pedestal's base centre from the pad centre, toward local +X, m. Absent or 0: centred. */
  readonly pedestalBaseOffset?: number;
}

/** True when a tapered-pedestal foundation's pedestal leans or sits off-centre -- the case that sets its orientation from the leg (services/buildFoundationInstances.ts). */
export function hasInclinedPedestal(parameters: FoundationParameters): boolean {
  return (
    parameters.geometryType === "rectangular-pad-tapered-pedestal" &&
    ((parameters.pedestalLeanDegrees ?? 0) !== 0 || (parameters.pedestalBaseOffset ?? 0) !== 0)
  );
}

/** One rectangular tier of a stepped foundation, ordered bottom to top and centred on the same (x, y). */
export interface RectangularStep {
  readonly width: number;
  readonly length: number;
  readonly height: number;
}

/** Foundation type #2 from the parametric library (spec: "stepped rectangular foundation"). */
export interface SteppedRectangularParameters {
  readonly geometryType: "stepped-rectangular";
  /** Bottom to top; at least one step is required. */
  readonly steps: readonly RectangularStep[];
}

/**
 * Discriminated on `geometryType`, which lives on the parameters value
 * itself (not just on the FoundationType library entry) so geometry
 * generation stays a pure function of a FoundationInstance alone -- no
 * library lookup required at render time (ADR-006).
 */
export type FoundationParameters =
  | RectangularPadPedestalParameters
  | SteppedRectangularParameters
  | RectangularPadTaperedPedestalParameters;
export type FoundationGeometryType = FoundationParameters["geometryType"];

export interface FoundationType {
  readonly foundationTypeId: string;
  readonly name: string;
  readonly description?: string;
  readonly geometryType: FoundationGeometryType;
  readonly units: "m";
  readonly defaultParameters: FoundationParameters;
  readonly defaultColour: string;
  readonly defaultOpacity: number;
  readonly verificationState: VerificationState;
  readonly provenance: Provenance;
}

/**
 * One foundation instance per foundation-bearing anchor (a structural leg,
 * or a guy-attachment anchor -- never shared). `baseElevation` is
 * independent per instance -- sloping terrain and unequal leg levels are the
 * normal case, not an edge case (principle: never assume all foundation
 * bases share an elevation).
 */
export interface FoundationInstance {
  readonly instanceId: string;
  readonly poleModelId: string;
  /** The structural leg this foundation connects to, or null for a guy-anchor foundation (there is no StructuralLeg for a guy). `anchorId` is the source of truth either way. */
  readonly legId: string | null;
  readonly anchorId: string;
  /** Human-readable label for UI/reports: the leg's name for a leg foundation, the anchor's own name for a guy-anchor foundation. */
  readonly displayLabel: string;
  readonly foundationTypeId: string;
  /** Defaults merged with any user overrides; kept as one resolved value so geometry generation stays a pure function of the instance alone. */
  readonly parameters: FoundationParameters;
  /** Local horizontal placement (X, Y), independent of any other instance. */
  readonly position: { readonly x: number; readonly y: number };
  readonly orientationRadians: number;
  /** Local Z of the foundation's bottom face. */
  readonly baseElevation: number;
  readonly visible: boolean;
  readonly colour: string;
  readonly opacity: number;
  readonly provenance: Provenance;
}
