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
export type FoundationParameters = RectangularPadPedestalParameters | SteppedRectangularParameters;
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
 * One foundation instance per leg (never shared). `baseElevation` is
 * independent per instance -- sloping terrain and unequal leg levels are the
 * normal case, not an edge case (principle: never assume all foundation
 * bases share an elevation).
 */
export interface FoundationInstance {
  readonly instanceId: string;
  readonly poleModelId: string;
  readonly legId: string;
  readonly anchorId: string;
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
