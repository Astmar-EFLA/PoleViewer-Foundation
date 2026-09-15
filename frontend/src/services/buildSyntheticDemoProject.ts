/**
 * Builds the Phase-1 vertical-slice demo project from synthetic fixtures.
 * This is dev-scaffolding for proving the coordinate/anchor/foundation/
 * terrain chain end to end in the viewer -- it is not an import workflow.
 * Real project creation and LAS/LAZ-backed terrain generation are Phase 2/3
 * work; nothing here should be mistaken for that.
 */

import poleLattice4LegJson from "../../../fixtures/synthetic/pole-lattice-4leg.json";
import terrainSlopeJson from "../../../fixtures/synthetic/terrain-slope.json";
import { localCoordinate, projectCoordinate } from "../domain/coordinates";
import type { RectangularPadPedestalParameters } from "../domain/foundation";
import type { Project } from "../domain/project";
import type { TerrainPoint } from "../domain/terrain";
import { degreesToRadians } from "../geometry/angles";
import { generateTin } from "../geometry/terrain";
import { buildDefaultFoundationInstances } from "./buildFoundationInstances";
import { parsePoleModel } from "../validation/poleModelSchema";

const DEFAULT_FOUNDATION_PARAMETERS: RectangularPadPedestalParameters = {
  padWidth: 1.8,
  padLength: 1.8,
  padThickness: 0.5,
  pedestalWidth: 0.5,
  pedestalLength: 0.5,
  pedestalHeight: 0.8,
};

export function buildSyntheticDemoProject(): Project {
  const nowIso = new Date().toISOString();

  const poleModelParsed = parsePoleModel(poleLattice4LegJson);
  if (!poleModelParsed.success) {
    throw new Error(
      `Synthetic pole model fixture failed validation: ${poleModelParsed.errors.join("; ")}`
    );
  }
  const poleModel = poleModelParsed.data;

  const terrainPoints = (terrainSlopeJson as { points: TerrainPoint[] }).points;
  const terrainSurface = generateTin(terrainPoints, {
    maxEdgeLengthM: 8.0,
    terrainVersion: "synthetic-demo-v1",
    generatedAtIso: nowIso,
  });

  const foundationInstances = buildDefaultFoundationInstances(
    poleModel,
    DEFAULT_FOUNDATION_PARAMETERS,
    nowIso
  );

  return {
    schemaVersion: "0.1.0",
    appVersion: "0.1.0",
    projectId: "synthetic-demo-project",
    name: "Synthetic Phase 1 demo project",
    createdAt: nowIso,
    modifiedAt: nowIso,
    // ISN93 (EPSG:3057) at a realistic magnitude -- see ADR-004. This is an
    // example project centre, not a real site; the CRS is stated explicitly
    // per file, never silently assumed.
    crs: { kind: "epsg", epsgCode: 3057 },
    horizontalUnits: "m",
    verticalUnits: "m",
    elevationReferenceType: "unknown",
    mastCentreProject: projectCoordinate(512_345.678, 487_654.321, 123.456),
    lineBearingRadians: degreesToRadians(64),
    renderOriginLocal: localCoordinate(0, 0, 0),
    poleModel,
    foundationInstances,
    terrainSurface,
    layerStyles: {
      pole: { visible: true, opacity: 1 },
      foundations: { visible: true, opacity: 1 },
      terrain: { visible: true, opacity: 0.85 },
    },
  };
}
