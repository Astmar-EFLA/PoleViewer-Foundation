import { describe, expect, it } from "vitest";
import { dxfEntities, dxfPairs } from "../tests/dxfParsing";
import { createDxfDocument, escapeDxfText, sanitizeDxfLayerName } from "./dxfWriter";

describe("createDxfDocument", () => {
  it("writes an R12 file with header, tables, entities and EOF, in that order", () => {
    const doc = createDxfDocument();
    doc.line(doc.addLayer("TERRAIN", 34), 0, 0, 1, 1);
    const dxf = doc.toString();

    const pairs = dxfPairs(dxf);
    const sections = pairs.filter(([c], i) => c === "2" && pairs[i - 1]?.[1] === "SECTION").map(([, v]) => v);
    expect(sections).toEqual(["HEADER", "TABLES", "ENTITIES"]);
    expect(pairs[pairs.length - 1]).toEqual(["0", "EOF"]);
    expect(dxf).toContain("$ACADVER\r\n1\r\nAC1009");
  });

  it("writes LINE entities with their layer and both endpoints", () => {
    const doc = createDxfDocument();
    const layer = doc.addLayer("FOUNDATION", 8);
    doc.line(layer, -1.5, 100.25, 2, 99);
    const [line] = dxfEntities(doc.toString());

    expect(line!.type).toBe("LINE");
    expect(line!.codes.get("8")).toEqual(["FOUNDATION"]);
    expect(Number(line!.codes.get("10")![0])).toBeCloseTo(-1.5, 6);
    expect(Number(line!.codes.get("20")![0])).toBeCloseTo(100.25, 6);
    expect(Number(line!.codes.get("11")![0])).toBeCloseTo(2, 6);
    expect(Number(line!.codes.get("21")![0])).toBeCloseTo(99, 6);
  });

  it("declares every added layer (plus layer 0) with its colour and linetype", () => {
    const doc = createDxfDocument();
    doc.addLayer("TERRAIN", 34);
    doc.addLayer("FILL", 3, "DASHED");
    doc.addLayer("FILL", 5); // re-adding keeps the first definition
    const pairs = dxfPairs(doc.toString());

    const layerNames = pairs.filter(([c], i) => c === "2" && pairs[i - 1]?.[1] === "LAYER").map(([, v]) => v);
    expect(layerNames).toEqual(["0", "TERRAIN", "FILL"]);
    const fillIndex = pairs.findIndex(([c, v], i) => c === "2" && v === "FILL" && pairs[i - 1]?.[1] === "LAYER");
    expect(pairs.slice(fillIndex, fillIndex + 4)).toEqual([
      ["2", "FILL"],
      ["70", "0"],
      ["62", "3"],
      ["6", "DASHED"],
    ]);
  });

  it("records the drawing extents in the header", () => {
    const doc = createDxfDocument();
    doc.line("0", -3, 50, 4, 52);
    doc.point("0", 1, 49);
    const dxf = doc.toString();
    expect(dxf).toContain("$EXTMIN\r\n10\r\n-3.0000\r\n20\r\n49.0000");
    expect(dxf).toContain("$EXTMAX\r\n10\r\n4.0000\r\n20\r\n52.0000");
  });

  it("skips entities with non-finite coordinates rather than writing NaN", () => {
    const doc = createDxfDocument();
    doc.line("0", 0, 0, Number.NaN, 1);
    expect(dxfEntities(doc.toString())).toEqual([]);
  });

  it("writes centred TEXT with its second alignment point", () => {
    const doc = createDxfDocument();
    doc.text("0", 2, 3, 0.4, "Title", "center");
    const [text] = dxfEntities(doc.toString());
    expect(text!.type).toBe("TEXT");
    expect(text!.codes.get("1")).toEqual(["Title"]);
    expect(text!.codes.get("72")).toEqual(["1"]);
    expect(Number(text!.codes.get("11")![0])).toBeCloseTo(2, 6);
  });
});

describe("escapeDxfText", () => {
  it("escapes non-ASCII characters as \\U+XXXX and keeps ASCII as-is", () => {
    expect(escapeDxfText("Þverá M-12")).toBe("\\U+00DEver\\U+00E1 M-12");
  });

  it("flattens newlines into spaces", () => {
    expect(escapeDxfText("a\nb")).toBe("a b");
  });
});

describe("sanitizeDxfLayerName", () => {
  it("upper-cases and transliterates, replacing anything R12 forbids", () => {
    expect(sanitizeDxfLayerName("GEOTECH-Jarðvegur (laus)")).toBe("GEOTECH-JARDVEGUR_LAUS_");
    expect(sanitizeDxfLayerName("Þéttur")).toBe("THETTUR");
  });

  it("falls back to a placeholder for an empty name", () => {
    expect(sanitizeDxfLayerName("")).toBe("LAYER");
  });
});
