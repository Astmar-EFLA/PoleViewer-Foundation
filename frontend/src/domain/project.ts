import type { CoordinateReferenceSystem, LocalCoordinate, ProjectCoordinate } from "./coordinates";
import type { FoundationInstance } from "./foundation";
import type { PoleModel } from "./poleModel";
import type { TerrainSurface } from "./terrain";

/**
 * Phase-1 vertical-slice subset of the full project schema (spec section
 * 19). Fields not yet needed to prove the coordinate chain, anchors,
 * foundations and terrain (point-cloud/clip settings, geotechnical layers,
 * excavation, sections, measurements, validation-results-as-saved-state)
 * are deliberately omitted here rather than stubbed -- they are added in
 * the phases that actually implement them, per "don't design for
 * hypothetical future requirements."
 */
export interface LayerStyle {
  readonly visible: boolean;
  readonly opacity: number;
}

export interface ProjectLayerStyles {
  readonly pole: LayerStyle;
  readonly foundations: LayerStyle;
  readonly terrain: LayerStyle;
}

export interface Project {
  readonly schemaVersion: string;
  readonly appVersion: string;
  readonly projectId: string;
  readonly name: string;
  /** ISO 8601 */
  readonly createdAt: string;
  /** ISO 8601 */
  readonly modifiedAt: string;
  readonly crs: CoordinateReferenceSystem;
  readonly horizontalUnits: "m" | "ft" | "us-ft";
  readonly verticalUnits: "m" | "ft" | "us-ft";
  readonly elevationReferenceType: "orthometric" | "ellipsoidal" | "project" | "unknown";
  readonly mastCentreProject: ProjectCoordinate;
  readonly lineBearingRadians: number;
  readonly renderOriginLocal: LocalCoordinate;
  readonly poleModel: PoleModel;
  readonly foundationInstances: readonly FoundationInstance[];
  readonly terrainSurface: TerrainSurface | null;
  readonly layerStyles: ProjectLayerStyles;
}
