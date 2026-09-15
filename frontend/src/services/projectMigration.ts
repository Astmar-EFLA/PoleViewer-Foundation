import type { ParseResult } from "../validation/parseResult";

/**
 * The one and only schema version this build understands. There is
 * currently nothing to migrate *from* -- this constant, and the rejection
 * behaviour below, exist so that when schemaVersion is next bumped there is
 * an established place to register a real migration step, instead of the
 * loader silently accepting (or subtly mis-parsing) an incompatible file.
 */
export const CURRENT_PROJECT_SCHEMA_VERSION = "0.1.0";

/**
 * Runs raw, already-JSON-parsed project data through any migrations needed
 * to reach CURRENT_PROJECT_SCHEMA_VERSION, before Zod structural validation
 * (projectSerialization.deserializeProject calls this first). A project
 * file that doesn't match a version this build knows how to read is
 * rejected with an explicit error -- never partially loaded or silently
 * coerced (spec: project schema validation / migration framework).
 */
export function migrateProjectJson(raw: unknown): ParseResult<unknown> {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return { success: false, errors: ["Project JSON must be an object."] };
  }

  const schemaVersion = (raw as Record<string, unknown>).schemaVersion;
  if (typeof schemaVersion !== "string" || schemaVersion.length === 0) {
    return { success: false, errors: ["Project JSON is missing a schemaVersion field."] };
  }

  if (schemaVersion === CURRENT_PROJECT_SCHEMA_VERSION) {
    return { success: true, data: raw };
  }

  return {
    success: false,
    errors: [
      `Unsupported project schema version "${schemaVersion}". This build only reads "${CURRENT_PROJECT_SCHEMA_VERSION}". Open the file with a compatible version of the application.`,
    ],
  };
}
