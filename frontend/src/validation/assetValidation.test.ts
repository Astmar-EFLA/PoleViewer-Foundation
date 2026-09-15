import { describe, expect, it } from "vitest";
import type { PointCloudSourceReference } from "../domain/pointCloud";
import { validatePointCloudAssetStatus } from "./assetValidation";

const NOW = "2026-09-15T00:00:00.000Z";

function source(overrides: Partial<PointCloudSourceReference> = {}): PointCloudSourceReference {
  return {
    filePath: "pointcloud-mixed-classification.las",
    crs: { kind: "epsg", epsgCode: 3057 },
    contentHash: "a".repeat(64),
    ...overrides,
  };
}

describe("validatePointCloudAssetStatus", () => {
  it("returns no results when the file exists and the hash matches", () => {
    const results = validatePointCloudAssetStatus(
      source(),
      { filePath: source().filePath, exists: true, sizeBytes: 100, sha256: "a".repeat(64) },
      NOW
    );
    expect(results).toHaveLength(0);
  });

  it("blocks when the file no longer exists", () => {
    const results = validatePointCloudAssetStatus(
      source(),
      { filePath: source().filePath, exists: false, sizeBytes: null, sha256: null },
      NOW
    );
    expect(results).toHaveLength(1);
    expect(results[0]!.severity).toBe("blocking");
    expect(results[0]!.ruleId).toBe("asset.point-cloud-missing");
  });

  it("warns (not blocks) when the file exists but its hash has changed", () => {
    const results = validatePointCloudAssetStatus(
      source({ contentHash: "a".repeat(64) }),
      { filePath: source().filePath, exists: true, sizeBytes: 100, sha256: "b".repeat(64) },
      NOW
    );
    expect(results).toHaveLength(1);
    expect(results[0]!.severity).toBe("warning");
    expect(results[0]!.ruleId).toBe("asset.point-cloud-hash-mismatch");
  });

  it("does not report a mismatch when no hash was ever recorded (nothing to compare against)", () => {
    const results = validatePointCloudAssetStatus(
      source({ contentHash: null }),
      { filePath: source().filePath, exists: true, sizeBytes: 100, sha256: "b".repeat(64) },
      NOW
    );
    expect(results).toHaveLength(0);
  });
});
