import type { Provenance, VerificationState } from "./provenance";

/**
 * Foundation type #1 from the parametric library (spec: "rectangular pad
 * with pedestal") -- the only foundation type implemented in Phase 1. Other
 * library types (stepped rectangular, rock placeholder, ...) are added in
 * Phase 4 once the library-loading mechanism itself exists; this Phase-1
 * type is deliberately hardcoded rather than loaded, per "prefer a simple
 * correct implementation over a visually impressive but unverified one."
 */
export interface RectangularPadPedestalParameters {
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

export interface FoundationType {
  readonly foundationTypeId: string;
  readonly name: string;
  readonly description?: string;
  readonly geometryType: "rectangular-pad-pedestal";
  readonly units: "m";
  readonly defaultParameters: RectangularPadPedestalParameters;
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
  readonly parameters: RectangularPadPedestalParameters;
  /** Local horizontal placement (X, Y), independent of any other instance. */
  readonly position: { readonly x: number; readonly y: number };
  readonly orientationRadians: number;
  /** Local Z of the pad's bottom face. */
  readonly baseElevation: number;
  readonly visible: boolean;
  readonly colour: string;
  readonly opacity: number;
  readonly provenance: Provenance;
}
