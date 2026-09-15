import { describe, expect, it } from "vitest";
import { CURRENT_PROJECT_SCHEMA_VERSION, migrateProjectJson } from "./projectMigration";

describe("migrateProjectJson", () => {
  it("passes through data already at the current schema version unchanged", () => {
    const raw = { schemaVersion: CURRENT_PROJECT_SCHEMA_VERSION, name: "x" };
    const result = migrateProjectJson(raw);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toBe(raw);
  });

  it("rejects a schema version this build does not know how to read", () => {
    const result = migrateProjectJson({ schemaVersion: "9.9.9" });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.errors[0]).toMatch(/Unsupported project schema version/);
  });

  it("rejects data with no schemaVersion field at all", () => {
    const result = migrateProjectJson({ name: "x" });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.errors[0]).toMatch(/missing a schemaVersion/);
  });

  it("rejects non-object input", () => {
    expect(migrateProjectJson("not an object").success).toBe(false);
    expect(migrateProjectJson(null).success).toBe(false);
    expect(migrateProjectJson([1, 2, 3]).success).toBe(false);
  });
});
