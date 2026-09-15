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

/**
 * The calculation/validation-rule-set version stamped on every
 * ValidationResult that isn't tied to a versioned domain object of its own
 * (a pole model result uses `poleModel.schemaVersion` instead, since that's
 * the thing actually being validated). Bump this when a validation rule's
 * logic changes in a way that could flip a previous verdict, so an old
 * saved ValidationResult (if ever persisted) is identifiable as having
 * been produced by different logic than the current build (Phase 9:
 * "calculation versioning") -- a single source of truth instead of the
 * same literal string duplicated at every call site.
 */
export const CALCULATION_VERSION = "0.1.0";
