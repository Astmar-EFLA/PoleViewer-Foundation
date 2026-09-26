import { describe, expect, it } from "vitest";
import type { FoundationParameters } from "../domain/foundation";
import { generateFoundationGeometryFromParameters } from "./foundationGeometry";
import { computeFoundationConcreteVolume, rectangularFrustumVolume } from "./foundationVolume";

const PLACEMENT = { position: { x: 0, y: 0 }, orientationRadians: 0, baseElevation: -2 };

function volumeOf(parameters: FoundationParameters, placement = PLACEMENT): number {
  return computeFoundationConcreteVolume(generateFoundationGeometryFromParameters(parameters, placement));
}

describe("rectangularFrustumVolume", () => {
  it("reduces to a prism when both faces are equal", () => {
    expect(rectangularFrustumVolume(2, 3, 3)).toBeCloseTo(6, 9);
  });

  it("reduces to a pyramid when the top face is zero", () => {
    expect(rectangularFrustumVolume(3, 4, 0)).toBeCloseTo(4, 9);
  });
});

describe("computeFoundationConcreteVolume", () => {
  it("sums pad and pedestal boxes for rectangular-pad-pedestal", () => {
    const volume = volumeOf({
      geometryType: "rectangular-pad-pedestal",
      padWidth: 2,
      padLength: 3,
      padThickness: 0.5,
      pedestalWidth: 0.5,
      pedestalLength: 0.6,
      pedestalHeight: 1,
    });
    // 2*3*0.5 + 0.5*0.6*1
    expect(volume).toBeCloseTo(3.3, 9);
  });

  it("sums every step for stepped-rectangular", () => {
    const volume = volumeOf({
      geometryType: "stepped-rectangular",
      steps: [
        { width: 2, length: 2, height: 0.5 },
        { width: 1, length: 1, height: 1 },
      ],
    });
    expect(volume).toBeCloseTo(3, 9);
  });

  it("treats a tapered section with equal top and bottom faces as a box", () => {
    const volume = volumeOf({
      geometryType: "rectangular-pad-tapered-pedestal",
      padWidth: 1,
      padLength: 1,
      padThickness: 0.5,
      frustumHeight: 0.4,
      pedestalWidth: 1,
      pedestalLength: 1,
      pedestalHeight: 0.6,
    });
    expect(volume).toBeCloseTo(1.5, 9);
  });

  it("uses the frustum formula for the tapered section", () => {
    const volume = volumeOf({
      geometryType: "rectangular-pad-tapered-pedestal",
      padWidth: 2,
      padLength: 2,
      padThickness: 0.5,
      frustumHeight: 0.6,
      pedestalWidth: 0.5,
      pedestalLength: 0.5,
      pedestalHeight: 0.8,
    });
    // pad 2*2*0.5 = 2; frustum 0.6/3 * (4 + 0.25 + 1) = 1.05; pedestal 0.5*0.5*0.8 = 0.2
    expect(volume).toBeCloseTo(3.25, 9);
  });

  it("does not depend on placement", () => {
    const parameters: FoundationParameters = {
      geometryType: "rectangular-pad-pedestal",
      padWidth: 2,
      padLength: 3,
      padThickness: 0.5,
      pedestalWidth: 0.5,
      pedestalLength: 0.6,
      pedestalHeight: 1,
    };
    const moved = { position: { x: 12, y: -7 }, orientationRadians: 1.1, baseElevation: 40 };
    expect(volumeOf(parameters, moved)).toBeCloseTo(volumeOf(parameters), 9);
  });
});
