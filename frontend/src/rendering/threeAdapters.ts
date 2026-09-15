import * as THREE from "three";
import type { ViewerCoordinate } from "../domain/coordinates";
import { viewerCoordinate } from "../domain/coordinates";

/**
 * The domain's viewer coordinate space is right-handed with Z up (X
 * transverse, Y longitudinal, Z vertical -- see
 * docs/architecture/coordinate-strategy.md). Three.js's own convention is
 * right-handed with Y up. This is the single, explicit mapping between the
 * two, used everywhere a domain coordinate becomes a Three.js position (and
 * vice versa for raycast results), so the axis convention is resolved once
 * rather than risking an inconsistent mapping -- and a silently mirrored or
 * rotated scene -- across rendering components.
 *
 *   domain X (transverse)   -> three X
 *   domain Z (up)           -> three Y
 *   domain Y (longitudinal) -> three -Z
 *
 * This preserves right-handedness: in the domain frame X x Z = -Y (a
 * property of the right-handed X x Y = Z basis), i.e. three X x three Y =
 * three Z, matching Three.js's own right-handed convention.
 */
export function toThreeVector3(viewer: ViewerCoordinate): THREE.Vector3 {
  return new THREE.Vector3(viewer.x, viewer.z, -viewer.y);
}

export function toThreeArrayXYZ(viewer: ViewerCoordinate): [number, number, number] {
  return [viewer.x, viewer.z, -viewer.y];
}

export function fromThreeVector3(v: THREE.Vector3 | { x: number; y: number; z: number }): ViewerCoordinate {
  return viewerCoordinate(v.x, -v.z, v.y);
}

/**
 * Converts a rotation about the domain's vertical axis (Z, right-handed) to
 * the equivalent rotation about Three.js's vertical axis (Y, right-handed),
 * consistent with the toThreeVector3 axis mapping above. Verified in
 * threeAdapters.test.ts by rotating both domain basis vectors (X and Y) by
 * theta with the domain's own Rz(theta) and confirming the mapped result
 * equals directly rotating the three-mapped original vectors by the value
 * this function returns -- worked out to be the identity (no sign flip),
 * but kept as a named function rather than using orientationRadians
 * directly as a Three rotation, so this derivation lives in one place and
 * is not re-derived (or silently gotten wrong) per call site.
 */
export function domainZRotationToThreeYRotation(domainRotationRadians: number): number {
  return domainRotationRadians;
}
