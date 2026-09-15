/**
 * Coordinate space types. Each space is tagged with a `space` literal so the
 * TypeScript compiler rejects passing one coordinate space where another is
 * expected (principle: never silently swap coordinate frames). See
 * docs/architecture/coordinate-strategy.md for the authoritative definition
 * of each space and the transformation chain between them.
 */

export interface ProjectCoordinate {
  readonly space: "project";
  readonly easting: number;
  readonly northing: number;
  readonly elevation: number;
}

export interface LocalCoordinate {
  readonly space: "local";
  /** Transverse axis (perpendicular to line bearing). */
  readonly x: number;
  /** Longitudinal axis (along line bearing). */
  readonly y: number;
  /** Vertical axis, up positive. */
  readonly z: number;
}

export interface ViewerCoordinate {
  readonly space: "viewer";
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export function projectCoordinate(
  easting: number,
  northing: number,
  elevation: number
): ProjectCoordinate {
  return { space: "project", easting, northing, elevation };
}

export function localCoordinate(x: number, y: number, z: number): LocalCoordinate {
  return { space: "local", x, y, z };
}

export function viewerCoordinate(x: number, y: number, z: number): ViewerCoordinate {
  return { space: "viewer", x, y, z };
}

/**
 * A coordinate reference system is a required, explicit value everywhere it
 * is used. "unknown" is a first-class, always-visible state (never a silent
 * null/undefined default) so a missing CRS shows up in validation instead of
 * being invisible.
 */
export type CoordinateReferenceSystem =
  | { readonly kind: "epsg"; readonly epsgCode: number }
  | { readonly kind: "explicit"; readonly definition: string }
  | { readonly kind: "unknown" };

export type LengthUnit = "m" | "ft" | "us-ft";

export type AngleUnit = "radians" | "degrees" | "gon";

export type ElevationReferenceType = "orthometric" | "ellipsoidal" | "project" | "unknown";

/**
 * Defines the mast-centred local engineering frame relative to normalised
 * project coordinates. `lineBearingRadians` is the bearing of local +Y
 * (longitudinal), clockwise from project/grid north, in radians.
 */
export interface LocalFrameDefinition {
  readonly mastCentreProject: ProjectCoordinate;
  readonly lineBearingRadians: number;
}

/**
 * The floating render origin, expressed in local engineering coordinates.
 * Kept distinct from the mast centre itself (ADR-004): the mast centre can
 * move without redefining where the renderer's numerical origin sits.
 */
export interface ViewerFrameDefinition {
  readonly renderOriginLocal: LocalCoordinate;
}
