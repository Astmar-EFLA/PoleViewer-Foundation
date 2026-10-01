import * as THREE from "three";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";
import { localCoordinate, type ViewerFrameDefinition } from "../domain/coordinates";
import type { Project } from "../domain/project";
import { POLE_MEMBER_COLOURS, type PoleMemberCategory } from "../domain/poleModel";
import { localToViewer } from "../geometry/coordinateTransform";
import { generateExcavationGeometry } from "../geometry/excavationGeometry";
import { generateFillGeometry } from "../geometry/fillGeometry";
import { generateFoundationGeometry } from "../geometry/foundationGeometry";
import { generateBoundarySurface } from "../geometry/geotechBoundary";
import { excavationForPad, generateGravelPadBox } from "../geometry/gravelPadGeometry";
import {
  buildFrustum,
  buildPoleMemberLines,
  buildQuad,
  buildRingSkirt,
  buildTriangulatedSurface,
} from "../rendering/meshGeometry";
import { domainZRotationToThreeYRotation, toThreeArrayXYZ } from "../rendering/threeAdapters";
import { downloadBlob } from "./browserDownload";

/**
 * The GLB is written in the local engineering frame with the mast centre at
 * the origin, not in project coordinates: glTF stores float32 positions,
 * which cannot hold an easting/northing of ~7 000 000 m to better than a
 * few decimetres. The project position needed to place the model is
 * carried in the scene's extras instead (see glbFrameExtras).
 */
const EXPORT_FRAME: ViewerFrameDefinition = { renderOriginLocal: localCoordinate(0, 0, 0) };

const MEMBER_NODE_NAMES: Record<PoleMemberCategory, string> = {
  structure: "Mast structure",
  cable: "Guys and conductors",
  insulator: "Insulators",
};

function surfaceMaterial(colour: string, opacity: number): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color: colour,
    opacity,
    transparent: opacity < 0.999,
    side: THREE.DoubleSide,
  });
}

function group(name: string, children: THREE.Object3D[]): THREE.Group {
  const g = new THREE.Group();
  g.name = name;
  for (const child of children) g.add(child);
  return g;
}

function mesh(name: string, geometry: THREE.BufferGeometry, material: THREE.Material): THREE.Mesh {
  const m = new THREE.Mesh(geometry, material);
  m.name = name;
  return m;
}

function buildMast(project: Project): THREE.Object3D[] {
  const members = project.poleModel.visualGeometry?.members ?? [];
  return (Object.keys(MEMBER_NODE_NAMES) as PoleMemberCategory[])
    .filter((category) => members.some((m) => m.category === category))
    .map((category) => {
      const lines = new THREE.LineSegments(
        buildPoleMemberLines(members, category, project.poleModel, EXPORT_FRAME),
        new THREE.MeshBasicMaterial({ color: POLE_MEMBER_COLOURS[category] })
      );
      lines.name = MEMBER_NODE_NAMES[category];
      return lines;
    });
}

function buildFoundations(project: Project): THREE.Object3D[] {
  return project.foundationInstances.map((instance) => {
    const material = surfaceMaterial(instance.colour, instance.opacity);
    const rotationY = domainZRotationToThreeYRotation(instance.orientationRadians);
    const parts = generateFoundationGeometry(instance).parts.map((part, index) => {
      const geometry =
        part.kind === "box"
          ? new THREE.BoxGeometry(part.halfExtents.x * 2, part.halfExtents.z * 2, part.halfExtents.y * 2)
          : buildFrustum(part);
      const m = mesh(`${instance.displayLabel} part ${index + 1}`, geometry, material);
      m.position.set(...toThreeArrayXYZ(localToViewer(part.centre, EXPORT_FRAME)));
      m.rotation.set(0, rotationY, 0);
      return m;
    });
    return group(instance.displayLabel, parts);
  });
}

function buildExcavations(project: Project): THREE.Object3D[] {
  const terrain = project.terrainSurface;
  if (!terrain) return [];
  return project.excavationInstances.flatMap((excavation) => {
    const foundation = project.foundationInstances.find((f) => f.instanceId === excavation.foundationInstanceId);
    if (!foundation) return [];
    const geometry = generateExcavationGeometry(excavation, foundation, terrain);
    const material = surfaceMaterial(excavation.colour, excavation.opacity);
    return [
      group(`Excavation ${foundation.displayLabel}`, [
        mesh("Bottom", buildQuad(geometry.bottomCorners, EXPORT_FRAME), material),
        mesh("Sides", buildRingSkirt(geometry.bottomRing, geometry.topRing.map((p) => p.point), EXPORT_FRAME), material),
      ]),
    ];
  });
}

function buildGravelPads(project: Project): THREE.Object3D[] {
  return project.fillInstances.flatMap((pad) => {
    const foundation = project.foundationInstances.find((f) => f.instanceId === pad.foundationInstanceId);
    if (!foundation) return [];
    const box = generateGravelPadBox(pad, foundation, excavationForPad(pad, project.excavationInstances));
    const m = mesh(
      `Gravel pad ${foundation.displayLabel}`,
      new THREE.BoxGeometry(box.halfExtents.x * 2, box.halfExtents.z * 2, box.halfExtents.y * 2),
      surfaceMaterial(pad.colour, pad.opacity)
    );
    m.position.set(...toThreeArrayXYZ(localToViewer(box.centre, EXPORT_FRAME)));
    m.rotation.set(0, domainZRotationToThreeYRotation(box.orientationRadians), 0);
    return [m];
  });
}

