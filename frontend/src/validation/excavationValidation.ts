import type { ExcavationInstance } from "../domain/excavation";
import type { FoundationInstance } from "../domain/foundation";
import { CALCULATION_VERSION, type ValidationResult } from "../domain/validation";
import type { ExcavationGeometry } from "../geometry/excavationGeometry";

const ELEVATION_TOLERANCE_M = 1e-9;

export function validateExcavationInstance(
  excavation: ExcavationInstance,
  foundation: FoundationInstance,
  geometry: ExcavationGeometry | null,
  nowIso: string
): ValidationResult[] {
  const results: ValidationResult[] = [];

  if (!(excavation.sideSlope.h > 0) || !(excavation.sideSlope.v > 0)) {
    results.push({
      ruleId: "excavation.invalid-slope-ratio",
      severity: "blocking",
      affectedObjectIds: [excavation.id],
      title: "Invalid side-slope ratio",
      detail: `Excavation "${excavation.id}" has a non-positive H:V slope value (H=${excavation.sideSlope.h}, V=${excavation.sideSlope.v}). Both must be positive.`,
      timestamp: nowIso,
      dataVersion: CALCULATION_VERSION,
      status: "open",
    });
  }

  if (excavation.workingSpaceOffsetM < 0) {
    results.push({
      ruleId: "excavation.negative-working-space",
      severity: "blocking",
      affectedObjectIds: [excavation.id],
      title: "Negative working-space offset",
      detail: `Excavation "${excavation.id}" has a negative working-space offset (${excavation.workingSpaceOffsetM} m); the excavation would not fully contain its foundation.`,
      timestamp: nowIso,
      dataVersion: CALCULATION_VERSION,
      status: "open",
    });
  }

  if (excavation.bottomElevationM > foundation.baseElevation + ELEVATION_TOLERANCE_M) {
    results.push({
      ruleId: "excavation.bottom-above-foundation-base",
      severity: "blocking",
      affectedObjectIds: [excavation.id, foundation.instanceId],
      title: "Excavation bottom is above the foundation base",
      detail: `Excavation "${excavation.id}" bottom elevation (${excavation.bottomElevationM.toFixed(
        3
      )} m) is above foundation "${foundation.instanceId}"'s base elevation (${foundation.baseElevation.toFixed(
        3
      )} m); the foundation would not fit in the excavation.`,
      timestamp: nowIso,
      dataVersion: CALCULATION_VERSION,
      status: "open",
    });
  }

  if (geometry?.truncated) {
    results.push({
      ruleId: "excavation.terrain-intersection-truncated",
      severity: "warning",
      affectedObjectIds: [excavation.id],
      title: "Excavation-terrain intersection is truncated",
      detail: `Excavation "${excavation.id}" could not fully resolve where its side slopes meet the terrain -- part of the intersection falls outside the extracted terrain coverage or the search height bound. Approximate volume is blocked until this is resolved (e.g. widen the terrain extraction).`,
      timestamp: nowIso,
      dataVersion: CALCULATION_VERSION,
      status: "open",
    });
  }

  return results;
}

export function hasBlockingExcavationGeometryError(results: readonly ValidationResult[]): boolean {
  return results.some(
    (r) =>
      r.severity === "blocking" &&
      (r.ruleId === "excavation.invalid-slope-ratio" ||
        r.ruleId === "excavation.negative-working-space" ||
        r.ruleId === "excavation.bottom-above-foundation-base")
  );
}
