import type { LocalCoordinate } from "../domain/coordinates";
import type { FoundationInstance } from "../domain/foundation";
import type { ValidationResult } from "../domain/validation";
import { generateRectangularPadPedestalGeometry } from "../geometry/foundationGeometry";

/** Loose enough to absorb float64 rounding noise, tight enough to catch a real parameter mismatch (a wrong pedestal height by even 1 cm is a real engineering discrepancy worth flagging). */
const CONNECTION_ELEVATION_TOLERANCE_M = 0.005;

export function validateFoundationInstance(
  instance: FoundationInstance,
  placedAnchorPosition: LocalCoordinate,
  nowIso: string
): ValidationResult[] {
  const results: ValidationResult[] = [];
  const p = instance.parameters;

  const nonPositiveFields = Object.entries(p).filter(([, value]) => !(value > 0));
  if (nonPositiveFields.length > 0) {
    results.push({
      ruleId: "foundation.non-positive-dimension",
      severity: "blocking",
      affectedObjectIds: [instance.instanceId],
      title: "Non-positive foundation dimension",
      detail: `Foundation "${instance.instanceId}" has non-positive value(s) for: ${nonPositiveFields
        .map(([k]) => k)
        .join(", ")}.`,
      timestamp: nowIso,
      dataVersion: "0.1.0",
      status: "open",
    });
  }

  const geometry = generateRectangularPadPedestalGeometry(instance);
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
      detail: `Foundation "${instance.instanceId}" pedestal top is offset from anchor "${instance.anchorId}" by ${horizontalOffset.toFixed(
        4
      )} m horizontally and ${verticalOffset.toFixed(4)} m vertically. Check baseElevation and pedestal height, or the foundation's horizontal position.`,
      evidence: `topConnectionPoint=(${geometry.topConnectionPoint.x.toFixed(4)}, ${geometry.topConnectionPoint.y.toFixed(4)}, ${geometry.topConnectionPoint.z.toFixed(4)}), anchor=(${placedAnchorPosition.x.toFixed(4)}, ${placedAnchorPosition.y.toFixed(4)}, ${placedAnchorPosition.z.toFixed(4)})`,
      timestamp: nowIso,
      dataVersion: "0.1.0",
      status: "open",
    });
  }

  return results;
}
