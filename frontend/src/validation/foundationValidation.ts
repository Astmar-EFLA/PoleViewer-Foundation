import type { LocalCoordinate } from "../domain/coordinates";
import type { FoundationInstance, FoundationParameters } from "../domain/foundation";
import { CALCULATION_VERSION, type ValidationResult } from "../domain/validation";
import { generateFoundationGeometry } from "../geometry/foundationGeometry";

/** Loose enough to absorb float64 rounding noise, tight enough to catch a real parameter mismatch (a wrong pedestal height by even 1 cm is a real engineering discrepancy worth flagging). */
const CONNECTION_ELEVATION_TOLERANCE_M = 0.005;

/**
 * Type-aware, unlike a blind Object.entries scan: FoundationParameters now
 * carries a `geometryType` string discriminant and (for stepped-rectangular)
 * a `steps` array, neither of which is a dimension to range-check.
 */
function nonPositiveDimensionFields(params: FoundationParameters): string[] {
  switch (params.geometryType) {
    case "rectangular-pad-pedestal": {
      const { padWidth, padLength, padThickness, pedestalWidth, pedestalLength, pedestalHeight } = params;
      return Object.entries({ padWidth, padLength, padThickness, pedestalWidth, pedestalLength, pedestalHeight })
        .filter(([, value]) => !(value > 0))
        .map(([key]) => key);
    }
    case "stepped-rectangular": {
      const bad: string[] = [];
      params.steps.forEach((step, index) => {
        (["width", "length", "height"] as const).forEach((key) => {
          if (!(step[key] > 0)) bad.push(`steps[${index}].${key}`);
        });
      });
      return bad;
    }
  }
}

export function validateFoundationInstance(
  instance: FoundationInstance,
  placedAnchorPosition: LocalCoordinate,
  nowIso: string
): ValidationResult[] {
  const results: ValidationResult[] = [];

  if (instance.parameters.geometryType === "stepped-rectangular" && instance.parameters.steps.length === 0) {
    results.push({
      ruleId: "foundation.no-steps",
      severity: "blocking",
      affectedObjectIds: [instance.instanceId],
      title: "Stepped foundation has no steps",
      detail: `Foundation "${instance.instanceId}" is a stepped-rectangular type with zero steps defined.`,
      timestamp: nowIso,
      dataVersion: CALCULATION_VERSION,
      status: "open",
    });
  }

  const nonPositiveFields = nonPositiveDimensionFields(instance.parameters);
  if (nonPositiveFields.length > 0) {
    results.push({
      ruleId: "foundation.non-positive-dimension",
      severity: "blocking",
      affectedObjectIds: [instance.instanceId],
      title: "Non-positive foundation dimension",
      detail: `Foundation "${instance.instanceId}" has non-positive value(s) for: ${nonPositiveFields.join(", ")}.`,
      timestamp: nowIso,
      dataVersion: CALCULATION_VERSION,
      status: "open",
    });
  }

  // A degenerate stepped foundation (zero steps) has no well-defined
  // topConnectionPoint; skip the connection-mismatch check rather than
  // generate geometry from an empty parts list.
  if (instance.parameters.geometryType === "stepped-rectangular" && instance.parameters.steps.length === 0) {
    return results;
  }

  const geometry = generateFoundationGeometry(instance);
  const dx = geometry.topConnectionPoint.x - placedAnchorPosition.x;
  const dy = geometry.topConnectionPoint.y - placedAnchorPosition.y;
  const dz = geometry.topConnectionPoint.z - placedAnchorPosition.z;
  const horizontalOffset = Math.hypot(dx, dy);
  const verticalOffset = Math.abs(dz);

  if (
    horizontalOffset > CONNECTION_ELEVATION_TOLERANCE_M ||
    verticalOffset > CONNECTION_ELEVATION_TOLERANCE_M
  ) {
    results.push({
      ruleId: "foundation.connection-mismatch",
      severity: "warning",
      affectedObjectIds: [instance.instanceId, instance.anchorId],
      title: "Foundation top does not meet the leg anchor",
      detail: `Foundation "${instance.instanceId}" top is offset from anchor "${instance.anchorId}" by ${horizontalOffset.toFixed(
        4
      )} m horizontally and ${verticalOffset.toFixed(4)} m vertically. Check baseElevation and foundation height, or the foundation's horizontal position.`,
      evidence: `topConnectionPoint=(${geometry.topConnectionPoint.x.toFixed(4)}, ${geometry.topConnectionPoint.y.toFixed(4)}, ${geometry.topConnectionPoint.z.toFixed(4)}), anchor=(${placedAnchorPosition.x.toFixed(4)}, ${placedAnchorPosition.y.toFixed(4)}, ${placedAnchorPosition.z.toFixed(4)})`,
      timestamp: nowIso,
      dataVersion: CALCULATION_VERSION,
      status: "open",
    });
  }

  return results;
}
