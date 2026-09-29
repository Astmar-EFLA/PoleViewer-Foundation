import type { FillInstance } from "../domain/fill";
import { gravelPadThickness } from "../domain/fill";
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
        r.ruleId === "fill.top-below-pedestal-base")
  );
}

/**
 * The gravel pad (the fill layer, project.fillInstances): a positive
 * thickness, and its top at the foundation base it supports. No slope or
 * terrain checks -- a pad is a flat slab filling the excavation floor
 * (geometry/gravelPadGeometry.ts), independent of terrain.
 */
export function validateGravelPadInstance(
  pad: FillInstance,
  foundation: FoundationInstance,
  nowIso: string
): ValidationResult[] {
  const results: ValidationResult[] = [];
  const thickness = gravelPadThickness(pad);

  if (!(thickness > 0)) {
    results.push({
      ruleId: "gravel-pad.invalid-thickness",
      severity: "blocking",
      affectedObjectIds: [pad.id],
      title: "Gravel pad thickness must be positive",
      detail: `Gravel pad "${pad.id}" has a thickness of ${thickness} m; it must be greater than 0.`,
      timestamp: nowIso,
      dataVersion: CALCULATION_VERSION,
      status: "open",
    });
  }

  if (Math.abs(pad.topElevationM - foundation.baseElevation) > 1e-6) {
    results.push({
      ruleId: "gravel-pad.top-not-at-foundation-base",
      severity: "warning",
      affectedObjectIds: [pad.id, foundation.instanceId],
      title: "Gravel pad top is not at the foundation base",
      detail: `Gravel pad "${pad.id}" top (${pad.topElevationM.toFixed(3)} m) differs from foundation "${foundation.instanceId}"'s base (${foundation.baseElevation.toFixed(3)} m); the foundation is modelled on the pad at its base regardless.`,
      timestamp: nowIso,
      dataVersion: CALCULATION_VERSION,
      status: "open",
    });
  }

  return results;
}

/**
 * Top of a foundation's wide, uplift-resisting parts: every geometry part
 * except the topmost (the pedestal/column, or the top step) -- the pad and
 * tapered transition whose cover weight resists uplift. A single-part
 * foundation falls back to its base.
 */
function upliftResistingPartsTopZ(foundation: FoundationInstance): number {
  const parts = generateFoundationGeometry(foundation).parts;
  if (parts.length < 2) return foundation.baseElevation;
  return Math.max(
    ...parts.slice(0, -1).map((part) => part.centre.z + (part.kind === "box" ? part.halfExtents.z : part.halfHeight))
  );
}

/**
 * The uplift-fill counterpart of validateFillInstance: same slope/working-
 * space checks, but the elevation check is against the top of the
 * foundation's wide parts (pad / tapered transition) rather than its base:
 * an uplift fill must at least bury those. It may stop short of the
 * pedestal top -- by default it does, by DEFAULT_UPLIFT_FILL_BELOW_TOP_M.
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

  const wideTopZ = upliftResistingPartsTopZ(foundation);
  if (upliftFill.topElevationM < wideTopZ - ELEVATION_TOLERANCE_M) {
    results.push({
      ruleId: "fill.top-below-pedestal-base",
      severity: "blocking",
      affectedObjectIds: [upliftFill.id, foundation.instanceId],
      title: "Uplift fill does not cover the foundation's pad",
      detail: `Fill "${upliftFill.id}" top elevation (${upliftFill.topElevationM.toFixed(
        3
      )} m) is below the top of foundation "${foundation.instanceId}"'s pad / tapered transition (${wideTopZ.toFixed(
        3
      )} m), the part whose cover resists uplift.`,
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
