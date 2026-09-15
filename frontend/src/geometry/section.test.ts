import { describe, expect, it } from "vitest";
import { localCoordinate } from "../domain/coordinates";
import type { ExcavationInstance } from "../domain/excavation";
import type { FoundationInstance } from "../domain/foundation";
import { DEFAULT_TERRAIN_GENERATION_SETTINGS } from "../domain/pointCloud";
import type { Project } from "../domain/project";
import type { SectionDefinition } from "../domain/section";
import { loadSyntheticFixtureJson } from "../tests/fixtures";
import { loadTerrainFixturePoints } from "../tests/terrainFixtures";
import { parsePoleModel } from "../validation/poleModelSchema";
import { buildDefaultFoundationInstances } from "../services/buildFoundationInstances";
import { requireFoundationTypeById } from "../domain/foundationLibrary";
import { generateFoundationGeometry } from "./foundationGeometry";
import {
  buildSectionPlane,
  excavationGeometryTriangles,
  generateSectionResult,
  intersectTriangleWithPlane,
  orientedBoxTriangles,
  trianglesFromIndexedSurface,
  type Triangle3,
} from "./section";
import { generateExcavationGeometry } from "./excavationGeometry";
import { generateTin } from "./terrain";

const NOW = "2026-09-15T00:00:00.000Z";
const PROVENANCE = { originType: "assumed" as const, verificationState: "unverified" as const };

describe("intersectTriangleWithPlane", () => {
  const flatTriangle: Triangle3 = {
    a: { x: -5, y: -5, z: 0 },
    b: { x: 5, y: -5, z: 0 },
    c: { x: 0, y: 5, z: 2 },
  };

  it("returns null when the triangle is entirely on one side of the plane", () => {
    const plane = { originX: 100, originY: 0, directionRadians: Math.PI / 2 }; // vertical plane at x=100
    expect(intersectTriangleWithPlane(flatTriangle, plane)).toBeNull();
  });

  it("cuts a triangle at x=0 into a segment with the expected endpoints (hand-derived)", () => {
    // Plane x=0 (direction along +Y, so s = y, perpendicular = x).
    const plane = { originX: 0, originY: 0, directionRadians: Math.PI / 2 };
    const segment = intersectTriangleWithPlane(flatTriangle, plane);
    expect(segment).not.toBeNull();
    // Edge a-b: z=0 along y=-5, crosses x=0 at (0,-5,0) -> s=-5, z=0.
    // Edge b-c: from (5,-5,0) to (0,5,2), crosses x=0 exactly at c itself (x=0) -> s=5, z=2.
    const points = [segment!.a, segment!.b].sort((p, q) => p.s - q.s);
    expect(points[0]!.s).toBeCloseTo(-5, 9);
    expect(points[0]!.z).toBeCloseTo(0, 9);
    expect(points[1]!.s).toBeCloseTo(5, 9);
    expect(points[1]!.z).toBeCloseTo(2, 9);
  });

  it("touching the plane at a single vertex only produces no usable segment", () => {
    const plane = { originX: 5, originY: 0, directionRadians: Math.PI / 2 }; // x=5, touches b only
    expect(intersectTriangleWithPlane(flatTriangle, plane)).toBeNull();
  });
});

describe("orientedBoxTriangles + plane intersection", () => {
  it("a vertical plane through the centre of an axis-aligned box yields its exact rectangular cross-section", () => {
    const box = {
      centre: localCoordinate(0, 0, 5),
      halfExtents: { x: 2, y: 3, z: 1 },
      orientationRadians: 0,
    };
    const triangles = orientedBoxTriangles(box);
    // Transverse plane (x=0, s=y) through the box centre.
    const plane = { originX: 0, originY: 0, directionRadians: 0 };
    const segments = triangles
      .map((t) => intersectTriangleWithPlane(t, plane))
      .filter((s): s is NonNullable<typeof s> => s !== null);

    const allS = segments.flatMap((s) => [s.a.s, s.b.s]);
    const allZ = segments.flatMap((s) => [s.a.z, s.b.z]);
    expect(Math.min(...allS)).toBeCloseTo(-2, 9); // half-extent x
    expect(Math.max(...allS)).toBeCloseTo(2, 9);
    expect(Math.min(...allZ)).toBeCloseTo(4, 9); // centre z - half-extent z
    expect(Math.max(...allZ)).toBeCloseTo(6, 9);
  });
});

describe("trianglesFromIndexedSurface", () => {
  it("reconstructs the same triangle vertices from a flat terrain TIN", () => {
    const terrain = generateTin(loadTerrainFixturePoints("terrain-flat.json"), {
      maxEdgeLengthM: 8.0,
      terrainVersion: "flat-v1",
      generatedAtIso: NOW,
    });
    const triangles = trianglesFromIndexedSurface(terrain);
    expect(triangles.length).toBe(terrain.triangles.length);
    for (const t of triangles) {
      expect(t.a.z).toBe(0);
      expect(t.b.z).toBe(0);
      expect(t.c.z).toBe(0);
    }
  });
});

