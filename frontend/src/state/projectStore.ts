import { create } from "zustand";
import type { LocalCoordinate, ProjectCoordinate } from "../domain/coordinates";
import type { FoundationParameters } from "../domain/foundation";
import { requireFoundationTypeById } from "../domain/foundationLibrary";
import type { ClassificationCount, ProcessingWarning } from "../domain/pointCloud";
import type { Project, ProjectLayerStyles } from "../domain/project";
import type { ElevationQuerySource } from "../domain/terrain";
import { BackendClipBlockedError, BackendRequestError } from "../services/backendClient";
import { withFoundationType } from "../services/buildFoundationInstances";
import { generateTerrainFromPointCloud } from "../services/terrainGeneration";

export type LayerKey = keyof ProjectLayerStyles;

export interface HoverReadout {
  readonly viewer: { readonly x: number; readonly y: number; readonly z: number };
  readonly local: LocalCoordinate;
  readonly project: ProjectCoordinate;
  readonly terrainQuerySource: ElevationQuerySource;
  readonly terrainElevation: number | null;
}

export interface TerrainRegenerationState {
  readonly status: "idle" | "loading" | "success" | "error";
  readonly warnings: readonly ProcessingWarning[];
  readonly classificationCounts: readonly ClassificationCount[];
  readonly errorMessage: string | null;
}

const IDLE_TERRAIN_REGENERATION: TerrainRegenerationState = {
  status: "idle",
  warnings: [],
  classificationCounts: [],
  errorMessage: null,
};

interface ProjectStoreState {
  readonly project: Project | null;
  readonly hover: HoverReadout | null;
  readonly terrainRegeneration: TerrainRegenerationState;
  readonly selectedLegId: string | null;
  setProject(project: Project): void;
  setLayerVisible(layer: LayerKey, visible: boolean): void;
  setLayerOpacity(layer: LayerKey, opacity: number): void;
  setTerrainShowPoints(showPoints: boolean): void;
  setTerrainWireframe(wireframe: boolean): void;
  setHover(hover: HoverReadout | null): void;
  regenerateTerrainFromPointCloud(): Promise<void>;
  setSelectedLeg(legId: string | null): void;
  setFoundationType(legId: string, foundationTypeId: string): void;
  setFoundationParameters(legId: string, parameters: FoundationParameters): void;
  copyFoundationToOtherLegs(sourceLegId: string): void;
}

/**
 * Rendering components read from this store and from the geometry layer's
 * pure functions; they never write engineering values back into it except
 * through these explicit actions (ADR-006). Domain calculations (placement,
 * foundation geometry, terrain queries, and now the backend-clip + TIN
 * pipeline) happen in geometry/services functions called by these actions,
 * never inline in a component body beyond calling those functions.
 */
