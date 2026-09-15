/**
 * Shared validation result model (ADR-010), used by every validation
 * category (coordinate, point-cloud, terrain, pole, foundation,
 * geotechnical, excavation) so there is one panel and one meaning of
 * "blocking", not several incompatible ones.
 */

export type ValidationSeverity = "information" | "warning" | "blocking";

export type ValidationStatus = "open" | "resolved" | "acknowledged";

export interface ValidationResult {
  readonly ruleId: string;
  readonly severity: ValidationSeverity;
  readonly affectedObjectIds: readonly string[];
  readonly title: string;
  readonly detail: string;
  readonly evidence?: string;
  readonly suggestedAction?: string;
  /** ISO 8601 */
  readonly timestamp: string;
  readonly dataVersion: string;
  readonly status: ValidationStatus;
}

export function hasBlockingError(results: readonly ValidationResult[]): boolean {
  return results.some((r) => r.severity === "blocking" && r.status === "open");
}
