/**
 * Shared provenance model (ADR-010). Embedded on every engineering value or
 * object that can plausibly originate from more than one place, so the
 * measured/imported/user-entered/assumed/calculated distinction is uniform
 * across the whole domain model rather than reinvented per feature.
 */

export type ProvenanceOriginType =
  | "imported"
  | "user-entered"
  | "assumed"
  | "transformed"
  | "interpolated"
  | "calculated"
  | "library-default";

export type VerificationState = "unverified" | "verified" | "rejected";

export interface Provenance {
  readonly originType: ProvenanceOriginType;
  readonly sourceFile?: string;
  readonly sourceFileHash?: string;
  readonly sourceRef?: string;
  /** ISO 8601 */
  readonly importedAt?: string;
  /** ISO 8601 */
  readonly modifiedAt?: string;
  readonly calculationMethod?: string;
  readonly calculationParameters?: Readonly<Record<string, unknown>>;
  readonly softwareVersion?: string;
  readonly verificationState: VerificationState;
  readonly notes?: string;
}