function foundation(overrides: Partial<FoundationInstance> = {}): FoundationInstance {
  return {
    instanceId: "foundation-1",
    poleModelId: "test",
    legId: "leg-a",
    anchorId: "anchor-a",
    foundationTypeId: "rectangular-pad-pedestal-v1",
    parameters: {
      geometryType: "rectangular-pad-pedestal",
      padWidth: 2.0,
      padLength: 2.0,
      padThickness: 0.5,
      pedestalWidth: 0.5,
      pedestalLength: 0.5,
      pedestalHeight: 0.8,
    },
    position: { x: 0, y: 0 },
    orientationRadians: 0,
    baseElevation: -2.0,
    visible: true,
    colour: "#8899aa",
    opacity: 1,
    provenance: PROVENANCE,
    ...overrides,
  };
}

function excavation(overrides: Partial<ExcavationInstance> = {}): ExcavationInstance {
  return {
    id: "excavation-1",
    foundationInstanceId: "foundation-1",
    bottomElevationM: -2.0,
    workingSpaceOffsetM: 0.5,
    sideSlope: { h: 1.5, v: 1 },
    colour: "#c9a227",
    opacity: 0.5,
    visible: true,
    wireframe: false,
    provenance: PROVENANCE,
    ...overrides,
  };
}

describe("excavationGeometryTriangles", () => {
  it("produces a bottom face at the excavation's bottom elevation", () => {
    const terrain = generateTin(loadTerrainFixturePoints("terrain-flat.json"), {
      maxEdgeLengthM: 8.0,
      terrainVersion: "flat-v1",
      generatedAtIso: NOW,
    });
    const geometry = generateExcavationGeometry(excavation(), foundation(), terrain);
    const triangles = excavationGeometryTriangles(geometry);
    // First two triangles are the bottom quad.
    expect(triangles[0]!.a.z).toBeCloseTo(-2.0, 9);
    expect(triangles[0]!.b.z).toBeCloseTo(-2.0, 9);
    expect(triangles[0]!.c.z).toBeCloseTo(-2.0, 9);
  });
});

describe("buildSectionPlane", () => {
  function minimalProject(): Project {
    const poleModelParsed = parsePoleModel(loadSyntheticFixtureJson("pole-lattice-4leg.json"));
    if (!poleModelParsed.success) throw new Error("fixture failed to parse");
    const poleModel = poleModelParsed.data;
    const foundationInstances = buildDefaultFoundationInstances(
      poleModel,
      requireFoundationTypeById("rectangular-pad-pedestal-v1"),
      NOW
    );
    return {
      schemaVersion: "0.1.0",
      appVersion: "0.1.0",
      projectId: "p",
      name: "p",
      createdAt: NOW,
      modifiedAt: NOW,
      crs: { kind: "epsg", epsgCode: 3057 },
      horizontalUnits: "m",
      verticalUnits: "m",
      elevationReferenceType: "unknown",
      mastCentreProject: { space: "project", easting: 0, northing: 0, elevation: 100 },
      lineBearingRadians: 0,
      renderOriginLocal: localCoordinate(0, 0, 0),
      poleModel,
      foundationInstances,
      excavationInstances: [],
      geotechLayers: [],
      groundwater: null,
      pointCloudSource: null,
      terrainGenerationSettings: DEFAULT_TERRAIN_GENERATION_SETTINGS,
      terrainSurface: null,
      layerStyles: {
        pole: { visible: true, opacity: 1 },
        foundations: { visible: true, opacity: 1 },
        terrain: { visible: true, opacity: 1, showPoints: false, wireframe: false },
      },
      sections: [],
      measurements: [],
      geometryVersion: 1,
    };
  }

  it("longitudinal runs along local +Y and passes through the mast centre", () => {
    const plane = buildSectionPlane(minimalProject(), "longitudinal", null);
    expect(plane.originX).toBe(0);
    expect(plane.originY).toBe(0);
    expect(plane.directionRadians).toBeCloseTo(Math.PI / 2, 9);
  });

  it("transverse runs along local +X and passes through the mast centre", () => {
    const plane = buildSectionPlane(minimalProject(), "transverse", null);
    expect(plane.directionRadians).toBeCloseTo(0, 9);
  });

  it("leg mode points toward the selected leg's foundation position from the mast centre", () => {
    const project = minimalProject();
    const legFoundation = project.foundationInstances[0]!;
    const plane = buildSectionPlane(project, "leg", legFoundation.legId);
    const expectedAngle = Math.atan2(legFoundation.position.y, legFoundation.position.x);
    expect(plane.directionRadians).toBeCloseTo(expectedAngle, 9);
  });
});

