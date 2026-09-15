import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { viewerCoordinate } from "../domain/coordinates";
import {
  domainZRotationToThreeYRotation,
  fromThreeVector3,
  toThreeArrayXYZ,
  toThreeVector3,
} from "./threeAdapters";

/** Domain rotation about Z (right-handed): (x,y,z) -> (x cos - y sin, x sin + y cos, z). */
function rotateDomainAboutZ(v: { x: number; y: number; z: number }, theta: number) {
  return {
    x: v.x * Math.cos(theta) - v.y * Math.sin(theta),
    y: v.x * Math.sin(theta) + v.y * Math.cos(theta),
    z: v.z,
  };
}

describe("toThreeVector3 / fromThreeVector3 round trip", () => {
  it("round-trips an arbitrary viewer coordinate", () => {
    const original = viewerCoordinate(3.2, -7.5, 1.1);
    const three = toThreeVector3(original);
    const back = fromThreeVector3(three);
    expect(back.x).toBeCloseTo(original.x, 9);
    expect(back.y).toBeCloseTo(original.y, 9);
    expect(back.z).toBeCloseTo(original.z, 9);
  });

  it("maps domain up (+Z) to three's up axis (+Y)", () => {
    const straightUp = viewerCoordinate(0, 0, 5);
    const three = toThreeVector3(straightUp);
    expect(three.x).toBeCloseTo(0, 9);
    expect(three.y).toBeCloseTo(5, 9);
    expect(three.z).toBeCloseTo(0, 9);
  });

  it("maps domain transverse (+X) to three's +X unchanged", () => {
    const three = toThreeVector3(viewerCoordinate(7, 0, 0));
    expect(three.x).toBeCloseTo(7, 9);
    expect(three.y).toBeCloseTo(0, 9);
    expect(three.z).toBeCloseTo(0, 9);
  });

  it("array form matches the Vector3 form", () => {
    const original = viewerCoordinate(1, 2, 3);
    const asArray = toThreeArrayXYZ(original);
    const asVector = toThreeVector3(original);
    expect(asArray).toEqual([asVector.x, asVector.y, asVector.z]);
  });
});

describe("domainZRotationToThreeYRotation", () => {
  // Independently verifies the rotation-axis mapping by comparing two
  // routes to the same answer for two different basis vectors: (a) rotate
  // in domain space then map to three, vs. (b) map to three then rotate in
  // three space by the value under test. A wrong sign would fail this for
  // at least one of the two vectors (they are not symmetric under a sign
  // flip), which is why both are checked rather than just one.
  const theta = degreesToRadiansForTest(37);

  function degreesToRadiansForTest(deg: number) {
    return (deg / 360) * 2 * Math.PI;
  }

  it.each([
    { label: "domain +X axis", vector: { x: 1, y: 0, z: 0 } },
    { label: "domain +Y axis", vector: { x: 0, y: 1, z: 0 } },
  ])("agrees for $label", ({ vector }) => {
    const rotatedInDomain = rotateDomainAboutZ(vector, theta);
    const mappedAfterDomainRotation = toThreeVector3({ space: "viewer", ...rotatedInDomain });

    const mappedOriginal = toThreeVector3({ space: "viewer", ...vector });
    const threeRotationY = domainZRotationToThreeYRotation(theta);
    const rotatedInThree = mappedOriginal.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), threeRotationY);

    expect(rotatedInThree.x).toBeCloseTo(mappedAfterDomainRotation.x, 9);
    expect(rotatedInThree.y).toBeCloseTo(mappedAfterDomainRotation.y, 9);
    expect(rotatedInThree.z).toBeCloseTo(mappedAfterDomainRotation.z, 9);
  });
});
