import type { Provenance } from "./provenance";

export type GeotechCategory =
  | "topsoil"
  | "organic"
  | "fill"
  | "loose-soil"
  | "dense-soil"
  | "competent-bearing"
  | "weathered-rock"
  | "bedrock"
  | "custom";

/**
 * The boundary follows the terrain surface with a specified vertical
 * offset. `depthBelowTerrainM` is stored as a positive engineering depth
 * (never a signed offset the UI would have to re-interpret) -- elevation
 * at any XY is `terrainElevation - depthBelowTerrainM`
 * (docs/architecture -- terrain-relative boundary convention).
 */
export interface TerrainRelativeBoundary {
  readonly method: "terrain-relative";
  readonly depthBelowTerrainM: number;
}

/**
 * A horizontal surface at a fixed *project* elevation (the same frame as
 * ProjectCoordinate.elevation -- e.g. an orthometric height), not a local
 * Z value. The UI must display this as a project elevation, never
 * interchangeably with local Z or depth-below-terrain (spec section 11) --
 * the geometry layer converts it to local Z only at the point of building
 * renderable geometry (geotechBoundary.ts), and that conversion is a
 * simple offset (mastCentreProject.elevation), never a re-derivation.
 */
export interface AbsoluteElevationBoundary {
  readonly method: "absolute-elevation";
  readonly elevationProjectM: number;
}

export type BoundaryDefinition = TerrainRelativeBoundary | AbsoluteElevationBoundary;

/**
 * A geotechnical layer is defined by two independent boundary surfaces
 * (top, bottom). This is a visual interpretation model, not a full
 * ground-modelling system (spec section 11): having two valid boundary
 * *surfaces* does not by itself certify a fully known geological *solid*
 * between them -- see ADR-{TBD} / rendering/GeotechLayerSurfaces.tsx for
 * how this is rendered without overclaiming.
 */
export interface GeotechLayer {
  readonly id: string;
  readonly name: string;
  readonly category: GeotechCategory;
  readonly description?: string;
  readonly topBoundary: BoundaryDefinition;
  readonly bottomBoundary: BoundaryDefinition;
  readonly colour: string;
  readonly opacity: number;
  readonly visible: boolean;
  readonly wireframe: boolean;
  /** Confidence/verification lives on `source.verificationState` (ADR-010) -- one shared provenance model, not a second bespoke confidence field. */
  readonly source: Provenance;
  readonly notes?: string;
}

/**
 * Groundwater is a single surface (the water table), not a layer between
 * two boundaries -- kept as its own type rather than a GeotechLayer with a
 * meaningless bottom boundary.
 */
export interface Groundwater {
  readonly id: string;
  readonly name: string;
  readonly boundary: BoundaryDefinition;
  readonly colour: string;
  readonly opacity: number;
  readonly visible: boolean;
  readonly wireframe: boolean;
  readonly source: Provenance;
  readonly notes?: string;
}
