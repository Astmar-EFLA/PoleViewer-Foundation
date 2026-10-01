import * as THREE from "three";
import { beforeAll, describe, expect, it } from "vitest";
import { localCoordinate } from "../domain/coordinates";
import type { Project } from "../domain/project";
import { buildSyntheticDemoProject } from "./buildSyntheticDemoProject";
import { buildGlbScene, buildProjectGlb } from "./glbExport";

// GLTFExporter's binary path reads its Blob back with FileReader, which
// Node does not have -- a minimal stand-in built on Blob.arrayBuffer().
beforeAll(() => {
  if (typeof globalThis.FileReader !== "undefined") return;
  class NodeFileReader {
    result: ArrayBuffer | string | null = null;
    onloadend: (() => void) | null = null;
    readAsArrayBuffer(blob: Blob) {
      void blob.arrayBuffer().then((buffer) => {
        this.result = buffer;
        this.onloadend?.();
      });
    }
    readAsDataURL(blob: Blob) {
      void blob.arrayBuffer().then((buffer) => {
        this.result = `data:${blob.type};base64,${Buffer.from(buffer).toString("base64")}`;
        this.onloadend?.();
      });
    }
  }
  (globalThis as unknown as { FileReader: unknown }).FileReader = NodeFileReader;
});

function demoWithMembers(): Project {
  const demo = buildSyntheticDemoProject();
  return {
    ...demo,
    poleModel: {
      ...demo.poleModel,
      visualGeometry: {
        members: [
          { a: localCoordinate(0, 0, 0), b: localCoordinate(0, 0, 20), category: "structure", component: "leg" },
          { a: localCoordinate(0, 0, 20), b: localCoordinate(10, 0, 0), category: "cable", component: "guy" },
        ],
        source: demo.poleModel.source,
      },
    },
  };
}

function child(object: THREE.Object3D, name: string): THREE.Object3D {
  const found = object.children.find((c) => c.name === name);
  if (!found) throw new Error(`No "${name}" under "${object.name}" (has: ${object.children.map((c) => c.name).join(", ")})`);
  return found;
}

describe("buildGlbScene", () => {
  it("has one named node per kind and per instance", () => {
    const project = demoWithMembers();
    const scene = buildGlbScene(project);

    expect(scene.children.map((c) => c.name)).toEqual([
      "Mast",
      "Foundations",
      "Excavations",
      "Gravel pads",
      "Fills",
      "Ground",
    ]);
    expect(child(scene, "Mast").children.map((c) => c.name)).toEqual(["Mast structure", "Guys and conductors"]);
    expect(child(scene, "Foundations").children.map((c) => c.name)).toEqual(
      project.foundationInstances.map((f) => f.displayLabel)
    );
    expect(child(scene, "Excavations").children).toHaveLength(project.excavationInstances.length);
    expect(child(scene, "Gravel pads").children).toHaveLength(project.fillInstances.length);
    expect(child(scene, "Fills").children).toHaveLength(project.upliftFillInstances.length);

    const ground = child(scene, "Ground");
    expect(ground.children.map((c) => c.name)).toEqual([
      "Terrain",
      ...project.geotechLayers.map((l) => `Layer ${l.name}`),
      "Groundwater",
    ]);
  });

  it("writes the terrain in the local frame, mast centre at the origin, Y up", () => {
    const project = demoWithMembers();
    const terrain = child(child(buildGlbScene(project), "Ground"), "Terrain") as THREE.Mesh;
    const positions = terrain.geometry.getAttribute("position");
    const surface = project.terrainSurface!;

    expect(positions.count).toBe(surface.points.length);
    const p = surface.points[0]!;
    // Local X -> glTF X, local Z (up) -> glTF Y, local Y (along the line) -> glTF -Z.
    expect(positions.getX(0)).toBeCloseTo(p.x, 4);
    expect(positions.getY(0)).toBeCloseTo(p.z, 4);
    expect(positions.getZ(0)).toBeCloseTo(-p.y, 4);
  });

  it("carries the project position, CRS and axes in the scene extras", () => {
    const project = demoWithMembers();
    const extras = buildGlbScene(project).userData.poleViewer as Record<string, unknown>;

    expect(extras.mastCentreProject).toEqual({
      easting: project.mastCentreProject.easting,
      northing: project.mastCentreProject.northing,
      elevation: project.mastCentreProject.elevation,
    });
    expect(extras.crs).toBe(project.crs.kind === "epsg" ? `EPSG:${project.crs.epsgCode}` : project.crs.kind);
    expect(extras.lineBearingDegrees).toBeCloseTo((project.lineBearingRadians * 180) / Math.PI, 9);
  });

  it("leaves out what needs terrain when there is none, but keeps the mast and foundations", () => {
    const scene = buildGlbScene({ ...demoWithMembers(), terrainSurface: null });
    expect(scene.children.map((c) => c.name)).toEqual(["Mast", "Foundations", "Gravel pads"]);
  });
});

describe("buildProjectGlb", () => {
  it("produces a binary glTF 2.0 file whose JSON names the nodes and keeps the extras", async () => {
    const glb = await buildProjectGlb(demoWithMembers());
    const view = new DataView(glb);

    expect(new TextDecoder().decode(new Uint8Array(glb, 0, 4))).toBe("glTF");
    expect(view.getUint32(4, true)).toBe(2);
    expect(view.getUint32(8, true)).toBe(glb.byteLength);

    const jsonLength = view.getUint32(12, true);
    const json = JSON.parse(new TextDecoder().decode(new Uint8Array(glb, 20, jsonLength))) as {
      nodes: { name?: string }[];
      scenes: { extras?: { poleViewer?: unknown } }[];
    };
    const names = json.nodes.map((n) => n.name);
    expect(names).toContain("Terrain");
    expect(names).toContain("Guys and conductors");
    expect(json.scenes[0]!.extras?.poleViewer).toBeDefined();
  });
});
