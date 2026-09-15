import { describe, expect, it } from "vitest";
import {
  degreesToRadians,
  gonToRadians,
  normalizeRadians,
  radiansToDegrees,
  radiansToGon,
} from "./angles";

describe("angle unit conversion", () => {
  it("converts a full turn correctly for degrees", () => {
    expect(degreesToRadians(360)).toBeCloseTo(2 * Math.PI, 12);
    expect(degreesToRadians(90)).toBeCloseTo(Math.PI / 2, 12);
  });

  it("converts a full turn correctly for gon", () => {
    expect(gonToRadians(400)).toBeCloseTo(2 * Math.PI, 12);
    expect(gonToRadians(100)).toBeCloseTo(Math.PI / 2, 12);
  });

  it("round-trips degrees -> radians -> degrees", () => {
    const original = 137.25;
    expect(radiansToDegrees(degreesToRadians(original))).toBeCloseTo(original, 12);
  });

  it("round-trips gon -> radians -> gon", () => {
    const original = 271.5;
    expect(radiansToGon(gonToRadians(original))).toBeCloseTo(original, 12);
  });

  it("degrees and gon agree at known equivalent angles", () => {
    // 90 degrees == 100 gon (quarter turn)
    expect(degreesToRadians(90)).toBeCloseTo(gonToRadians(100), 12);
  });

  it("normalizes negative and over-full-turn angles into [0, 2*PI)", () => {
    expect(normalizeRadians(-Math.PI / 2)).toBeCloseTo((3 * Math.PI) / 2, 12);
    expect(normalizeRadians(2.5 * Math.PI)).toBeCloseTo(Math.PI / 2, 12);
    expect(normalizeRadians(0)).toBeCloseTo(0, 12);
  });
});
