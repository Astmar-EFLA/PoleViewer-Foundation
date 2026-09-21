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
      legAxis: null,
      pointCloudPath: null,
      foundationTypeId: null,
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

  it("parses an optional complete leg-axis pair", () => {
    const csv = [
      "mastName,easting,northing,elevation,modelPath,bearingLayerDepthM,groundwaterDepthM,legAEasting,legANorthing,legBEasting,legBNorthing",
      "8-B-BS,512345.678,487654.321,123.456,8-B-BS.pol,2.5,1.8,512340.0,487650.0,512350.0,487658.0",
    ].join("\n");
    const result = parseLineMastCsv(csv);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data[0]!.legAxis).toEqual({
      a: { easting: 512340.0, northing: 487650.0 },
      b: { easting: 512350.0, northing: 487658.0 },
    });
  });

  it("treats leg-axis columns as optional when the header omits them entirely", () => {
    const result = parseLineMastCsv(VALID_CSV);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data[0]!.legAxis).toBeNull();
  });

  it("rejects a row with a partial leg-axis set", () => {
    const csv = [
      "mastName,easting,northing,elevation,modelPath,bearingLayerDepthM,groundwaterDepthM,legAEasting,legANorthing,legBEasting,legBNorthing",
      "8-B-BS,512345.678,487654.321,123.456,8-B-BS.pol,2.5,1.8,512340.0,487650.0,,",
    ].join("\n");
    const result = parseLineMastCsv(csv);
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.errors.some((e) => e.includes("row 2") && e.includes("complete set"))).toBe(true);
  });

  it("reports a non-numeric leg-axis field, pointing at the exact row", () => {
    const csv = [
      "mastName,easting,northing,elevation,modelPath,bearingLayerDepthM,groundwaterDepthM,legAEasting,legANorthing,legBEasting,legBNorthing",
      "8-B-BS,512345.678,487654.321,123.456,8-B-BS.pol,2.5,1.8,not-a-number,487650.0,512350.0,487658.0",
    ].join("\n");
    const result = parseLineMastCsv(csv);
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.errors.some((e) => e.includes("row 2") && e.includes("legAEasting"))).toBe(true);
  });

  it("parses an optional per-mast pointCloudPath column", () => {
    const csv = [
      "mastName,easting,northing,elevation,modelPath,bearingLayerDepthM,groundwaterDepthM,pointCloudPath",
      "8-B-BS,512345.678,487654.321,123.456,8-B-BS.pol,2.5,1.8,8-B-BS.las",
    ].join("\n");
    const result = parseLineMastCsv(csv);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data[0]!.pointCloudPath).toBe("8-B-BS.las");
  });

  it("treats pointCloudPath as optional when the header omits it, or the cell is blank", () => {
    const withoutColumn = parseLineMastCsv(VALID_CSV);
    expect(withoutColumn.success).toBe(true);
    if (withoutColumn.success) expect(withoutColumn.data[0]!.pointCloudPath).toBeNull();

    const csv = [
      "mastName,easting,northing,elevation,modelPath,bearingLayerDepthM,groundwaterDepthM,pointCloudPath",
      "8-B-BS,512345.678,487654.321,123.456,8-B-BS.pol,2.5,1.8,",
    ].join("\n");
    const withBlankCell = parseLineMastCsv(csv);
    expect(withBlankCell.success).toBe(true);
    if (withBlankCell.success) expect(withBlankCell.data[0]!.pointCloudPath).toBeNull();
  });

  it("parses an optional foundationTypeId column that names a real library entry", () => {
    const csv = [
      "mastName,easting,northing,elevation,modelPath,bearingLayerDepthM,groundwaterDepthM,foundationTypeId",
      "8-B-BS,512345.678,487654.321,123.456,8-B-BS.pol,2.5,1.8,stepped-rectangular-v1",
    ].join("\n");
    const result = parseLineMastCsv(csv);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data[0]!.foundationTypeId).toBe("stepped-rectangular-v1");
  });

  it("treats foundationTypeId as optional when the header omits it, or the cell is blank", () => {
    const withoutColumn = parseLineMastCsv(VALID_CSV);
    expect(withoutColumn.success).toBe(true);
    if (withoutColumn.success) expect(withoutColumn.data[0]!.foundationTypeId).toBeNull();

    const csv = [
      "mastName,easting,northing,elevation,modelPath,bearingLayerDepthM,groundwaterDepthM,foundationTypeId",
      "8-B-BS,512345.678,487654.321,123.456,8-B-BS.pol,2.5,1.8,",
    ].join("\n");
    const withBlankCell = parseLineMastCsv(csv);
    expect(withBlankCell.success).toBe(true);
    if (withBlankCell.success) expect(withBlankCell.data[0]!.foundationTypeId).toBeNull();
  });

  it("rejects a foundationTypeId that isn't in the foundation library", () => {
    const csv = [
      "mastName,easting,northing,elevation,modelPath,bearingLayerDepthM,groundwaterDepthM,foundationTypeId",
      "8-B-BS,512345.678,487654.321,123.456,8-B-BS.pol,2.5,1.8,not-a-real-type",
    ].join("\n");
    const result = parseLineMastCsv(csv);
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.errors.some((e) => e.includes("row 2") && e.includes("foundationTypeId"))).toBe(true);
  });
});
