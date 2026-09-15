/**
 * Vertical-section geometry (spec section 14). Every section is computed by
 * intersecting the same authoritative 3D geometry the main viewer uses
 * (terrain TIN, geotech/groundwater boundary surfaces, foundation oriented
 * boxes, excavation skirt+bottom) with a vertical cutting plane -- never a
 * second, independently-drawn illustration (spec: "do not generate an
 * independent illustrative section").
 *
 * A "section coordinate" is (s, z): s is signed distance along the plane's
 * own direction from its origin, z is local Z (elevation) unchanged.
 */

import type { LocalCoordinate } from "../domain/coordinates";
import type { ExcavationInstance } from "../domain/excavation";
import type { FoundationInstance } from "../domain/foundation";
import type { Project } from "../domain/project";
import type { SectionDefinition, SectionPlane } from "../domain/section";
import type { IndexedTriangle, XYZ } from "./barycentric";
import { generateExcavationGeometry, type ExcavationGeometry } from "./excavationGeometry";
import { generateFoundationGeometry, type OrientedBox } from "./foundationGeometry";
import { generateBoundarySurface } from "./geotechBoundary";
import { placePoleModelPoint } from "./polePlacement";

export interface SectionXZ {
  readonly s: number;
  readonly z: number;
}

export interface SectionSegment {
  readonly a: SectionXZ;
  readonly b: SectionXZ;
}

export interface Triangle3 {
  readonly a: XYZ;
  readonly b: XYZ;
  readonly c: XYZ;
}

const EPS = 1e-9;

function planeBasis(plane: SectionPlane): { dirX: number; dirY: number; normX: number; normY: number } {
  const dirX = Math.cos(plane.directionRadians);
  const dirY = Math.sin(plane.directionRadians);
  // Perpendicular to the direction, in the local XY plane.
  return { dirX, dirY, normX: dirY, normY: -dirX };
}

/** Signed distance along the plane's own s-axis, z pass-through, and signed perpendicular distance from the plane (0 = exactly on it). */
export function sectionCoordinateOf(
  point: XYZ,
  plane: SectionPlane
): SectionXZ & { readonly perpendicularM: number } {
  const { dirX, dirY, normX, normY } = planeBasis(plane);
  const dx = point.x - plane.originX;
  const dy = point.y - plane.originY;
  return {
    s: dx * dirX + dy * dirY,
    z: point.z,
    perpendicularM: dx * normX + dy * normY,
  };
}

function classifySign(d: number): -1 | 0 | 1 {
  if (d > EPS) return 1;
  if (d < -EPS) return -1;
  return 0;
}

function pointsEqual(a: SectionXZ, b: SectionXZ): boolean {
  return Math.abs(a.s - b.s) < 1e-9 && Math.abs(a.z - b.z) < 1e-9;
}

/**
 * Intersects one triangle with the vertical plane. Handles the general
 * two-edge crossing, a vertex lying exactly on the plane, and an entire
 * edge lying on the plane; returns null when the triangle does not cross
 * the plane at all (or only touches it at a single point).
 */
export function intersectTriangleWithPlane(triangle: Triangle3, plane: SectionPlane): SectionSegment | null {
  const verts = [triangle.a, triangle.b, triangle.c].map((p) => sectionCoordinateOf(p, plane));
  const signs = verts.map((v) => classifySign(v.perpendicularM));

  if (signs[0] === signs[1] && signs[1] === signs[2] && signs[0] !== 0) return null;

  const points: SectionXZ[] = [];
  const pushIfNew = (p: SectionXZ) => {
    if (!points.some((q) => pointsEqual(q, p))) points.push(p);
  };

  for (let i = 0; i < 3; i += 1) {
    if (signs[i] === 0) pushIfNew({ s: verts[i]!.s, z: verts[i]!.z });
  }
  for (let i = 0; i < 3; i += 1) {
    const j = (i + 1) % 3;
    if (signs[i] !== 0 && signs[j] !== 0 && signs[i] !== signs[j]) {
      const vi = verts[i]!;
      const vj = verts[j]!;
      const t = vi.perpendicularM / (vi.perpendicularM - vj.perpendicularM);
      pushIfNew({ s: vi.s + t * (vj.s - vi.s), z: vi.z + t * (vj.z - vi.z) });
    }
  }

  if (points.length < 2) return null;
  return { a: points[0]!, b: points[1]! };
}

