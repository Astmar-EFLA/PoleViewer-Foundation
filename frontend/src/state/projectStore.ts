import { create } from "zustand";
import type { LocalCoordinate, ProjectCoordinate } from "../domain/coordinates";
import type { ClassificationCount, ProcessingWarning } from "../domain/pointCloud";
import type { Project, ProjectLayerStyles } from "../domain/project";
import type { ElevationQuerySource } from "../domain/terrain";
import { BackendClipBlockedError, BackendRequestError } from "../services/backendClient";
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
  setProject(project: Project): void;
  setLayerVisible(layer: LayerKey, visible: boolean): void;
  setLayerOpacity(layer: LayerKey, opacity: number): void;
  setTerrainShowPoints(showPoints: boolean): void;
  setTerrainWireframe(wireframe: boolean): void;
  setHover(hover: HoverReadout | null): void;
  regenerateTerrainFromPointCloud(): Promise<void>;
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
}));
