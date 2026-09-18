import type { FillInstance } from "../domain/fill";
import type { FoundationInstance } from "../domain/foundation";
import { CALCULATION_VERSION, type ValidationResult } from "../domain/validation";
import type { FillGeometry } from "../geometry/fillGeometry";
import { generateFoundationGeometry } from "../geometry/foundationGeometry";

const ELEVATION_TOLERANCE_M = 1e-9;

export function validateFillInstance(
  fill: FillInstance,
  foundation: FoundationInstance,
  geometry: FillGeometry | null,
  nowIso: string
): ValidationResult[] {
  const results: ValidationResult[] = [];

  if (!(fill.sideSlope.h > 0) || !(fill.sideSlope.v > 0)) {
    results.push({
      ruleId: "fill.invalid-slope-ratio",
      severity: "blocking",
      affectedObjectIds: [fill.id],
      title: "Invalid side-slope ratio",
      detail: `Fill "${fill.id}" has a non-positive H:V slope value (H=${fill.sideSlope.h}, V=${fill.sideSlope.v}). Both must be positive.`,
      timestamp: nowIso,
      dataVersion: CALCULATION_VERSION,
      status: "open",
    });
  }

  if (fill.workingSpaceOffsetM < 0) {
    results.push({
      ruleId: "fill.negative-working-space",
      severity: "blocking",
      affectedObjectIds: [fill.id],
      title: "Negative working-space offset",
      detail: `Fill "${fill.id}" has a negative working-space offset (${fill.workingSpaceOffsetM} m); the fill would not fully contain its foundation.`,
      timestamp: nowIso,
      dataVersion: CALCULATION_VERSION,
      status: "open",
    });
  }

  if (fill.topElevationM < foundation.baseElevation - ELEVATION_TOLERANCE_M) {
    results.push({
      ruleId: "fill.top-below-foundation-base",
      severity: "blocking",
      affectedObjectIds: [fill.id, foundation.instanceId],
      title: "Fill top is below the foundation base",
      detail: `Fill "${fill.id}" top elevation (${fill.topElevationM.toFixed(
        3
      )} m) is below foundation "${foundation.instanceId}"'s base elevation (${foundation.baseElevation.toFixed(
        3
      )} m); the foundation would not be supported by the fill.`,
      timestamp: nowIso,
      dataVersion: CALCULATION_VERSION,
      status: "open",
    });
  }

  if (geometry?.truncated) {
    results.push({
      ruleId: "fill.terrain-intersection-truncated",
      severity: "warning",
      affectedObjectIds: [fill.id],
      title: "Fill-terrain intersection is truncated",
      detail: `Fill "${fill.id}" could not fully resolve where its side slopes meet the terrain -- part of the intersection falls outside the extracted terrain coverage or the search depth bound. Approximate volume is blocked until this is resolved (e.g. widen the terrain extraction).`,
      timestamp: nowIso,
      dataVersion: CALCULATION_VERSION,
      status: "open",
    });
  }

  return results;
}

export function hasBlockingFillGeometryError(results: readonly ValidationResult[]): boolean {
  return results.some(
    (r) =>
      r.severity === "blocking" &&
      (r.ruleId === "fill.invalid-slope-ratio" ||
        r.ruleId === "fill.negative-working-space" ||
        r.ruleId === "fill.top-below-foundation-base" ||
        r.ruleId === "fill.top-below-foundation-top")
  );
}

/**
 * The uplift-fill counterpart of validateFillInstance: same slope/working-
 * space checks, but the elevation check is against the foundation's own
 * *top* (topConnectionPoint.z -- pad + pedestal/column) rather than its
 * base, since an uplift-fill is meant to cover the whole foundation body,
 * not just reach its base.
 */
export function validateUpliftFillInstance(
  upliftFill: FillInstance,
  foundation: FoundationInstance,
  geometry: FillGeometry | null,
  nowIso: string
): ValidationResult[] {
  const results: ValidationResult[] = [];

  if (!(upliftFill.sideSlope.h > 0) || !(upliftFill.sideSlope.v > 0)) {
    results.push({
      ruleId: "fill.invalid-slope-ratio",
      severity: "blocking",
      affectedObjectIds: [upliftFill.id],
      title: "Invalid side-slope ratio",
      detail: `Fill "${upliftFill.id}" has a non-positive H:V slope value (H=${upliftFill.sideSlope.h}, V=${upliftFill.sideSlope.v}). Both must be positive.`,
      timestamp: nowIso,
      dataVersion: CALCULATION_VERSION,
      status: "open",
    });
  }

  if (upliftFill.workingSpaceOffsetM < 0) {
    results.push({
      ruleId: "fill.negative-working-space",
      severity: "blocking",
      affectedObjectIds: [upliftFill.id],
      title: "Negative working-space offset",
      detail: `Fill "${upliftFill.id}" has a negative working-space offset (${upliftFill.workingSpaceOffsetM} m); the fill would not fully contain its foundation.`,
      timestamp: nowIso,
      dataVersion: CALCULATION_VERSION,
      status: "open",
    });
  }

  const topConnectionZ = generateFoundationGeometry(foundation).topConnectionPoint.z;
  if (upliftFill.topElevationM < topConnectionZ - ELEVATION_TOLERANCE_M) {
    results.push({
      ruleId: "fill.top-below-foundation-top",
      severity: "blocking",
      affectedObjectIds: [upliftFill.id, foundation.instanceId],
      title: "Uplift fill does not reach the top of the foundation",
      detail: `Fill "${upliftFill.id}" top elevation (${upliftFill.topElevationM.toFixed(
        3
      )} m) is below foundation "${foundation.instanceId}"'s own top (pad + pedestal/column, ${topConnectionZ.toFixed(
        3
      )} m); it would not cover the whole foundation body.`,
      timestamp: nowIso,
      dataVersion: CALCULATION_VERSION,
      status: "open",
    });
  }

  if (geometry?.truncated) {
    results.push({
      ruleId: "fill.terrain-intersection-truncated",
      severity: "warning",
      affectedObjectIds: [upliftFill.id],
      title: "Fill-terrain intersection is truncated",
      detail: `Fill "${upliftFill.id}" could not fully resolve where its side slopes meet the terrain -- part of the intersection falls outside the extracted terrain coverage or the search depth bound. Approximate volume is blocked until this is resolved (e.g. widen the terrain extraction).`,
      timestamp: nowIso,
      dataVersion: CALCULATION_VERSION,
      status: "open",
    });
  }

  return results;
}