export function intersectTrianglesWithPlane(
  triangles: readonly Triangle3[],
  plane: SectionPlane
): SectionSegment[] {
  const segments: SectionSegment[] = [];
  for (const triangle of triangles) {
    const segment = intersectTriangleWithPlane(triangle, plane);
    if (segment) segments.push(segment);
  }
  return segments;
}

/** Converts any indexed-triangle surface (terrain TIN, geotech/groundwater boundary surface -- same {points, triangles} shape) into explicit triangles. */
export function trianglesFromIndexedSurface(surface: {
  readonly points: readonly XYZ[];
  readonly triangles: readonly IndexedTriangle[];
}): Triangle3[] {
  return surface.triangles.map((t) => {
    const [ia, ib, ic] = t.indices;
    return { a: surface.points[ia]!, b: surface.points[ib]!, c: surface.points[ic]! };
  });
}

function boxCorner(box: OrientedBox, bx: -1 | 1, by: -1 | 1, bz: -1 | 1): XYZ {
  const cos = Math.cos(box.orientationRadians);
  const sin = Math.sin(box.orientationRadians);
  const lx = bx * box.halfExtents.x;
  const ly = by * box.halfExtents.y;
  return {
    x: box.centre.x + lx * cos - ly * sin,
    y: box.centre.y + lx * sin + ly * cos,
    z: box.centre.z + bz * box.halfExtents.z,
  };
}

/** Triangulates an oriented box's 6 faces (12 triangles) for plane intersection. Winding order is irrelevant here (no shading), only the geometry. */
export function orientedBoxTriangles(box: OrientedBox): Triangle3[] {
  const c = (bx: -1 | 1, by: -1 | 1, bz: -1 | 1) => boxCorner(box, bx, by, bz);
  return [
    // bottom / top
    { a: c(-1, -1, -1), b: c(1, -1, -1), c: c(1, 1, -1) },
    { a: c(-1, -1, -1), b: c(1, 1, -1), c: c(-1, 1, -1) },
    { a: c(-1, -1, 1), b: c(1, -1, 1), c: c(1, 1, 1) },
    { a: c(-1, -1, 1), b: c(1, 1, 1), c: c(-1, 1, 1) },
    // x faces
    { a: c(-1, -1, -1), b: c(-1, 1, -1), c: c(-1, 1, 1) },
    { a: c(-1, -1, -1), b: c(-1, 1, 1), c: c(-1, -1, 1) },
    { a: c(1, -1, -1), b: c(1, 1, -1), c: c(1, 1, 1) },
    { a: c(1, -1, -1), b: c(1, 1, 1), c: c(1, -1, 1) },
    // y faces
    { a: c(-1, -1, -1), b: c(1, -1, -1), c: c(1, -1, 1) },
    { a: c(-1, -1, -1), b: c(1, -1, 1), c: c(-1, -1, 1) },
    { a: c(-1, 1, -1), b: c(1, 1, -1), c: c(1, 1, 1) },
    { a: c(-1, 1, -1), b: c(1, 1, 1), c: c(-1, 1, 1) },
  ];
}

