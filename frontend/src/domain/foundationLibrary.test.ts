import { describe, expect, it } from "vitest";
import { generateFoundationGeometry } from "../geometry/foundationGeometry";
import { computeFoundationConcreteVolume } from "../geometry/foundationVolume";
import { FOUNDATION_LIBRARY, requireFoundationTypeById } from "./foundationLibrary";

/**
 * Hólasandslína 3 precast foundations (BM Vallá production drawings V20-032,
 * 2020-05-20). Each designation encodes its own dimensions --
 * `<family><total height cm>-<pad cm>x<pad cm>` -- so the library entry can
 * be checked against its own name, catching a mistyped dimension.
 */
const HS3_DESIGNATION = /^(C|CA|B|F)(\d+)-(\d+)x(\d+)$/;
const HS3_TYPES = FOUNDATION_LIBRARY.filter((t) => HS3_DESIGNATION.test(t.foundationTypeId));

/** Concrete volume from each drawing's title block, m³. */
const TITLE_BLOCK_VOLUME_M3: Record<string, number> = {
  "C120-160x160": 0.9,
  "CA120-160x160": 0.9,
  "C180-160x160": 1.1,
  "CA180-160x160": 1.1,
  "C180-200x200": 2.3,
  "CA180-200x200": 2.3,
  "B120-135x135": 0.6,
  "B170-135x135": 0.7,
  "B220-135x135": 0.9,
  "B120-155x155": 0.7,
  "B170-155x155": 0.9,
  "B220-155x155": 1.1,
  "B220-250x250": 2.1,
  "B270-250x250": 2.4,
  "F175-155x155": 2.4,
};

/** Title blocks whose volume doesn't match the drawing's own dimensions -- flagged for the designer, not a library error. */
const TITLE_BLOCK_MISMATCHES = new Set(["C180-160x160", "CA180-160x160", "B270-250x250", "F175-155x155"]);

function concreteVolume(foundationTypeId: string): number {
  const type = requireFoundationTypeById(foundationTypeId);
  return computeFoundationConcreteVolume(
    generateFoundationGeometry({
      instanceId: "t",
      poleModelId: "t",
      legId: null,
      anchorId: "t",
      displayLabel: "t",
      foundationTypeId,
      parameters: type.defaultParameters,
      position: { x: 0, y: 0 },
      orientationRadians: 0,
      baseElevation: 0,
      visible: true,
      colour: type.defaultColour,
      opacity: 1,
      provenance: type.provenance,
    })
  );
}

describe("Hólasandslína 3 foundation types", () => {
  it("includes all 15 drawings", () => {
    expect(HS3_TYPES.map((t) => t.foundationTypeId).sort()).toEqual(Object.keys(TITLE_BLOCK_VOLUME_M3).sort());
  });

  it.each(HS3_TYPES.map((t) => [t.foundationTypeId, t] as const))(
    "%s matches its own designation (total height and pad size)",
    (id, type) => {
      const [, , heightCm, padCm, padCm2] = HS3_DESIGNATION.exec(id)!;
      const p = type.defaultParameters;
      if (p.geometryType !== "rectangular-pad-tapered-pedestal") throw new Error(`${id}: unexpected geometry type`);

      expect(Math.round((p.padThickness + p.frustumHeight + p.pedestalHeight) * 100)).toBe(Number(heightCm));
      expect(Math.round(p.padWidth * 100)).toBe(Number(padCm));
      expect(Math.round(p.padLength * 100)).toBe(Number(padCm2));
      expect(p.pedestalWidth).toBeLessThan(p.padWidth);
    }
  );

  it.each(Object.keys(TITLE_BLOCK_VOLUME_M3).filter((id) => !TITLE_BLOCK_MISMATCHES.has(id)))(
    "%s concrete volume agrees with its title block to within 0.1 m³",
    (id) => {
      expect(Math.abs(concreteVolume(id) - TITLE_BLOCK_VOLUME_M3[id]!)).toBeLessThanOrEqual(0.1);
    }
  );

  it("a CA type has exactly the same concrete geometry as its C counterpart", () => {
    for (const ca of HS3_TYPES.filter((t) => t.foundationTypeId.startsWith("CA"))) {
      const c = requireFoundationTypeById(ca.foundationTypeId.replace(/^CA/, "C"));
      expect(ca.defaultParameters).toEqual(c.defaultParameters);
    }
  });
});

describe("Hólasandslína 3 inclined pedestals", () => {
  it("gives every B and F type the drawings' 1:8 lean and a small base offset, and no C/CA type any lean", () => {
    for (const type of HS3_TYPES) {
      const p = type.defaultParameters;
      if (p.geometryType !== "rectangular-pad-tapered-pedestal") throw new Error("unexpected geometry type");
      if (/^(B|F)/.test(type.foundationTypeId)) {
        expect(Math.tan(((p.pedestalLeanDegrees ?? 0) * Math.PI) / 180)).toBeCloseTo(1 / 8, 6);
        expect(p.pedestalBaseOffset).toBeGreaterThan(0.04);
        expect(p.pedestalBaseOffset).toBeLessThan(0.06);
      } else {
        expect(p.pedestalLeanDegrees ?? 0).toBe(0);
        expect(p.pedestalBaseOffset ?? 0).toBe(0);
      }
    }
  });
});