describe("generateSectionResult", () => {
  function projectWithFoundationAtOrigin(): Project {
    const poleModelParsed = parsePoleModel(loadSyntheticFixtureJson("pole-lattice-4leg.json"));
    if (!poleModelParsed.success) throw new Error("fixture failed to parse");
    const poleModel = poleModelParsed.data;
    const terrain = generateTin(loadTerrainFixturePoints("terrain-flat.json"), {
      maxEdgeLengthM: 8.0,
      terrainVersion: "flat-v1",
      generatedAtIso: NOW,
    });
    const foundationInstances = [foundation({ position: { x: 0, y: 0 }, baseElevation: -1 })];

    return {
      schemaVersion: "0.1.0",
      appVersion: "0.1.0",
      projectId: "p",
      name: "p",
      createdAt: NOW,
      modifiedAt: NOW,
      crs: { kind: "epsg", epsgCode: 3057 },
      horizontalUnits: "m",
      verticalUnits: "m",
      elevationReferenceType: "unknown",
      mastCentreProject: { space: "project", easting: 0, northing: 0, elevation: 100 },
      lineBearingRadians: 0,
      renderOriginLocal: localCoordinate(0, 0, 0),
      poleModel,
      foundationInstances,
      excavationInstances: [],
      geotechLayers: [],
      groundwater: null,
      pointCloudSource: null,
      terrainGenerationSettings: DEFAULT_TERRAIN_GENERATION_SETTINGS,
      terrainSurface: terrain,
      layerStyles: {
        pole: { visible: true, opacity: 1 },
        foundations: { visible: true, opacity: 1 },
        terrain: { visible: true, opacity: 1, showPoints: false, wireframe: false },
      },
      sections: [],
      measurements: [],
      geometryVersion: 1,
    };
  }

  it("a transverse section through the origin includes the flat terrain at z=0 and the foundation's own outline", () => {
    const project = projectWithFoundationAtOrigin();
    const section: SectionDefinition = {
      id: "s1",
      name: "Transverse",
      mode: "transverse",
      legId: null,
      plane: { originX: 0, originY: 0, directionRadians: 0 },
      pointToleranceM: 1,
      visible: true,
    };
    const result = generateSectionResult(project, section);

    expect(result.terrainSegments.length).toBeGreaterThan(0);
    for (const seg of result.terrainSegments) {
      expect(seg.a.z).toBeCloseTo(0, 9);
      expect(seg.b.z).toBeCloseTo(0, 9);
    }

    expect(result.foundations).toHaveLength(1);
    expect(result.foundations[0]!.segments.length).toBeGreaterThan(0);
  });

  it("a plane far from every object produces empty content", () => {
    const project = projectWithFoundationAtOrigin();
    const section: SectionDefinition = {
      id: "s2",
      name: "Far away",
      mode: "custom",
      legId: null,
      // direction=0 means the plane's normal points along Y (a "transverse"
      // orientation cuts at a fixed Y regardless of X) -- so only originY,
      // not originX, moves this particular plane away from the content.
      plane: { originX: 0, originY: 1000, directionRadians: 0 },
      pointToleranceM: 1,
      visible: true,
    };
    const result = generateSectionResult(project, section);
    expect(result.terrainSegments).toHaveLength(0);
    expect(result.foundations[0]!.segments).toHaveLength(0);
  });

  it("terrain source points are only included within the point tolerance", () => {
    const project = projectWithFoundationAtOrigin();
    const narrowSection: SectionDefinition = {
      id: "s3",
      name: "Narrow",
      mode: "transverse",
      legId: null,
      plane: { originX: 0, originY: 0, directionRadians: 0 },
      pointToleranceM: 0.01,
      visible: true,
    };
    const wideSection: SectionDefinition = { ...narrowSection, id: "s4", pointToleranceM: 100 };

    const narrowResult = generateSectionResult(project, narrowSection);
    const wideResult = generateSectionResult(project, wideSection);
    expect(wideResult.terrainSourcePoints.length).toBeGreaterThan(narrowResult.terrainSourcePoints.length);
  });
});

describe("consistency with the main viewer's foundation geometry", () => {
  it("the box triangulation used for sections matches generateFoundationGeometry's own parts (no independent illustrative section)", () => {
    const f = foundation();
    const geometry = generateFoundationGeometry(f);
    // Sanity: the triangulated box for the bottom-most part spans exactly its declared half-extents.
    const triangles = orientedBoxTriangles(geometry.parts[0]!);
    const xs = triangles.flatMap((t) => [t.a.x, t.b.x, t.c.x]);
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(geometry.parts[0]!.halfExtents.x * 2, 9);
  });
});