/** Mirrors ExcavationMesh.tsx's own triangulation (bottom quad + skirt ring quads) so the section is guaranteed to match the rendered excavation. */
export function excavationGeometryTriangles(geometry: ExcavationGeometry): Triangle3[] {
  const triangles: Triangle3[] = [];
  const [c0, c1, c2, c3] = geometry.bottomCorners;
  if (c0 && c1 && c2 && c3) {
    triangles.push({ a: c0, b: c1, c: c2 }, { a: c0, b: c2, c: c3 });
  }

  const n = geometry.bottomRing.length;
  for (let i = 0; i < n; i += 1) {
    const next = (i + 1) % n;
    const b0 = geometry.bottomRing[i]!;
    const b1 = geometry.bottomRing[next]!;
    const t0 = geometry.topRing[i]!.point;
    const t1 = geometry.topRing[next]!.point;
    triangles.push({ a: b0, b: b1, c: t1 }, { a: b0, b: t1, c: t0 });
  }
  return triangles;
}

export function buildSectionPlane(
  project: Project,
  mode: SectionDefinition["mode"],
  legId: string | null,
  custom?: SectionPlane
): SectionPlane {
  switch (mode) {
    case "longitudinal":
      return { originX: 0, originY: 0, directionRadians: Math.PI / 2 };
    case "transverse":
      return { originX: 0, originY: 0, directionRadians: 0 };
    case "leg": {
      const foundation = legId ? project.foundationInstances.find((f) => f.legId === legId) : undefined;
      if (!foundation) return { originX: 0, originY: 0, directionRadians: 0 };
      return {
        originX: 0,
        originY: 0,
        directionRadians: Math.atan2(foundation.position.y, foundation.position.x),
      };
    }
    case "custom":
      return custom ?? { originX: 0, originY: 0, directionRadians: 0 };
  }
}

export interface SectionAnchorMark {
  readonly anchorId: string;
  readonly name: string;
  readonly s: number;
  readonly z: number;
}

export interface SectionFoundationOutline {
  readonly instanceId: string;
  readonly legId: string;
  readonly colour: string;
  readonly segments: readonly SectionSegment[];
}

export interface SectionExcavationOutline {
  readonly excavationId: string;
  readonly colour: string;
  readonly truncated: boolean;
  readonly bottomElevationM: number;
  readonly segments: readonly SectionSegment[];
}

export interface SectionBoundaryLine {
  readonly id: string;
  readonly name: string;
  readonly colour: string;
  readonly verificationState: string;
  readonly segments: readonly SectionSegment[];
}

export interface SectionResult {
  readonly plane: SectionPlane;
  readonly pointToleranceM: number;
  readonly terrainSegments: readonly SectionSegment[];
  readonly terrainSourcePoints: readonly SectionXZ[];
  readonly anchors: readonly SectionAnchorMark[];
  readonly foundations: readonly SectionFoundationOutline[];
  readonly excavations: readonly SectionExcavationOutline[];
  readonly geotechBoundaries: readonly SectionBoundaryLine[];
  readonly groundwater: SectionBoundaryLine | null;
}

function withinTolerance(perpendicularM: number, toleranceM: number): boolean {
  return Math.abs(perpendicularM) <= toleranceM / 2;
}

function foundationOutline(foundation: FoundationInstance, plane: SectionPlane): SectionFoundationOutline {
  const geometry = generateFoundationGeometry(foundation);
  const triangles = geometry.parts.flatMap(orientedBoxTriangles);
  return {
    instanceId: foundation.instanceId,
    legId: foundation.legId,
    colour: foundation.colour,
    segments: intersectTrianglesWithPlane(triangles, plane),
  };
}

function excavationOutline(
  excavation: ExcavationInstance,
  foundation: FoundationInstance,
  terrainSurface: Project["terrainSurface"],
  plane: SectionPlane
): SectionExcavationOutline | null {
  if (!terrainSurface) return null;
  const geometry = generateExcavationGeometry(excavation, foundation, terrainSurface);
  const triangles = excavationGeometryTriangles(geometry);
  return {
    excavationId: excavation.id,
    colour: excavation.colour,
    truncated: geometry.truncated,
    bottomElevationM: excavation.bottomElevationM,
    segments: intersectTrianglesWithPlane(triangles, plane),
  };
}

