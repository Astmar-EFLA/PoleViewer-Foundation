import * as THREE from "three";
import { localCoordinate, type LocalCoordinate, type ViewerFrameDefinition } from "../domain/coordinates";
import type { PoleMember, PoleMemberCategory, PoleModel } from "../domain/poleModel";
import { localToViewer } from "../geometry/coordinateTransform";
import type { OrientedFrustum } from "../geometry/foundationGeometry";
import { placePoleModelPoint } from "../geometry/polePlacement";
import { toThreeVector3 } from "./threeAdapters";

/**
 * Pure BufferGeometry builders shared by the scene components and the GLB
 * export (services/glbExport.ts), so the exported model is the same
 * geometry the viewer draws -- never a second, drifting re-derivation.
 */

interface XYZ {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

function writeViewerPositions(points: readonly XYZ[], viewerFrame: ViewerFrameDefinition, out: Float32Array, offset = 0) {
  points.forEach((p, i) => {
    const v3 = toThreeVector3(localToViewer(localCoordinate(p.x, p.y, p.z), viewerFrame));
    const at = (offset + i) * 3;
    out[at] = v3.x;
    out[at + 1] = v3.y;
    out[at + 2] = v3.z;
  });
}

/** One category of pole members (structure, cable = guys, insulator) as line segments. */
export function buildPoleMemberLines(
  members: readonly PoleMember[],
  category: PoleMemberCategory,
  poleModel: PoleModel,
  viewerFrame: ViewerFrameDefinition
): THREE.BufferGeometry {
  const filtered = members.filter((m) => m.category === category);
  const ends = filtered.flatMap((m) => [placePoleModelPoint(m.a, poleModel), placePoleModelPoint(m.b, poleModel)]);
  const positions = new Float32Array(ends.length * 3);
  writeViewerPositions(ends, viewerFrame, positions);
  const geom = new THREE.BufferGeometry();
  geom.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  return geom;
}

/** Any {points, triangles} surface in local coordinates (terrain TIN, geotech/groundwater boundary). */
export function buildTriangulatedSurface(
  points: readonly XYZ[],
  triangles: readonly { readonly indices: readonly [number, number, number] }[],
  viewerFrame: ViewerFrameDefinition
): THREE.BufferGeometry {
  const positions = new Float32Array(points.length * 3);
  writeViewerPositions(points, viewerFrame, positions);
  const indices: number[] = [];
  for (const triangle of triangles) {
    indices.push(triangle.indices[0], triangle.indices[1], triangle.indices[2]);
  }
  const geom = new THREE.BufferGeometry();
  geom.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geom.setIndex(indices);
  geom.computeVertexNormals();
  return geom;
}

/** A flat four-corner quad (excavation bottom, fill top plate). */
export function buildQuad(corners: readonly LocalCoordinate[], viewerFrame: ViewerFrameDefinition): THREE.BufferGeometry {
  const positions = new Float32Array(corners.length * 3);
  writeViewerPositions(corners, viewerFrame, positions);
  const geom = new THREE.BufferGeometry();
  geom.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geom.setIndex([0, 1, 2, 0, 2, 3]);
  geom.computeVertexNormals();
  return geom;
}

/**
 * The sloped sides between two closed rings of equal length -- an
 * excavation (bottom perimeter -> terrain ring) or a fill (top plate ->
 * terrain ring). Quad i joins ring point i and i+1 on both rings.
 */
export function buildRingSkirt(
  firstRing: readonly LocalCoordinate[],
  secondRing: readonly LocalCoordinate[],
  viewerFrame: ViewerFrameDefinition
): THREE.BufferGeometry {
  const n = firstRing.length;
  const positions = new Float32Array(n * 2 * 3);
  writeViewerPositions(firstRing, viewerFrame, positions);
  writeViewerPositions(secondRing, viewerFrame, positions, n);
  const indices: number[] = [];
  for (let i = 0; i < n; i += 1) {
    const next = (i + 1) % n;
    indices.push(i, next, n + next, i, n + next, n + i);
  }
  const geom = new THREE.BufferGeometry();
  geom.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geom.setIndex(indices);
  geom.computeVertexNormals();
  return geom;
}

/** A closed ring as a polyline's points in Three.js space (the terrain-intersection line). */
export function closedRingThreePoints(
  ring: readonly LocalCoordinate[],
  viewerFrame: ViewerFrameDefinition
): [number, number, number][] {
  return [...ring, ring[0]!].map((p) => {
    const v3 = toThreeVector3(localToViewer(p, viewerFrame));
    return [v3.x, v3.y, v3.z];
  });
}

/**
 * A frustum part (the tapered pad-to-pedestal transition, or a leaning
 * pedestal), built in local, unrotated, origin-centred space (bottom face at
 * -halfHeight, top at +halfHeight) exactly like THREE.BoxGeometry, so the
 * same position/rotation that places a box part places this identically.
 */
export function buildFrustum(frustum: OrientedFrustum): THREE.BufferGeometry {
  const { bottomHalfExtents, topHalfExtents, halfHeight } = frustum;
  // An oblique frustum (leaning pedestal) shifts its faces by -/+ shear/2;
  // local Y maps to Three's -Z (rendering/threeAdapters.ts toThreeArrayXYZ).
  const sx = (frustum.shear?.x ?? 0) / 2;
  const sz = -(frustum.shear?.y ?? 0) / 2;
  const positions = new Float32Array(
    [
      [-bottomHalfExtents.x - sx, -halfHeight, -bottomHalfExtents.y - sz],
      [bottomHalfExtents.x - sx, -halfHeight, -bottomHalfExtents.y - sz],
      [bottomHalfExtents.x - sx, -halfHeight, bottomHalfExtents.y - sz],
      [-bottomHalfExtents.x - sx, -halfHeight, bottomHalfExtents.y - sz],
      [-topHalfExtents.x + sx, halfHeight, -topHalfExtents.y + sz],
      [topHalfExtents.x + sx, halfHeight, -topHalfExtents.y + sz],
      [topHalfExtents.x + sx, halfHeight, topHalfExtents.y + sz],
      [-topHalfExtents.x + sx, halfHeight, topHalfExtents.y + sz],
    ].flat()
  );
  // Bottom quad, top quad, then 4 side quads connecting corner i to i+1 at both levels.
  const indices: number[] = [0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7];
  for (let i = 0; i < 4; i += 1) {
    const next = (i + 1) % 4;
    indices.push(i, next, 4 + next, i, 4 + next, 4 + i);
  }
  const geom = new THREE.BufferGeometry();
  geom.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geom.setIndex(indices);
  geom.computeVertexNormals();
  return geom;
}
