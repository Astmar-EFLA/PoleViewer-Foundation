import type { CoordinateReferenceSystem } from "./coordinates";

/**
 * A registered point-cloud source file. `filePath` is workspace-relative,
 * matching the backend's workspace-root security model (never an absolute
 * path -- see backend/app/services/workspace.py).
 */
export interface PointCloudSourceReference {
  readonly filePath: string;
  readonly crs: CoordinateReferenceSystem;
  /**
   * SHA-256 of the file's content the last time it was registered or
   * confirmed, so a moved/edited/missing source file can be detected on
   * load (ADR-008) rather than silently re-linked. Null until the backend
   * has computed it at least once (e.g. a project authored before this
   * field existed, or before the backend has ever been reached).
   */
  readonly contentHash: string | null;
}

export interface RectangularClipBoundarySettings {
  readonly widthM: number;
  readonly lengthM: number;
  readonly centerOffsetLocal: { readonly x: number; readonly y: number };
  readonly rotationRadians: number;
}

export const DEFAULT_CLIP_BOUNDARY: RectangularClipBoundarySettings = {
  widthM: 40,
  lengthM: 40,
  centerOffsetLocal: { x: 0, y: 0 },
  rotationRadians: 0,
};

/**
 * Calculation parameters for terrain generation, persisted with the project
 * (principle: store all assumptions and calculation parameters with the
 * project) so "how was this terrain produced" is always reconstructable,
 * not just the resulting mesh.
 */
export interface TerrainGenerationSettings {
  readonly maxEdgeLengthM: number;
  /** null = no classification filter (all points); ground (2) is the sensible default once a file is registered. */
  readonly classificationFilter: readonly number[] | null;
  readonly decimationStep: number | null;
  readonly clipBoundary: RectangularClipBoundarySettings;
}

export const DEFAULT_TERRAIN_GENERATION_SETTINGS: TerrainGenerationSettings = {
  maxEdgeLengthM: 8.0,
  classificationFilter: [2],
  decimationStep: null,
  clipBoundary: DEFAULT_CLIP_BOUNDARY,
};

export interface ProcessingWarning {
  readonly code: string;
  readonly severity: "information" | "warning" | "blocking";
  readonly message: string;
}

export interface ClassificationCount {
  readonly classificationCode: number;
  readonly pointCount: number;
}
