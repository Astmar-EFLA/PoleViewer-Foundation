import type { CoordinateReferenceSystem, LocalCoordinate, ProjectCoordinate } from "./coordinates";
import type { ExcavationInstance } from "./excavation";
import type { FoundationInstance } from "./foundation";
import type { GeotechLayer, Groundwater } from "./geotech";
import type { Measurement } from "./measurement";
import type { PoleModel } from "./poleModel";
import type { PointCloudSourceReference, TerrainGenerationSettings } from "./pointCloud";
import type { SectionDefinition } from "./section";
import type { TerrainSurface } from "./terrain";

/**
 * Phase 1-8 subset of the full project schema (spec section 19).
 * Validation results are deliberately NOT persisted here -- they are
 * always recomputed from current state (validation/projectReport.ts), so
 * there is no risk of a saved result silently going stale against the
 * engineering data it describes.
 */
export interface LayerStyle {
  readonly visible: boolean;
  readonly opacity: number;
}

export interface TerrainLayerStyle extends LayerStyle {
  /** "visible" above means "show the TIN surface"; this is the independent points-cloud toggle, so points-only / surface-only / both / wireframe are all just combinations of these two plus `wireframe`. */
  readonly showPoints: boolean;
  readonly wireframe: boolean;
  /** Independent overlay: elevation contour lines traced across the TIN, interval chosen automatically from the surface's elevation range. */
  readonly showContours: boolean;
}

/**
 * Note: geotechnical layers and groundwater are NOT represented in this
 * map -- each GeotechLayer/Groundwater already carries its own
 * visible/opacity/wireframe (spec section 11), so a parallel per-item
 * style bucket here would just be a second, redundant source of truth for
 * the same values. A group-level "hide all geotech layers at once" toggle
 * is a full layer-tree UI concern, deferred (see Phase 8's layer manager).
 */
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
  readonly excavationInstances: readonly ExcavationInstance[];
  readonly geotechLayers: readonly GeotechLayer[];
  readonly groundwater: Groundwater | null;
  readonly pointCloudSource: PointCloudSourceReference | null;
  readonly terrainGenerationSettings: TerrainGenerationSettings;
  readonly terrainSurface: TerrainSurface | null;
  readonly layerStyles: ProjectLayerStyles;
  readonly sections: readonly SectionDefinition[];
  readonly measurements: readonly Measurement[];
  /**
   * Incremented on every change to geometry-affecting engineering data
   * (foundation type/parameters, excavation parameters, geotech/groundwater
   * boundaries, terrain regeneration) -- never on style-only changes
   * (visibility, colour, opacity, wireframe). Sections and measurements
   * reference the version they were computed against so a stale one is
   * detectable (spec section 15) rather than silently kept.
   */
  readonly geometryVersion: number;
  /** Free-text project notes (spec section 19). Never engineering-authoritative -- purely a human record. */
  readonly notes: string;
}