export const useProjectStore = create<ProjectStoreState>((set, get) => ({
  project: null,
  hover: null,
  terrainRegeneration: IDLE_TERRAIN_REGENERATION,
  selectedLegId: null,
  setProject: (project) => set({ project }),
  setLayerVisible: (layer, visible) =>
    set((state) => {
      if (!state.project) return {};
      return {
        project: {
          ...state.project,
          layerStyles: {
            ...state.project.layerStyles,
            [layer]: { ...state.project.layerStyles[layer], visible },
          },
        },
      };
    }),
  setLayerOpacity: (layer, opacity) =>
    set((state) => {
      if (!state.project) return {};
      return {
        project: {
          ...state.project,
          layerStyles: {
            ...state.project.layerStyles,
            [layer]: { ...state.project.layerStyles[layer], opacity },
          },
        },
      };
    }),
  setTerrainShowPoints: (showPoints) =>
    set((state) => {
      if (!state.project) return {};
      return {
        project: {
          ...state.project,
          layerStyles: {
            ...state.project.layerStyles,
            terrain: { ...state.project.layerStyles.terrain, showPoints },
          },
        },
      };
    }),
  setTerrainWireframe: (wireframe) =>
    set((state) => {
      if (!state.project) return {};
      return {
        project: {
          ...state.project,
          layerStyles: {
            ...state.project.layerStyles,
            terrain: { ...state.project.layerStyles.terrain, wireframe },
          },
        },
      };
    }),
  setHover: (hover) => set({ hover }),
  regenerateTerrainFromPointCloud: async () => {
    const project = get().project;
    if (!project || !project.pointCloudSource) {
      set({
        terrainRegeneration: {
          ...IDLE_TERRAIN_REGENERATION,
          status: "error",
          errorMessage: "No point-cloud source is registered on this project.",
        },
      });
      return;
    }

    set({ terrainRegeneration: { ...IDLE_TERRAIN_REGENERATION, status: "loading" } });

    try {
      const result = await generateTerrainFromPointCloud(
        {
          mastCentreProject: project.mastCentreProject,
          lineBearingRadians: project.lineBearingRadians,
          crs: project.crs,
        },
        project.pointCloudSource,
        project.terrainGenerationSettings,
        new Date().toISOString()
      );

      // Only replace terrain on success -- a failed/blocked regeneration
      // must never clobber a previously good surface.
      set((state) => {
        if (!state.project) return {};
        return {
          project: { ...state.project, terrainSurface: result.terrainSurface, modifiedAt: new Date().toISOString() },
          terrainRegeneration: {
            status: "success",
            warnings: result.warnings,
            classificationCounts: result.classificationCounts,
            errorMessage: null,
          },
        };
      });
    } catch (error) {
      const warnings = error instanceof BackendClipBlockedError ? error.warnings : [];
      const message =
        error instanceof BackendRequestError
          ? error.message
          : `Unexpected error: ${(error as Error).message}`;
      set({
        terrainRegeneration: { status: "error", warnings, classificationCounts: [], errorMessage: message },
      });
    }
  },
  setSelectedLeg: (legId) => set({ selectedLegId: legId }),
  setFoundationType: (legId, foundationTypeId) =>
    set((state) => {
      if (!state.project) return {};
      const instance = state.project.foundationInstances.find((f) => f.legId === legId);
      if (!instance) return {};

      const foundationType = requireFoundationTypeById(foundationTypeId);
      const updated = withFoundationType(instance, state.project.poleModel, foundationType, new Date().toISOString());

      return {
        project: {
          ...state.project,
          foundationInstances: state.project.foundationInstances.map((f) =>
            f.legId === legId ? updated : f
          ),
        },
      };
    }),
  setFoundationParameters: (legId, parameters) =>
    set((state) => {
      if (!state.project) return {};
      const instance = state.project.foundationInstances.find((f) => f.legId === legId);
      if (!instance) return {};

      const foundationType = requireFoundationTypeById(instance.foundationTypeId);
      const updated = withFoundationType(
        instance,
        state.project.poleModel,
        foundationType,
        new Date().toISOString(),
        parameters
      );

      return {
        project: {
          ...state.project,
          foundationInstances: state.project.foundationInstances.map((f) =>
            f.legId === legId ? updated : f
          ),
        },
      };
    }),
  copyFoundationToOtherLegs: (sourceLegId) =>
    set((state) => {
      const project = state.project;
      if (!project) return {};
      const source = project.foundationInstances.find((f) => f.legId === sourceLegId);
      if (!source) return {};

      const foundationType = requireFoundationTypeById(source.foundationTypeId);
      const nowIso = new Date().toISOString();

      return {
        project: {
          ...project,
          // Each target leg keeps its own anchor and independently solves
          // its own base elevation for that anchor's level (withFoundationType
          // re-derives baseElevation per instance) -- copying a foundation
          // type/parameters is never allowed to also copy an elevation
          // across legs on sloping terrain.
          foundationInstances: project.foundationInstances.map((f) =>
            f.legId === sourceLegId
              ? f
              : withFoundationType(f, project.poleModel, foundationType, nowIso, source.parameters)
          ),
        },
      };
    }),
}));
