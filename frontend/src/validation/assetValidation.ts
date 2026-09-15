import type { PointCloudSourceReference } from "../domain/pointCloud";
import { CALCULATION_VERSION, type ValidationResult } from "../domain/validation";
import type { BackendFileStatus } from "./backendWorkspaceSchema";

/**
 * Compares a project's recorded asset reference against a freshly-queried
 * backend file status (ADR-008: "moved or hash-mismatched assets must be
 * explicitly detected and surfaced on project load ... not silently
 * re-linked or silently ignored"). A missing file blocks anything that
 * depends on it (terrain regeneration); a hash mismatch is a warning --
 * the file is usable, but it is no longer the exact content the project
 * was authored against.
 */
export function validatePointCloudAssetStatus(
  source: PointCloudSourceReference,
  status: BackendFileStatus,
  nowIso: string
): ValidationResult[] {
  if (!status.exists) {
    return [
      {
        ruleId: "asset.point-cloud-missing",
        severity: "blocking",
        affectedObjectIds: [source.filePath],
        title: "Point-cloud source file is missing",
        detail: `The registered point-cloud source "${source.filePath}" was not found in the backend workspace. Terrain cannot be regenerated from this source until it is restored or re-registered.`,
        timestamp: nowIso,
        dataVersion: CALCULATION_VERSION,
        status: "open",
      },
    ];
  }

  if (source.contentHash && status.sha256 && source.contentHash !== status.sha256) {
    return [
      {
        ruleId: "asset.point-cloud-hash-mismatch",
        severity: "warning",
        affectedObjectIds: [source.filePath],
        title: "Point-cloud source file has changed",
        detail: `The content of "${source.filePath}" no longer matches the hash recorded when it was registered (recorded ${source.contentHash.slice(
          0,
          12
        )}..., current ${status.sha256.slice(
          0,
          12
        )}...). Regenerating terrain from it will use the new content -- confirm this is expected before relying on the result.`,
        timestamp: nowIso,
        dataVersion: CALCULATION_VERSION,
        status: "open",
      },
    ];
  }

  return [];
}
