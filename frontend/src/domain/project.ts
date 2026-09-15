import type { CoordinateReferenceSystem, LocalCoordinate, ProjectCoordinate } from "./coordinates";
import type { FoundationInstance } from "./foundation";
import type { PoleModel } from "./poleModel";
import type { PointCloudSourceReference, TerrainGenerationSettings } from "./pointCloud";
import type { TerrainSurface } from "./terrain";

/**
 * Phase 1-3 subset of the full project schema (spec section 19). Fields
 * not yet needed (geotechnical layers, excavation, sections, measurements,
 * validation-results-as-saved-state) are deliberately omitted here rather
 * than stubbed -- they are added in the phases that actually implement
 * them, per "don't design for hypothetical future requirements."
 */
export interface LayerStyle {
  readonly visible: boolean;
  readonly opacity: number;
}

export interface TerrainLayerStyle extends LayerStyle {
  /** "visible" above means "show the TIN surface"; this is the independent points-cloud toggle, so points-only / surface-only / both / wireframe are all just combinations of these two plus `wireframe`. */
  readonly showPoints: boolean;
  readonly wireframe: boolean;
}

export interface ProjectLayerStyles {
  readonly pole: LayerStyle;
  readonly foundations: LayerStyle;
  readonly terrain: TerrainLayerStyle;
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
  readonly pointCloudSource: PointCloudSourceReference | null;
  readonly terrainGenerationSettings: TerrainGenerationSettings;
  readonly terrainSurface: TerrainSurface | null;
  readonly layerStyles: ProjectLayerStyles;
}
