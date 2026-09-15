import type { LocalCoordinate, ProjectCoordinate } from "./coordinates";

/**
 * Measurement tools required by spec section 15. Each kind determines how
 * many points it needs and how its result is derived (geometry/measurements.ts);
 * this type only stores the picked inputs and the calculated result, never
 * re-derives anything itself.
 */
export type MeasurementKind =
  | "point-coordinate"
  | "horizontal-distance"
  | "three-d-distance"
  | "vertical-difference"
  | "slope"
  | "elevation"
  | "depth-below-terrain"
  | "foundation-to-bearing-layer"
  | "foundation-to-groundwater";

export interface MeasurementPointRecord {
  readonly local: LocalCoordinate;
  readonly project: ProjectCoordinate;
}

export type MeasurementResultUnit = "m" | "ratio" | "percent" | "degrees";

/**
 * `geometryVersionAtCalculation` is compared against the project's current
 * `geometryVersion` to detect staleness (spec: "do not retain stale
 * measurements silently after source geometry changes"). A measurement is
 * stale, not deleted, when they diverge -- the UI must show this explicitly
 * and let the user recalculate, never silently keep or drop the old value.
 */
export interface Measurement {
  readonly id: string;
  readonly kind: MeasurementKind;
  readonly label: string;
  readonly points: readonly MeasurementPointRecord[];
  readonly resultValue: number | null;
  readonly resultUnit: MeasurementResultUnit;
  /** Short human-readable supplementary detail (e.g. a slope's grade and angle alongside its H:V ratio). */
  readonly resultDetail?: string;
  readonly relatedObjectIds?: readonly string[];
  readonly geometryVersionAtCalculation: number;
  /** ISO 8601 */
  readonly calculatedAtIso: string;
}
