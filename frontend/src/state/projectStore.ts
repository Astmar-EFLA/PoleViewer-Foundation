import { create } from "zustand";
import type { LocalCoordinate, ProjectCoordinate } from "../domain/coordinates";
import type { Project, ProjectLayerStyles } from "../domain/project";
import type { ElevationQuerySource } from "../domain/terrain";

export type LayerKey = keyof ProjectLayerStyles;

export interface HoverReadout {
  readonly viewer: { readonly x: number; readonly y: number; readonly z: number };
  readonly local: LocalCoordinate;
  readonly project: ProjectCoordinate;
  readonly terrainQuerySource: ElevationQuerySource;
  readonly terrainElevation: number | null;
}

interface ProjectStoreState {
  readonly project: Project | null;
  readonly hover: HoverReadout | null;
  setProject(project: Project): void;
  setLayerVisible(layer: LayerKey, visible: boolean): void;
  setLayerOpacity(layer: LayerKey, opacity: number): void;
  setHover(hover: HoverReadout | null): void;
}

/**
 * Rendering components read from this store and from the geometry layer's
 * pure functions; they never write engineering values back into it except
 * through these explicit actions (ADR-006). Domain calculations (placement,
 * foundation geometry, terrain queries) happen in geometry/services
 * functions called by these actions or by rendering components -- never
 * inline in a component body beyond calling those functions.
 */
export const useProjectStore = create<ProjectStoreState>((set) => ({
  project: null,
  hover: null,
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
  setHover: (hover) => set({ hover }),
}));