function buildFills(project: Project): THREE.Object3D[] {
  const terrain = project.terrainSurface;
  if (!terrain) return [];
  return project.upliftFillInstances.flatMap((fill) => {
    const foundation = project.foundationInstances.find((f) => f.instanceId === fill.foundationInstanceId);
    if (!foundation) return [];
    const geometry = generateFillGeometry(fill, foundation, terrain);
    const material = surfaceMaterial(fill.colour, fill.opacity);
    return [
      group(`Fill ${foundation.displayLabel}`, [
        mesh("Top", buildQuad(geometry.topCorners, EXPORT_FRAME), material),
        mesh("Sides", buildRingSkirt(geometry.topRing, geometry.bottomRing.map((p) => p.point), EXPORT_FRAME), material),
      ]),
    ];
  });
}

function buildGround(project: Project): THREE.Object3D[] {
  const terrain = project.terrainSurface;
  if (!terrain) return [];
  const elevation = project.mastCentreProject.elevation;
  const boundary = (name: string, surface: ReturnType<typeof generateBoundarySurface>, colour: string, opacity: number) =>
    mesh(name, buildTriangulatedSurface(surface.points, surface.triangles, EXPORT_FRAME), surfaceMaterial(colour, opacity));

  const objects: THREE.Object3D[] = [
    mesh(
      "Terrain",
      buildTriangulatedSurface(terrain.points, terrain.triangles, EXPORT_FRAME),
      surfaceMaterial("#8a9a7b", 1)
    ),
  ];
  for (const layer of project.geotechLayers) {
    objects.push(
      group(`Layer ${layer.name}`, [
        boundary("Top", generateBoundarySurface(layer.topBoundary, terrain, elevation), layer.colour, layer.opacity),
        boundary("Bottom", generateBoundarySurface(layer.bottomBoundary, terrain, elevation), layer.colour, layer.opacity),
      ])
    );
  }
  if (project.groundwater) {
    const gw = project.groundwater;
    objects.push(boundary("Groundwater", generateBoundarySurface(gw.boundary, terrain, elevation), gw.colour, gw.opacity));
  }
  return objects;
}

/** How to place the local-frame model in the world -- written to the GLB scene's extras. */
export function glbFrameExtras(project: Project): Record<string, unknown> {
  return {
    poleViewer: {
      coordinateFrame: "local, mast centre at the origin, metres",
      axes:
        "glTF +X = transverse (local X), glTF +Y = up, glTF -Z = along the line (local Y, the line bearing)",
      crs: project.crs.kind === "epsg" ? `EPSG:${project.crs.epsgCode}` : project.crs.kind,
      mastCentreProject: {
        easting: project.mastCentreProject.easting,
        northing: project.mastCentreProject.northing,
        elevation: project.mastCentreProject.elevation,
      },
      elevationReference: project.elevationReferenceType,
      lineBearingDegrees: (project.lineBearingRadians * 180) / Math.PI,
      terrainSource: project.terrainSurface?.source ?? null,
    },
  };
}

/**
 * The whole model as a Three.js scene: one top-level node per kind
 * (mast, foundations, excavations, gravel pads, fills, ground), each
 * instance its own named child, so the GLB opens as a navigable tree in
 * Blender, a BIM viewer or a web viewer. Everything is included whatever
 * its on-screen visibility -- an export is the model, not the current view.
 */
export function buildGlbScene(project: Project): THREE.Scene {
  const scene = new THREE.Scene();
  scene.name = project.name;
  scene.userData = glbFrameExtras(project);
  const sections: [string, THREE.Object3D[]][] = [
    ["Mast", buildMast(project)],
    ["Foundations", buildFoundations(project)],
    ["Excavations", buildExcavations(project)],
    ["Gravel pads", buildGravelPads(project)],
    ["Fills", buildFills(project)],
    ["Ground", buildGround(project)],
  ];
  for (const [name, children] of sections) {
    if (children.length > 0) scene.add(group(name, children));
  }
  return scene;
}

function disposeScene(scene: THREE.Scene): void {
  scene.traverse((object) => {
    if (object instanceof THREE.Mesh || object instanceof THREE.LineSegments) {
      object.geometry.dispose();
      (object.material as THREE.Material).dispose();
    }
  });
}

export async function buildProjectGlb(project: Project): Promise<ArrayBuffer> {
  const scene = buildGlbScene(project);
  try {
    const result = await new GLTFExporter().parseAsync(scene, { binary: true, onlyVisible: false });
    if (!(result instanceof ArrayBuffer)) throw new Error("The GLB exporter did not return binary data.");
    return result;
  } finally {
    disposeScene(scene);
  }
}

export async function exportProjectAsGlb(project: Project, fileBaseName: string): Promise<void> {
  const glb = await buildProjectGlb(project);
  downloadBlob(new Blob([glb], { type: "model/gltf-binary" }), `${fileBaseName}.glb`);
}