function boundaryLine(
  id: string,
  name: string,
  colour: string,
  verificationState: string,
  boundarySurfaceTriangles: readonly Triangle3[],
  plane: SectionPlane
): SectionBoundaryLine {
  return { id, name, colour, verificationState, segments: intersectTrianglesWithPlane(boundarySurfaceTriangles, plane) };
}

/**
 * Assembles a full section from the project's own current geometry. Pure
 * and deterministic: called again whenever the project (or the section
 * definition) changes, it always reflects the current state (acceptance
 * criteria: "section geometry updates when source geometry changes").
 */
export function generateSectionResult(project: Project, section: SectionDefinition): SectionResult {
  const plane = section.plane;
  const terrainSurface = project.terrainSurface;

  const terrainTriangles = terrainSurface ? trianglesFromIndexedSurface(terrainSurface) : [];
  const terrainSegments = intersectTrianglesWithPlane(terrainTriangles, plane);

  const terrainSourcePoints: SectionXZ[] = [];
  if (terrainSurface) {
    for (const p of terrainSurface.points) {
      const coord = sectionCoordinateOf(p, plane);
      if (withinTolerance(coord.perpendicularM, section.pointToleranceM)) {
        terrainSourcePoints.push({ s: coord.s, z: coord.z });
      }
    }
  }

  const anchors: SectionAnchorMark[] = [];
  for (const anchor of project.poleModel.anchors) {
    const placed: LocalCoordinate = placePoleModelPoint(anchor.localPosition, project.poleModel);
    const coord = sectionCoordinateOf(placed, plane);
    if (withinTolerance(coord.perpendicularM, section.pointToleranceM)) {
      anchors.push({ anchorId: anchor.id, name: anchor.name, s: coord.s, z: coord.z });
    }
  }

  const foundations = project.foundationInstances.map((f) => foundationOutline(f, plane));

  const excavations = project.excavationInstances
    .map((excavation) => {
      const foundation = project.foundationInstances.find((f) => f.instanceId === excavation.foundationInstanceId);
      if (!foundation) return null;
      return excavationOutline(excavation, foundation, terrainSurface, plane);
    })
    .filter((e): e is SectionExcavationOutline => e !== null);

  const geotechBoundaries: SectionBoundaryLine[] = [];
  if (terrainSurface) {
    for (const layer of project.geotechLayers) {
      const topSurface = generateBoundarySurface(layer.topBoundary, terrainSurface, project.mastCentreProject.elevation);
      const bottomSurface = generateBoundarySurface(
        layer.bottomBoundary,
        terrainSurface,
        project.mastCentreProject.elevation
      );
      geotechBoundaries.push(
        boundaryLine(
          `${layer.id}-top`,
          `${layer.name} (top)`,
          layer.colour,
          layer.source.verificationState,
          trianglesFromIndexedSurface(topSurface),
          plane
        ),
        boundaryLine(
          `${layer.id}-bottom`,
          `${layer.name} (bottom)`,
          layer.colour,
          layer.source.verificationState,
          trianglesFromIndexedSurface(bottomSurface),
          plane
        )
      );
    }
  }

  let groundwater: SectionBoundaryLine | null = null;
  if (terrainSurface && project.groundwater) {
    const gw = project.groundwater;
    const surface = generateBoundarySurface(gw.boundary, terrainSurface, project.mastCentreProject.elevation);
    groundwater = boundaryLine(
      gw.id,
      gw.name,
      gw.colour,
      gw.source.verificationState,
      trianglesFromIndexedSurface(surface),
      plane
    );
  }

  return {
    plane,
    pointToleranceM: section.pointToleranceM,
    terrainSegments,
    terrainSourcePoints,
    anchors,
    foundations,
    excavations,
    geotechBoundaries,
    groundwater,
  };
}
