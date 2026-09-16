import { describe, expect, it } from "vitest";
import { parseLineMastCsv } from "./csvParsing";

const VALID_CSV = [
  "mastName,easting,northing,elevation,modelPath,bearingLayerDepthM,groundwaterDepthM",
  "8-B-BS,512345.678,487654.321,123.456,8-B-BS.pol,2.5,1.8",
  "9-B-BS,512410.2,487720.9,121.0,9-B-BS.pol,3.0,2.1",
].join("\n");

describe("parseLineMastCsv", () => {
  it("parses a valid CSV into ordered mast rows", () => {
    const result = parseLineMastCsv(VALID_CSV);
    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.data).toHaveLength(2);
    expect(result.data[0]).toEqual({
      mastName: "8-B-BS",
      position: { space: "project", easting: 512345.678, northing: 487654.321, elevation: 123.456 },
      modelPath: "8-B-BS.pol",
      bearingLayerDepthM: 2.5,
      groundwaterDepthM: 1.8,
    });
    expect(result.data[1]!.mastName).toBe("9-B-BS");
  });

  it("rejects a CSV missing a required column", () => {
    const csv = "mastName,easting,northing,elevation,modelPath,bearingLayerDepthM\n8-B-BS,1,2,3,x.pol,2.5";
    const result = parseLineMastCsv(csv);
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.errors.join(" ")).toContain("groundwaterDepthM");
  });

  it("reports a row with a non-numeric field, pointing at the exact row", () => {
    const csv = [
      "mastName,easting,northing,elevation,modelPath,bearingLayerDepthM,groundwaterDepthM",
      "8-B-BS,not-a-number,487654.321,123.456,8-B-BS.pol,2.5,1.8",
    ].join("\n");
    const result = parseLineMastCsv(csv);
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.errors.some((e) => e.includes("row 2") && e.includes("easting"))).toBe(true);
  });

  it("rejects an empty file", () => {
    const result = parseLineMastCsv("");
    expect(result.success).toBe(false);
  });

  it("rejects a header-only CSV with no mast rows", () => {
    const result = parseLineMastCsv("mastName,easting,northing,elevation,modelPath,bearingLayerDepthM,groundwaterDepthM");
    expect(result.success).toBe(false);
  });

  it("handles a quoted field containing a comma", () => {
    const csv = [
      "mastName,easting,northing,elevation,modelPath,bearingLayerDepthM,groundwaterDepthM",
      '"8-B-BS, revised",512345.678,487654.321,123.456,8-B-BS.pol,2.5,1.8',
    ].join("\n");
    const result = parseLineMastCsv(csv);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data[0]!.mastName).toBe("8-B-BS, revised");
  });
});
