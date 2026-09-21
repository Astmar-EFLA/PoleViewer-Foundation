import { describe, expect, it } from "vitest";
import foundationLibraryJson from "../domain/foundationLibrary.json";
import { parseFoundationLibrary } from "./foundationSchema";

function validEntry(overrides: Record<string, unknown> = {}) {
  return {
    foundationTypeId: "test-type-v1",
    name: "Test type",
    geometryType: "rectangular-pad-pedestal",
    units: "m",
    defaultParameters: {
      geometryType: "rectangular-pad-pedestal",
      padWidth: 1,
      padLength: 1,
      padThickness: 0.5,
      pedestalWidth: 0.4,
      pedestalLength: 0.4,
      pedestalHeight: 0.5,
    },
    defaultColour: "#9aa5b1",
    defaultOpacity: 1,
    verificationState: "unverified",
    provenance: { originType: "library-default", verificationState: "unverified" },
    ...overrides,
  };
}

describe("parseFoundationLibrary", () => {
  it("the real domain/foundationLibrary.json parses successfully", () => {
    const result = parseFoundationLibrary(foundationLibraryJson);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.length).toBeGreaterThan(0);
  });

  it("accepts a well-formed library", () => {
    const result = parseFoundationLibrary([validEntry()]);
    expect(result.success).toBe(true);
  });

  it("accepts a well-formed rectangular-pad-tapered-pedestal entry", () => {
    const result = parseFoundationLibrary([
      validEntry({
        geometryType: "rectangular-pad-tapered-pedestal",
        defaultParameters: {
          geometryType: "rectangular-pad-tapered-pedestal",
          padWidth: 1.6,
          padLength: 1.6,
          padThickness: 0.3,
          frustumHeight: 0.5,
          pedestalWidth: 0.4,
          pedestalLength: 0.4,
          pedestalHeight: 1.0,
        },
      }),
    ]);
    expect(result.success).toBe(true);
  });

  it("rejects an entry whose geometryType doesn't match its own defaultParameters.geometryType", () => {
    const mismatched = validEntry({
      geometryType: "stepped-rectangular",
      // defaultParameters left as rectangular-pad-pedestal -- a hand-edit
      // mistake this check exists specifically to catch.
    });
    const result = parseFoundationLibrary([mismatched]);
    expect(result.success).toBe(false);
  });

  it("rejects an entry missing a required field", () => {
    const { name: _name, ...missingName } = validEntry();
    const result = parseFoundationLibrary([missingName]);
    expect(result.success).toBe(false);
  });

  it("rejects an opacity outside [0, 1]", () => {
    const result = parseFoundationLibrary([validEntry({ defaultOpacity: 1.5 })]);
    expect(result.success).toBe(false);
  });
});
