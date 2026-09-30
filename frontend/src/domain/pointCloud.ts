import type { CoordinateReferenceSystem } from "./coordinates";

/** What a terrain source file is: a LAS/LAZ point cloud, or a DEM elevation raster (GeoTIFF). */
export type TerrainSourceKind = "point-cloud" | "dem";

/** What a DEM's values are: height above sea level, or above the ellipsoid (e.g. ArcticDEM) -- which needs the geoid height N. */
export type DemHeightReference = "orthometric" | "ellipsoidal";

/** A DEM is recognised by its file extension; everything else is treated as a point cloud (the backend checks the extension either way). */
export function terrainSourceKindForPath(filePath: string): TerrainSourceKind {
  return /\.tiff?$/i.test(filePath) ? "dem" : "point-cloud";
}

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
  /** Absent in projects saved before DEM support: a point cloud. */
  readonly kind?: TerrainSourceKind;
  /** DEM only. Absent: orthometric. */
  readonly heightReference?: DemHeightReference;
  /** DEM only: geoid height N at the site, m, subtracted from ellipsoidal heights (H = h - N). */
  readonly geoidHeightM?: number;
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
