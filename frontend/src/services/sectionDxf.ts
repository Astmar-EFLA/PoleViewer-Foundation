/**
 * Writes a computed section (geometry/section.ts's SectionResult) as a 2D
 * DXF drawing: X = offset along the section from the mast centre (m),
 * Y = absolute elevation (m a.s.l., local z + the mast centre's project
 * elevation -- the same axis SectionView.tsx labels). Built from
 * SectionResult directly rather than the on-screen SVG, so it works for
 * a section that was never rendered (batch export).
 *
 * The tower itself (poleModel.visualGeometry members) is projected onto the
 * plane rather than cut, so the drawing shows the whole structure standing
 * on its foundations.
 *
 * Every intersection segment is written as its own LINE: SectionResult
 * segments are unordered triangle/plane cuts, so writing them 1:1 is exact
 * and needs no polyline-chaining heuristics -- CAD draws abutting LINEs
 * identically to a joined polyline.
 */

import type { Project } from "../domain/project";
import type { SectionDefinition } from "../domain/section";
import type { SectionResult, SectionSegment } from "../geometry/section";
import { generateSectionResult } from "../geometry/section";
import { downloadText } from "./browserDownload";
import { createDxfDocument } from "./dxfWriter";

export interface SectionDxfOptions {
  /** Added to every local z to give absolute elevation -- pass project.mastCentreProject.elevation. */
  readonly elevationOffsetM: number;
  /** Written as a text label above the drawing, e.g. "<mast name> - Transverse (through mast centre)". */
  readonly title: string;
}

const ANCHOR_TEXT_HEIGHT_M = 0.2;
const TITLE_TEXT_HEIGHT_M = 0.4;

// AutoCAD Colour Index values.
const ACI = { red: 1, yellow: 2, green: 3, cyan: 4, blue: 5, magenta: 6, white: 7, grey: 8, lightGrey: 9, orange: 30, brown: 34, olive: 52, darkGreen: 84 };

export function buildSectionDxf(result: SectionResult, options: SectionDxfOptions): string {
  const doc = createDxfDocument();
  const y = (z: number) => z + options.elevationOffsetM;

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  const writeSegments = (layer: string, segments: readonly SectionSegment[]) => {
    for (const seg of segments) {
      doc.line(layer, seg.a.s, y(seg.a.z), seg.b.s, y(seg.b.z));
      minX = Math.min(minX, seg.a.s, seg.b.s);
      maxX = Math.max(maxX, seg.a.s, seg.b.s);
      minY = Math.min(minY, y(seg.a.z), y(seg.b.z));
      maxY = Math.max(maxY, y(seg.a.z), y(seg.b.z));
    }
  };

  writeSegments(doc.addLayer("TERRAIN", ACI.brown), result.terrainSegments);

  // Foundations the plane misses (e.g. guy-anchor blocks off a transverse
  // section) come through as projected silhouettes -- dashed, on their own
  // layer, so they read as "beyond the cut" rather than cut section.
  for (const f of result.foundations) {
    const layer = f.projected
      ? doc.addLayer("FOUNDATION-PROJECTED", ACI.grey, "DASHED")
      : doc.addLayer("FOUNDATION", ACI.grey);
    writeSegments(layer, f.segments);
  }

  // Projected (off-plane) excavations, e.g. guy-anchor pits, get their own
  // dashed layers the same way projected foundations do.
  for (const e of result.excavations) {
    const suffix = e.projected ? "-PROJECTED" : "";
    const linetype = e.projected ? "DASHED" : "CONTINUOUS";
    const layer = e.truncated
      ? doc.addLayer(`EXCAVATION-TRUNCATED${suffix}`, ACI.red, linetype)
      : doc.addLayer(`EXCAVATION${suffix}`, ACI.orange, linetype);
    writeSegments(layer, e.segments);
  }

  for (const [baseName, outlines, colour] of [
    ["FILL", result.fillOutlines, ACI.green],
    ["UPLIFT-FILL", result.upliftFillOutlines, ACI.olive],
  ] as const) {
    for (const f of outlines) {
      const suffix = f.projected ? "-PROJECTED" : "";
      const layer = f.truncated
        ? doc.addLayer(`${baseName}-TRUNCATED${suffix}`, ACI.red, "DASHED")
        : doc.addLayer(`${baseName}${suffix}`, colour, "DASHED");
      writeSegments(layer, f.segments);
    }
  }

  for (const b of result.geotechBoundaries) {
    const layerName = `GEOTECH-${b.name.replace(/ \((top|bottom)\)$/, "")}`;
    writeSegments(doc.addLayer(layerName, ACI.lightGrey, "DASHED"), b.segments);
  }

  if (result.groundwater) {
    writeSegments(doc.addLayer("GROUNDWATER", ACI.blue, "DASHED"), result.groundwater.segments);
  }

  // The whole tower projected onto the section plane (an elevation view), one
  // layer per member category so cables/insulators can be switched off in CAD.
  for (const [category, layerName, colour] of [
    ["structure", "TOWER", ACI.blue],
    ["insulator", "TOWER-INSULATOR", ACI.darkGreen],
    ["cable", "TOWER-CABLE", ACI.red],
  ] as const) {
    const members = result.poleMembers.filter((m) => m.category === category);
    if (members.length > 0) writeSegments(doc.addLayer(layerName, colour), members);
  }

  const anchorLayer = doc.addLayer("ANCHORS", ACI.magenta);
  for (const anchor of result.anchors) {
    doc.point(anchorLayer, anchor.s, y(anchor.z));
    doc.text(anchorLayer, anchor.s + 0.15, y(anchor.z) + 0.1, ANCHOR_TEXT_HEIGHT_M, anchor.name);
    minX = Math.min(minX, anchor.s);
    maxX = Math.max(maxX, anchor.s);
    minY = Math.min(minY, y(anchor.z));
    maxY = Math.max(maxY, y(anchor.z));
  }

  if (Number.isFinite(minY)) {
    doc.line(doc.addLayer("MAST-CENTRE", ACI.cyan, "DASHED"), 0, minY, 0, maxY);
    doc.text(doc.addLayer("ANNOTATION", ACI.white), minX, maxY + 1, TITLE_TEXT_HEIGHT_M, options.title);
  } else {
    doc.text(doc.addLayer("ANNOTATION", ACI.white), 0, options.elevationOffsetM, TITLE_TEXT_HEIGHT_M, options.title);
  }

  return doc.toString();
}

/** Computes `section` for `project` and downloads it as `<fileBaseName>.dxf`; `label` (default: fileBaseName) prefixes the section name in the drawing's title. */
export function exportSectionAsDxf(
  project: Project,
  section: SectionDefinition,
  fileBaseName: string,
  label: string = fileBaseName
): void {
  const result = generateSectionResult(project, section);
  const dxf = buildSectionDxf(result, {
    elevationOffsetM: project.mastCentreProject.elevation,
    title: `${label} - ${section.name}`,
  });
  downloadText(dxf, `${fileBaseName}.dxf`, "application/dxf");
}
