import { create } from "zustand";
import { localCoordinate } from "../domain/coordinates";
import type { LocalCoordinate, LocalFrameDefinition, ProjectCoordinate } from "../domain/coordinates";
import { localToProject } from "../geometry/coordinateTransform";
import type { SideSlope } from "../domain/excavation";
import type { FoundationParameters } from "../domain/foundation";
import { requireFoundationTypeById } from "../domain/foundationLibrary";
import type { BoundaryDefinition, GeotechLayer } from "../domain/geotech";
import type { Measurement, MeasurementKind, MeasurementPointRecord } from "../domain/measurement";
import type { ClassificationCount, ProcessingWarning, RectangularClipBoundarySettings } from "../domain/pointCloud";
import type { Project, ProjectLayerStyles } from "../domain/project";
import type { SectionDefinition, SectionMode, SectionPlane } from "../domain/section";
import type { ElevationQuerySource } from "../domain/terrain";
import { buildSectionPlane } from "../geometry/section";
import {
  measureDepthBelowTerrain,
  measureFoundationToBearingLayerClearance,
  measureFoundationToGroundwaterSeparation,
  measureHorizontalDistance,
  measureSlope,
  measureThreeDDistance,
  measureVerticalDifference,
} from "../geometry/measurements";
import {
  BackendClipBlockedError,
  BackendRequestError,
  DEFAULT_BACKEND_BASE_URL,
  requestCentreline,
  requestFileStatus,
  requestInspect,
  requestOrthophotoRegister,
  requestPoleModelImport,
  requestUpload,
  requestWorldImageryOrthophoto,
} from "../services/backendClient";
import type { BackendOrthophotoRegisterResult } from "../validation/backendOrthophotoSchema";
import { buildDefaultFoundationInstances, resyncFoundationToAnchor, withFoundationType } from "../services/buildFoundationInstances";
import { syncExcavationBottomsToFoundations, syncFoundationBaseToExcavation } from "../services/excavationFoundationSync";
import { syncFillTopsToFoundations, syncFoundationBaseToFill, syncUpliftFillTopsToFoundations } from "../services/fillFoundationSync";
import type { LineMastRow } from "../services/csvParsing";
import { parseLineMastCsv } from "../services/csvParsing";
import { readProjectJsonFile } from "../services/projectFile";
import { exportProjectAsStandaloneHtml } from "../services/exportProjectHtml";
import { fileSafeName } from "../services/fileNames";
import { exportSectionAsDxf } from "../services/sectionDxf";
import {
  buildDefaultExcavationInstances,
  buildDefaultFillInstances,
  buildDefaultSections,
  buildDefaultUpliftFillInstances,
} from "../services/projectDefaults";
import { generateTerrainFromPointCloud } from "../services/terrainGeneration";
import type { PolylinePoint } from "../geometry/centreline";
import { bearingForMast } from "../geometry/centreline";
import type { BackendFileStatus } from "../validation/backendWorkspaceSchema";

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
  /** Client-side TIN build time from the last successful regeneration (Phase 9 performance instrumentation); null until one has completed. */
  readonly tinGenerationDurationMs: number | null;
}

const IDLE_TERRAIN_REGENERATION: TerrainRegenerationState = {
  status: "idle",
  tinGenerationDurationMs: null,
  warnings: [],
  classificationCounts: [],
  errorMessage: null,
};

export interface HorizontalClipState {
  readonly enabled: boolean;
  readonly elevationLocalZ: number;
}

const DEFAULT_HORIZONTAL_CLIP: HorizontalClipState = { enabled: false, elevationLocalZ: 0 };

export interface PendingMeasurement {
  readonly kind: MeasurementKind;
  readonly points: readonly MeasurementPointRecord[];
}

export type FixedViewPreset = "top" | "front" | "side" | "isometric" | "reset";

export interface CameraPresetRequest {
  readonly preset: FixedViewPreset;
  readonly nonce: number;
}

const ONE_POINT_MEASUREMENT_KINDS: readonly MeasurementKind[] = ["point-coordinate", "elevation", "depth-below-terrain"];

function requiredPointCount(kind: MeasurementKind): number {
  return ONE_POINT_MEASUREMENT_KINDS.includes(kind) ? 1 : 2;
}

export interface AssetStatusState {
  readonly status: "idle" | "loading" | "success" | "error";
  readonly result: BackendFileStatus | null;
  readonly errorMessage: string | null;
}

const IDLE_ASSET_STATUS: AssetStatusState = { status: "idle", result: null, errorMessage: null };

export interface ProjectFileLoadState {
  readonly status: "idle" | "error";
  readonly errors: readonly string[];
}

const IDLE_PROJECT_FILE_LOAD: ProjectFileLoadState = { status: "idle", errors: [] };

export interface PoleModelImportState {
  readonly status: "idle" | "loading" | "success" | "error";
  readonly warnings: readonly string[];
  readonly errorMessage: string | null;
}

const IDLE_POLE_MODEL_IMPORT: PoleModelImportState = { status: "idle", warnings: [], errorMessage: null };

export interface PointCloudRegistrationState {
  readonly status: "idle" | "loading" | "success" | "error";
  readonly errorMessage: string | null;
}

const IDLE_POINT_CLOUD_REGISTRATION: PointCloudRegistrationState = { status: "idle", errorMessage: null };

export interface OrthophotoRegistrationState {
  readonly status: "idle" | "loading" | "success" | "error";
  readonly warnings: readonly string[];
  readonly errorMessage: string | null;
}

const IDLE_ORTHOPHOTO_REGISTRATION: OrthophotoRegistrationState = { status: "idle", warnings: [], errorMessage: null };

/**
 * A whole-line import: the CSV mast list plus (optionally) the centreline
 * shapefile, kept as session-only UI state -- never part of the saved
 * `Project` (see the plan this was built from). Picking a mast rebuilds the
 * ordinary single-mast `Project` around that row; everything downstream
 * (save/open, report, sections) is unaware a line was ever involved.
 */
export interface LineImportState {
  readonly masts: readonly LineMastRow[];
  readonly csvStatus: "idle" | "success" | "error";
  readonly csvErrorMessage: string | null;
  readonly selectedMastIndex: number | null;
  readonly selectMastStatus: "idle" | "loading" | "error";
  readonly selectMastErrorMessage: string | null;
  readonly centreline: readonly PolylinePoint[] | null;
  readonly centrelineStatus: "idle" | "loading" | "success" | "error";
  readonly centrelineErrorMessage: string | null;
  readonly centrelineWarnings: readonly string[];
}

const IDLE_LINE_IMPORT: LineImportState = {
  masts: [],
  csvStatus: "idle",
  csvErrorMessage: null,
  selectedMastIndex: null,
  selectMastStatus: "idle",
  selectMastErrorMessage: null,
  centreline: null,
  centrelineStatus: "idle",
  centrelineErrorMessage: null,
  centrelineWarnings: [],
};

/**
 * Batch-exporting a whole line's masts as standalone HTML files, one per
 * selected mast (see runBatchExport below) -- session-only UI state, same
 * as LineImportState. Per-mast status tracks each step (select the mast,
 * resolve/register its point cloud, regenerate terrain, export) so the UI
 * can show live progress and, critically, which towers were skipped or
 * failed and why -- point-cloud survey coverage genuinely differs per
 * tower, so a batch run is expected to have partial failures, not an
 * all-or-nothing outcome.
 */
export type BatchExportMastStatus =
  | "pending"
  | "selecting"
  | "loading-terrain"
  | "exporting"
  | "success"
  | "error"
  | "skipped";

export interface BatchExportMastResult {
  readonly mastIndex: number;
  readonly mastName: string;
  readonly status: BatchExportMastStatus;
  readonly message: string | null;
}

export interface BatchExportState {
  readonly status: "idle" | "running" | "done";
  readonly results: readonly BatchExportMastResult[];
}

const IDLE_BATCH_EXPORT: BatchExportState = { status: "idle", results: [] };

interface ProjectStoreState {
  readonly project: Project | null;
  readonly hover: HoverReadout | null;
  readonly terrainRegeneration: TerrainRegenerationState;
  readonly selectedFoundationInstanceId: string | null;
  readonly activeSectionId: string | null;
  readonly horizontalClip: HorizontalClipState;
  readonly pendingMeasurement: PendingMeasurement | null;
  readonly cameraPresetRequest: CameraPresetRequest | null;
  readonly canvasElement: HTMLCanvasElement | null;
  readonly assetStatus: AssetStatusState;
  readonly reportOpen: boolean;
  readonly sectionsPanelOpen: boolean;
  readonly projectFileLoad: ProjectFileLoadState;
  readonly terrainRegenerationController: AbortController | null;
  readonly assetStatusController: AbortController | null;
  readonly poleModelImport: PoleModelImportState;
  readonly pointCloudRegistration: PointCloudRegistrationState;
  readonly orthophotoRegistration: OrthophotoRegistrationState;
  readonly lineImport: LineImportState;
  readonly batchExport: BatchExportState;
  importPoleModel(filePath: string, baseUrl?: string): Promise<void>;
  importPoleModelFromFile(file: File, baseUrl?: string): Promise<void>;
  registerPointCloudFromFile(file: File, baseUrl?: string): Promise<void>;
  registerPointCloudFromPath(path: string, baseUrl?: string): Promise<void>;
  registerOrthophoto(imagePath: string, worldFilePath?: string, baseUrl?: string): Promise<void>;
  registerOrthophotoFromFiles(imageFile: File, worldFile: File, baseUrl?: string): Promise<void>;
  fetchWorldImageryOrthophoto(widthM?: number, heightM?: number, baseUrl?: string): Promise<void>;
  importLineCsv(file: File): Promise<void>;
  importLineCentreline(file: File, baseUrl?: string): Promise<void>;
  selectLineMast(index: number, baseUrl?: string): Promise<void>;
  runBatchExport(indices: readonly number[], baseUrl?: string): Promise<void>;
  resetBatchExport(): void;
  requestCameraPreset(preset: FixedViewPreset): void;
  setCanvasElement(canvas: HTMLCanvasElement | null): void;
  setReportOpen(open: boolean): void;
  setSectionsPanelOpen(open: boolean): void;
  setProjectNotes(notes: string): void;
  setMastCentreProject(mastCentreProject: ProjectCoordinate): void;
  setLineBearingRadians(lineBearingRadians: number): void;
  setPoleModelHeightOffset(localOriginZ: number): void;
  checkPointCloudAssetStatus(baseUrl?: string): Promise<void>;
  cancelAssetStatusCheck(): void;
  openProjectFromFile(file: File): Promise<void>;
  dismissProjectFileLoadError(): void;
  setProject(project: Project): void;
  setLayerVisible(layer: LayerKey, visible: boolean): void;
  setLayerOpacity(layer: LayerKey, opacity: number): void;
  setTerrainShowPoints(showPoints: boolean): void;
  setTerrainWireframe(wireframe: boolean): void;
  setTerrainShowContours(showContours: boolean): void;
  setTerrainContourInterval(contourIntervalM: number | null): void;
  setHover(hover: HoverReadout | null): void;
  regenerateTerrainFromPointCloud(): Promise<void>;
  cancelTerrainRegeneration(): void;
  setClipBoundary(patch: Partial<RectangularClipBoundarySettings>): void;
  setSelectedFoundationInstance(instanceId: string | null): void;
  setFoundationType(instanceId: string, foundationTypeId: string): void;
  setFoundationParameters(instanceId: string, parameters: FoundationParameters): void;
  copyFoundationToSimilar(sourceInstanceId: string): void;
  setGeotechLayerStyle(
    layerId: string,
    style: Partial<{ visible: boolean; opacity: number; wireframe: boolean }>
  ): void;
  setGeotechLayerBoundary(layerId: string, which: "top" | "bottom", boundary: BoundaryDefinition): void;
  setGeotechLayerLabel(layerId: string, label: Partial<{ name: string; category: string }>): void;
  addGeotechLayer(): void;
  removeGeotechLayer(layerId: string): void;
  setGroundwaterStyle(style: Partial<{ visible: boolean; opacity: number; wireframe: boolean }>): void;
  setGroundwaterBoundary(boundary: BoundaryDefinition): void;
  setExcavationStyle(
    excavationId: string,
    style: Partial<{ visible: boolean; opacity: number; wireframe: boolean }>
  ): void;
  setExcavationParameters(
    excavationId: string,
    params: Partial<{ bottomElevationM: number; workingSpaceOffsetM: number; sideSlope: SideSlope }>
  ): void;
  setFillStyle(fillId: string, style: Partial<{ visible: boolean; opacity: number; wireframe: boolean }>): void;
  setFillParameters(
    fillId: string,
    params: Partial<{ topElevationM: number; workingSpaceOffsetM: number; sideSlope: SideSlope }>
  ): void;
  setUpliftFillStyle(fillId: string, style: Partial<{ visible: boolean; opacity: number; wireframe: boolean }>): void;
  setUpliftFillParameters(
    fillId: string,
    params: Partial<{ topElevationM: number; workingSpaceOffsetM: number; sideSlope: SideSlope }>
  ): void;
  setActiveSectionId(sectionId: string | null): void;
  addSection(mode: SectionMode, legId: string | null): void;
  updateSectionPlane(sectionId: string, plane: SectionPlane): void;
  setSectionPointTolerance(sectionId: string, toleranceM: number): void;
  setSectionVisible(sectionId: string, visible: boolean): void;
  removeSection(sectionId: string): void;
  setHorizontalClipEnabled(enabled: boolean): void;
  setHorizontalClipElevation(elevationLocalZ: number): void;
  startMeasurement(kind: MeasurementKind): void;
  cancelMeasurement(): void;
  pickMeasurementPoint(local: LocalCoordinate): void;
  addFoundationClearanceMeasurement(
    kind: "foundation-to-bearing-layer" | "foundation-to-groundwater",
    instanceId: string,
    geotechLayerId?: string
  ): void;
  removeMeasurement(measurementId: string): void;
  recalculateMeasurement(measurementId: string): void;
}

/**
 * Shared "apply a successful orthophoto registration" state update, used by
 * both a manually-registered orthophoto (registerOrthophoto) and a fetched
 * Esri World Imagery tile (fetchWorldImageryOrthophoto) -- the backend
 * response shape is identical either way (see requestWorldImageryOrthophoto's
 * doc comment in services/backendClient.ts).
 */
function applyOrthophotoResult(imagePath: string, result: BackendOrthophotoRegisterResult) {
  return (state: ProjectStoreState) => {
    if (!state.project) return {};
    const nowIso = new Date().toISOString();
    return {
      project: {
        ...state.project,
        orthophoto: {
          imagePath,
          imageUrl: result.imageUrl,
          imageWidthPx: result.imageWidthPx,
          imageHeightPx: result.imageHeightPx,
          worldFile: result.worldFile,
        },
        layerStyles: {
          ...state.project.layerStyles,
          orthophoto: { ...state.project.layerStyles.orthophoto, visible: true },
        },
        modifiedAt: nowIso,
      },
      orthophotoRegistration: {
        status: "success" as const,
        warnings: result.warnings.map((w) => w.message),
        errorMessage: null,
      },
    };
  };
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
  selectedFoundationInstanceId: null,
  activeSectionId: null,
  horizontalClip: DEFAULT_HORIZONTAL_CLIP,
  pendingMeasurement: null,
  cameraPresetRequest: null,
  canvasElement: null,
  assetStatus: IDLE_ASSET_STATUS,
  reportOpen: false,
  sectionsPanelOpen: false,
  projectFileLoad: IDLE_PROJECT_FILE_LOAD,
  terrainRegenerationController: null,
  assetStatusController: null,
  poleModelImport: IDLE_POLE_MODEL_IMPORT,
  pointCloudRegistration: IDLE_POINT_CLOUD_REGISTRATION,
  orthophotoRegistration: IDLE_ORTHOPHOTO_REGISTRATION,
  lineImport: IDLE_LINE_IMPORT,
  batchExport: IDLE_BATCH_EXPORT,
  importPoleModel: async (filePath, baseUrl = DEFAULT_BACKEND_BASE_URL) => {
    const project = get().project;
    if (!project) return;

    set({ poleModelImport: { status: "loading", warnings: [], errorMessage: null } });
    try {
      const poleModel = await requestPoleModelImport(filePath, baseUrl);
      const nowIso = new Date().toISOString();
      const defaultLegFoundationType = requireFoundationTypeById("rectangular-pad-pedestal-v1");
      const defaultGuyFoundationType = requireFoundationTypeById("guy-anchor-block-v1");
      const foundationInstances = buildDefaultFoundationInstances(
        poleModel,
        defaultLegFoundationType,
        defaultGuyFoundationType,
        nowIso
      );
      const excavationInstances = buildDefaultExcavationInstances(foundationInstances);
      const fillInstances = buildDefaultFillInstances(foundationInstances);
      const upliftFillInstances = buildDefaultUpliftFillInstances(foundationInstances);
      const sections = buildDefaultSections();

      set((state) => {
        if (!state.project) return {};
        return {
          project: {
            ...state.project,
            poleModel,
            foundationInstances,
            excavationInstances,
            fillInstances,
            upliftFillInstances,
            // A pole-model import replaces the legs and foundations
            // wholesale, so anything that referenced the old ones by id
            // (a "selected leg" section, a measurement tied to an old
            // foundation instance) would silently point at nothing --
            // reset to the same clean defaults a brand-new project starts
            // with, rather than leave dangling references around.
            sections,
            measurements: [],
            geometryVersion: state.project.geometryVersion + 1,
            modifiedAt: nowIso,
          },
          selectedFoundationInstanceId: null,
          activeSectionId: sections[0]?.id ?? null,
          pendingMeasurement: null,
          poleModelImport: { status: "success", warnings: poleModel.warnings, errorMessage: null },
        };
      });
    } catch (error) {
      const message =
        error instanceof BackendRequestError ? error.message : `Unexpected error: ${(error as Error).message}`;
      set({ poleModelImport: { status: "error", warnings: [], errorMessage: message } });
    }
  },
  importPoleModelFromFile: async (file, baseUrl = DEFAULT_BACKEND_BASE_URL) => {
    set({ poleModelImport: { status: "loading", warnings: [], errorMessage: null } });
    try {
      const uploaded = await requestUpload(file, "pole-model", baseUrl);
      await get().importPoleModel(uploaded.filePath, baseUrl);
    } catch (error) {
      const message =
        error instanceof BackendRequestError ? error.message : `Unexpected error: ${(error as Error).message}`;
      set({ poleModelImport: { status: "error", warnings: [], errorMessage: message } });
    }
  },
  registerPointCloudFromFile: async (file, baseUrl = DEFAULT_BACKEND_BASE_URL) => {
    if (!get().project) return;
    set({ pointCloudRegistration: { status: "loading", errorMessage: null } });
    try {
      const uploaded = await requestUpload(file, "point-cloud", baseUrl);
      // Read the file's own CRS from its header rather than assuming it
      // matches the project's -- if it doesn't, the existing clip-blocked
      // safety net (BackendClipBlockedError) is what catches that, not
      // anything decided here.
      const metadata = await requestInspect(uploaded.filePath, baseUrl);
      const nowIso = new Date().toISOString();
      set((state) => {
        if (!state.project) return {};
        return {
          project: {
            ...state.project,
            pointCloudSource: { filePath: uploaded.filePath, crs: metadata.crs, contentHash: null },
            modifiedAt: nowIso,
          },
          pointCloudRegistration: { status: "success", errorMessage: null },
        };
      });
    } catch (error) {
      const message =
        error instanceof BackendRequestError ? error.message : `Unexpected error: ${(error as Error).message}`;
      set({ pointCloudRegistration: { status: "error", errorMessage: message } });
    }
  },
  registerPointCloudFromPath: async (path, baseUrl = DEFAULT_BACKEND_BASE_URL) => {
    // The path-based sibling of registerPointCloudFromFile above -- for a
    // point cloud that already sits in the workspace (e.g. a per-mast CSV
    // row's own pointCloudPath, see runBatchExport), skipping the upload
    // step entirely, the same way modelPath is already consumed directly
    // by requestPoleModelImport with no upload.
    if (!get().project) return;
    set({ pointCloudRegistration: { status: "loading", errorMessage: null } });
    try {
      const metadata = await requestInspect(path, baseUrl);
      const nowIso = new Date().toISOString();
      set((state) => {
        if (!state.project) return {};
        return {
          project: {
            ...state.project,
            pointCloudSource: { filePath: path, crs: metadata.crs, contentHash: null },
            modifiedAt: nowIso,
          },
          pointCloudRegistration: { status: "success", errorMessage: null },
        };
      });
    } catch (error) {
      const message =
        error instanceof BackendRequestError ? error.message : `Unexpected error: ${(error as Error).message}`;
      set({ pointCloudRegistration: { status: "error", errorMessage: message } });
    }
  },
  registerOrthophoto: async (imagePath, worldFilePath, baseUrl = DEFAULT_BACKEND_BASE_URL) => {
    if (!get().project) return;
    set({ orthophotoRegistration: { status: "loading", warnings: [], errorMessage: null } });
    try {
      const result = await requestOrthophotoRegister(imagePath, worldFilePath, baseUrl);
      set(applyOrthophotoResult(imagePath, result));
    } catch (error) {
      const message =
        error instanceof BackendRequestError ? error.message : `Unexpected error: ${(error as Error).message}`;
      set({ orthophotoRegistration: { status: "error", warnings: [], errorMessage: message } });
    }
  },
  fetchWorldImageryOrthophoto: async (widthM = 400, heightM = 400, baseUrl = DEFAULT_BACKEND_BASE_URL) => {
    const project = get().project;
    if (!project) return;
    set({ orthophotoRegistration: { status: "loading", warnings: [], errorMessage: null } });
    try {
      const result = await requestWorldImageryOrthophoto(
        project.mastCentreProject.easting,
        project.mastCentreProject.northing,
        project.crs,
        widthM,
        heightM,
        baseUrl
      );
      set(applyOrthophotoResult(`Esri World Imagery (${widthM}m x ${heightM}m)`, result));
    } catch (error) {
      const message =
        error instanceof BackendRequestError ? error.message : `Unexpected error: ${(error as Error).message}`;
      set({ orthophotoRegistration: { status: "error", warnings: [], errorMessage: message } });
    }
  },
  registerOrthophotoFromFiles: async (imageFile, worldFile, baseUrl = DEFAULT_BACKEND_BASE_URL) => {
    if (!get().project) return;
    set({ orthophotoRegistration: { status: "loading", warnings: [], errorMessage: null } });
    try {
      // Uploading (rather than requiring the file to already sit under the
      // configured workspace root) is exactly what fixes the case that
      // prompted this: an orthophoto living outside whatever folder
      // POLE_VIEWER_WORKSPACE_ROOT happens to point at right now.
      const uploadedImage = await requestUpload(imageFile, "orthophoto-image", baseUrl);
      const uploadedWorldFile = await requestUpload(worldFile, "orthophoto-world-file", baseUrl);
      await get().registerOrthophoto(uploadedImage.filePath, uploadedWorldFile.filePath, baseUrl);
    } catch (error) {
      const message =
        error instanceof BackendRequestError ? error.message : `Unexpected error: ${(error as Error).message}`;
      set({ orthophotoRegistration: { status: "error", warnings: [], errorMessage: message } });
    }
  },
  importLineCsv: async (file) => {
    try {
      const text = await file.text();
      const parsed = parseLineMastCsv(text);
      if (!parsed.success) {
        set((state) => ({
          lineImport: { ...state.lineImport, csvStatus: "error", csvErrorMessage: parsed.errors.join("; ") },
        }));
        return;
      }
      set((state) => ({
        lineImport: {
          ...state.lineImport,
          masts: parsed.data,
          csvStatus: "success",
          csvErrorMessage: null,
          selectedMastIndex: null,
        },
      }));
    } catch (error) {
      set((state) => ({
        lineImport: { ...state.lineImport, csvStatus: "error", csvErrorMessage: `Unexpected error: ${(error as Error).message}` },
      }));
    }
  },
  importLineCentreline: async (file, baseUrl = DEFAULT_BACKEND_BASE_URL) => {
    const project = get().project;
    if (!project) return;
    set((state) => ({ lineImport: { ...state.lineImport, centrelineStatus: "loading", centrelineErrorMessage: null } }));
    try {
      const uploaded = await requestUpload(file, "line-centreline", baseUrl);
      const result = await requestCentreline(uploaded.filePath, project.crs, baseUrl);
      set((state) => ({
        lineImport: {
          ...state.lineImport,
          centreline: result.vertices,
          centrelineStatus: "success",
          centrelineErrorMessage: null,
          centrelineWarnings: result.warnings.map((w) => w.message),
        },
      }));
    } catch (error) {
      const message =
        error instanceof BackendRequestError ? error.message : `Unexpected error: ${(error as Error).message}`;
      set((state) => ({
        lineImport: { ...state.lineImport, centrelineStatus: "error", centrelineErrorMessage: message },
      }));
    }
  },
  selectLineMast: async (index, baseUrl = DEFAULT_BACKEND_BASE_URL) => {
    const row = get().lineImport.masts[index];
    const project = get().project;
    if (!row || !project) return;

    set((state) => ({ lineImport: { ...state.lineImport, selectMastStatus: "loading", selectMastErrorMessage: null } }));
    try {
      const poleModel = await requestPoleModelImport(row.modelPath, baseUrl);
      const nowIso = new Date().toISOString();
      // The CSV row's own foundationTypeId, when supplied, overrides the leg
      // foundation type for this mast only -- guy anchors are unaffected
      // (see LineMastRow.foundationTypeId's doc comment). Already validated
      // against the library at CSV parse time (csvParsing.ts), so this is
      // never an unknown id here.
      const legFoundationType = row.foundationTypeId
        ? requireFoundationTypeById(row.foundationTypeId)
        : requireFoundationTypeById("rectangular-pad-pedestal-v1");
      const defaultGuyFoundationType = requireFoundationTypeById("guy-anchor-block-v1");
      const foundationInstances = buildDefaultFoundationInstances(
        poleModel,
        legFoundationType,
        defaultGuyFoundationType,
        nowIso
      );
      const excavationInstances = buildDefaultExcavationInstances(foundationInstances);
      const fillInstances = buildDefaultFillInstances(foundationInstances);
      const upliftFillInstances = buildDefaultUpliftFillInstances(foundationInstances);
      const sections = buildDefaultSections();
      const lineBearingRadians = bearingForMast(get().lineImport.masts, get().lineImport.centreline, index);

      set((state) => {
        if (!state.project) return {};
        return {
          project: {
            ...state.project,
            poleModel,
            foundationInstances,
            excavationInstances,
            fillInstances,
            upliftFillInstances,
            sections,
            measurements: [],
            mastCentreProject: row.position,
            lineBearingRadians,
            // Same two fields the CSV promises per row (spec: "dýpi á
            // fastan botn" / "dýpi á grunnvatn") -- everything else about
            // these layers (name, colour, other boundaries) is untouched.
            geotechLayers: state.project.geotechLayers.map((l) =>
              l.category === "competent-bearing"
                ? { ...l, topBoundary: { method: "terrain-relative", depthBelowTerrainM: row.bearingLayerDepthM } }
                : l
            ),
            groundwater: state.project.groundwater
              ? {
                  ...state.project.groundwater,
                  boundary: { method: "terrain-relative", depthBelowTerrainM: row.groundwaterDepthM },
                }
              : state.project.groundwater,
            geometryVersion: state.project.geometryVersion + 1,
            modifiedAt: nowIso,
          },
          selectedFoundationInstanceId: null,
          activeSectionId: sections[0]?.id ?? null,
          pendingMeasurement: null,
          poleModelImport: { status: "success", warnings: poleModel.warnings, errorMessage: null },
          lineImport: { ...state.lineImport, selectMastStatus: "idle", selectedMastIndex: index },
        };
      });
    } catch (error) {
      const message =
        error instanceof BackendRequestError ? error.message : `Unexpected error: ${(error as Error).message}`;
      set((state) => ({
        lineImport: { ...state.lineImport, selectMastStatus: "error", selectMastErrorMessage: message },
      }));
    }
  },
  runBatchExport: async (indices, baseUrl = DEFAULT_BACKEND_BASE_URL) => {
    const masts = get().lineImport.masts;
    const initialResults: BatchExportMastResult[] = indices.map((mastIndex) => ({
      mastIndex,
      mastName: masts[mastIndex]?.mastName ?? `row ${mastIndex + 1}`,
      status: "pending",
      message: null,
    }));
    set({ batchExport: { status: "running", results: initialResults } });

    const updateResult = (mastIndex: number, patch: Partial<BatchExportMastResult>) => {
      set((state) => ({
        batchExport: {
          ...state.batchExport,
          results: state.batchExport.results.map((r) => (r.mastIndex === mastIndex ? { ...r, ...patch } : r)),
        },
      }));
    };

    for (const mastIndex of indices) {
      const row = masts[mastIndex];
      if (!row) continue;

      updateResult(mastIndex, { status: "selecting" });
      await get().selectLineMast(mastIndex, baseUrl);
      if (get().lineImport.selectMastStatus === "error") {
        updateResult(mastIndex, { status: "error", message: get().lineImport.selectMastErrorMessage });
        continue;
      }

      // Each mast's own point cloud, when the CSV row supplies one; falls
      // back to whatever point cloud is currently registered on the
      // project otherwise (today's single-shared-point-cloud behaviour,
      // preserved for a line whose towers don't each have their own file).
      const pointCloudPath = row.pointCloudPath ?? get().project?.pointCloudSource?.filePath ?? null;
      if (!pointCloudPath) {
        updateResult(mastIndex, {
          status: "skipped",
          message: "No point cloud available for this mast (no pointCloudPath in the CSV row, and none currently registered on the project).",
        });
        continue;
      }

      updateResult(mastIndex, { status: "loading-terrain" });
      if (row.pointCloudPath && row.pointCloudPath !== get().project?.pointCloudSource?.filePath) {
        await get().registerPointCloudFromPath(row.pointCloudPath, baseUrl);
        if (get().pointCloudRegistration.status === "error") {
          updateResult(mastIndex, { status: "error", message: get().pointCloudRegistration.errorMessage });
          continue;
        }
      }
      await get().regenerateTerrainFromPointCloud();
      if (get().terrainRegeneration.status === "error") {
        // An export without valid terrain would misrepresent a mast that
        // genuinely has bad/missing survey data -- surfacing that clearly
        // is the point of this feature, not silently shipping a broken
        // viewer for it.
        updateResult(mastIndex, { status: "error", message: get().terrainRegeneration.errorMessage });
        continue;
      }

      updateResult(mastIndex, { status: "exporting" });
      try {
        const project = get().project;
        if (!project) throw new Error("Project was cleared mid-batch.");
        // Both files are named after the mast itself -- project.name is the
        // same for every mast in a batch, so it can't tell them apart.
        const fileBaseName = fileSafeName(row.mastName, `mast-${mastIndex + 1}`);
        const transverseSection = project.sections.find((s) => s.mode === "transverse");
        if (!transverseSection) throw new Error("No transverse section defined for this mast -- cannot export its DXF.");
        exportSectionAsDxf(project, transverseSection, fileBaseName, row.mastName);
        await exportProjectAsStandaloneHtml(project, `${fileBaseName}-viewer`);
        updateResult(mastIndex, { status: "success", message: null });
      } catch (error) {
        updateResult(mastIndex, { status: "error", message: (error as Error).message });
      }
    }

    set((state) => ({ batchExport: { ...state.batchExport, status: "done" } }));
  },
  resetBatchExport: () => set({ batchExport: IDLE_BATCH_EXPORT }),
  requestCameraPreset: (preset) =>
    set((state) => ({ cameraPresetRequest: { preset, nonce: (state.cameraPresetRequest?.nonce ?? 0) + 1 } })),
  setCanvasElement: (canvas) => set({ canvasElement: canvas }),
  setReportOpen: (open) => set({ reportOpen: open }),
  setSectionsPanelOpen: (open) => set({ sectionsPanelOpen: open }),
  setProjectNotes: (notes) =>
    set((state) => {
      if (!state.project) return {};
      return { project: { ...state.project, notes } };
    }),
  setMastCentreProject: (mastCentreProject) =>
    set((state) => {
      if (!state.project) return {};
      const nowIso = new Date().toISOString();
      // Moves where the local engineering frame sits in the real world --
      // every local<->project conversion (LAS clipping, the coordinate
      // readout, previously-recorded measurement project-coordinates)
      // is now against a different real-world position, so this counts as
      // a geometry-affecting change (bumps geometryVersion) even though no
      // local-frame geometry itself was edited.
      return {
        project: { ...state.project, mastCentreProject, geometryVersion: state.project.geometryVersion + 1, modifiedAt: nowIso },
      };
    }),
  setLineBearingRadians: (lineBearingRadians) =>
    set((state) => {
      if (!state.project) return {};
      const nowIso = new Date().toISOString();
      return {
        project: { ...state.project, lineBearingRadians, geometryVersion: state.project.geometryVersion + 1, modifiedAt: nowIso },
      };
    }),
  setPoleModelHeightOffset: (localOriginZ) =>
    set((state) => {
      if (!state.project) return {};
      const nowIso = new Date().toISOString();
      const poleModel = { ...state.project.poleModel, localOrigin: { ...state.project.poleModel.localOrigin, z: localOriginZ } };
      // Every anchor (hence every foundation) is placed live from
      // poleModel.localOrigin (geometry/polePlacement.ts), so the pole
      // model and its anchors already move as soon as localOrigin.z
      // changes -- but a FoundationInstance's position/baseElevation are a
      // *stored* snapshot, solved once at creation (services/
      // buildFoundationInstances.ts), and would otherwise be left behind
      // at the old height instead of following the leg anchor they connect
      // to. Re-solving each one against the pole model's new position is
      // what makes "raise/lower the mast" actually move the foundations
      // with it, not just the visible structure.
      const foundationInstances = state.project.foundationInstances.map((f) => resyncFoundationToAnchor(f, poleModel, nowIso));
      return {
        project: {
          ...state.project,
          poleModel,
          foundationInstances,
          excavationInstances: syncExcavationBottomsToFoundations(state.project.excavationInstances, foundationInstances),
          fillInstances: syncFillTopsToFoundations(state.project.fillInstances, foundationInstances),
          upliftFillInstances: syncUpliftFillTopsToFoundations(state.project.upliftFillInstances, foundationInstances),
          geometryVersion: state.project.geometryVersion + 1,
          modifiedAt: nowIso,
        },
      };
    }),
  checkPointCloudAssetStatus: async (baseUrl = DEFAULT_BACKEND_BASE_URL) => {
    const project = get().project;
    if (!project?.pointCloudSource) return;

    // Cancel any check already in flight rather than letting two race --
    // whichever response lands last would otherwise silently win.
    get().assetStatusController?.abort();
    const controller = new AbortController();
    set({
      assetStatus: { status: "loading", result: null, errorMessage: null },
      assetStatusController: controller,
    });
    try {
      const result = await requestFileStatus(project.pointCloudSource.filePath, baseUrl, controller.signal);
      set({ assetStatus: { status: "success", result, errorMessage: null }, assetStatusController: null });

      // A confirmed hash is recorded on the project the first time it's
      // successfully checked, so future checks (including on reopen) have
      // something to compare against (ADR-008) -- but only when nothing
      // was recorded yet; a mismatch must stay visible as a mismatch, not
      // be silently re-baselined by simply checking again.
      if (result.exists && result.sha256 && !project.pointCloudSource.contentHash) {
        set((state) => {
          if (!state.project?.pointCloudSource) return {};
          return {
            project: {
              ...state.project,
              pointCloudSource: { ...state.project.pointCloudSource, contentHash: result.sha256 },
            },
          };
        });
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        set({ assetStatus: IDLE_ASSET_STATUS, assetStatusController: null });
        return;
      }
      const message =
        error instanceof BackendRequestError ? error.message : `Unexpected error: ${(error as Error).message}`;
      set({ assetStatus: { status: "error", result: null, errorMessage: message }, assetStatusController: null });
    }
  },
  cancelAssetStatusCheck: () => {
    get().assetStatusController?.abort();
  },
  openProjectFromFile: async (file) => {
    const result = await readProjectJsonFile(file);
    if (!result.success) {
      set({ projectFileLoad: { status: "error", errors: result.errors } });
      return;
    }
    set({
      project: result.data,
      activeSectionId: result.data.sections[0]?.id ?? null,
      pendingMeasurement: null,
      assetStatus: IDLE_ASSET_STATUS,
      projectFileLoad: IDLE_PROJECT_FILE_LOAD,
      poleModelImport: IDLE_POLE_MODEL_IMPORT,
      pointCloudRegistration: IDLE_POINT_CLOUD_REGISTRATION,
      orthophotoRegistration: IDLE_ORTHOPHOTO_REGISTRATION,
      lineImport: IDLE_LINE_IMPORT,
      batchExport: IDLE_BATCH_EXPORT,
    });
  },
  dismissProjectFileLoadError: () => set({ projectFileLoad: IDLE_PROJECT_FILE_LOAD }),
  setProject: (project) =>
    set({
      project,
      activeSectionId: project.sections[0]?.id ?? null,
      pendingMeasurement: null,
      assetStatus: IDLE_ASSET_STATUS,
      projectFileLoad: IDLE_PROJECT_FILE_LOAD,
      poleModelImport: IDLE_POLE_MODEL_IMPORT,
      pointCloudRegistration: IDLE_POINT_CLOUD_REGISTRATION,
      orthophotoRegistration: IDLE_ORTHOPHOTO_REGISTRATION,
      lineImport: IDLE_LINE_IMPORT,
      batchExport: IDLE_BATCH_EXPORT,
    }),
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
  setTerrainShowContours: (showContours) =>
    set((state) => {
      if (!state.project) return {};
      return {
        project: {
          ...state.project,
          layerStyles: {
            ...state.project.layerStyles,
            terrain: { ...state.project.layerStyles.terrain, showContours },
          },
        },
      };
    }),
  setTerrainContourInterval: (contourIntervalM) =>
    set((state) => {
      if (!state.project) return {};
      return {
        project: {
          ...state.project,
          layerStyles: {
            ...state.project.layerStyles,
            terrain: { ...state.project.layerStyles.terrain, contourIntervalM },
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

    // Cancel any regeneration already in flight rather than letting two
    // race -- whichever response lands last would otherwise silently win.
    get().terrainRegenerationController?.abort();
    const controller = new AbortController();
    set({
      terrainRegeneration: { ...IDLE_TERRAIN_REGENERATION, status: "loading" },
      terrainRegenerationController: controller,
    });

    try {
      const result = await generateTerrainFromPointCloud(
        {
          mastCentreProject: project.mastCentreProject,
          lineBearingRadians: project.lineBearingRadians,
          crs: project.crs,
        },
        project.pointCloudSource,
        project.terrainGenerationSettings,
        new Date().toISOString(),
        DEFAULT_BACKEND_BASE_URL,
        controller.signal
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
            tinGenerationDurationMs: result.tinGenerationDurationMs,
          },
          terrainRegenerationController: null,
        };
      });
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        set({ terrainRegeneration: IDLE_TERRAIN_REGENERATION, terrainRegenerationController: null });
        return;
      }
      const warnings = error instanceof BackendClipBlockedError ? error.warnings : [];
      const message =
        error instanceof BackendRequestError
          ? error.message
          : `Unexpected error: ${(error as Error).message}`;
      set({
        terrainRegeneration: {
          status: "error",
          warnings,
          classificationCounts: [],
          errorMessage: message,
          tinGenerationDurationMs: null,
        },
        terrainRegenerationController: null,
      });
    }
  },
  cancelTerrainRegeneration: () => {
    get().terrainRegenerationController?.abort();
  },
  setClipBoundary: (patch) =>
    set((state) => {
      if (!state.project) return {};
      return {
        project: {
          ...state.project,
          terrainGenerationSettings: {
            ...state.project.terrainGenerationSettings,
            clipBoundary: { ...state.project.terrainGenerationSettings.clipBoundary, ...patch },
          },
        },
      };
    }),
  setSelectedFoundationInstance: (instanceId) => set({ selectedFoundationInstanceId: instanceId }),
  setFoundationType: (instanceId, foundationTypeId) =>
    set((state) => {
      if (!state.project) return {};
      const instance = state.project.foundationInstances.find((f) => f.instanceId === instanceId);
      if (!instance) return {};

      const foundationType = requireFoundationTypeById(foundationTypeId);
      const nowIso = new Date().toISOString();
      const updated = withFoundationType(instance, state.project.poleModel, foundationType, nowIso);
      const foundationInstances = state.project.foundationInstances.map((f) =>
        f.instanceId === instanceId ? updated : f
      );

      return {
        project: {
          ...state.project,
          foundationInstances,
          // The foundation's base just moved (new type -> new solved
          // elevation) -- its excavation's floor, its fill's top plate, and
          // its uplift-fill's top (which also follows the foundation's own
          // top, not just its base) must always stay in sync, never drift.
          excavationInstances: syncExcavationBottomsToFoundations(state.project.excavationInstances, foundationInstances),
          fillInstances: syncFillTopsToFoundations(state.project.fillInstances, foundationInstances),
          upliftFillInstances: syncUpliftFillTopsToFoundations(state.project.upliftFillInstances, foundationInstances),
          geometryVersion: state.project.geometryVersion + 1,
          modifiedAt: nowIso,
        },
      };
    }),
  setFoundationParameters: (instanceId, parameters) =>
    set((state) => {
      if (!state.project) return {};
      const instance = state.project.foundationInstances.find((f) => f.instanceId === instanceId);
      if (!instance) return {};

      const foundationType = requireFoundationTypeById(instance.foundationTypeId);
      const nowIso = new Date().toISOString();
      const updated = withFoundationType(
        instance,
        state.project.poleModel,
        foundationType,
        nowIso,
        parameters
      );
      const foundationInstances = state.project.foundationInstances.map((f) =>
        f.instanceId === instanceId ? updated : f
      );

      return {
        project: {
          ...state.project,
          foundationInstances,
          excavationInstances: syncExcavationBottomsToFoundations(state.project.excavationInstances, foundationInstances),
          fillInstances: syncFillTopsToFoundations(state.project.fillInstances, foundationInstances),
          upliftFillInstances: syncUpliftFillTopsToFoundations(state.project.upliftFillInstances, foundationInstances),
          geometryVersion: state.project.geometryVersion + 1,
          modifiedAt: nowIso,
        },
      };
    }),
  copyFoundationToSimilar: (sourceInstanceId) =>
    set((state) => {
      const project = state.project;
      if (!project) return {};
      const source = project.foundationInstances.find((f) => f.instanceId === sourceInstanceId);
      if (!source) return {};

      const foundationType = requireFoundationTypeById(source.foundationTypeId);
      const nowIso = new Date().toISOString();
      const sourceIsLeg = source.legId !== null;
      // Each target keeps its own anchor and independently solves its own
      // base elevation for that anchor's level (withFoundationType
      // re-derives baseElevation per instance) -- copying a foundation
      // type/parameters is never allowed to also copy an elevation across
      // instances on sloping terrain. Only applied to instances of the
      // same kind (leg <-> leg, guy anchor <-> guy anchor) so a leg-pad
      // shape never overwrites a guy anchor block, or vice versa.
      const foundationInstances = project.foundationInstances.map((f) => {
        if (f.instanceId === sourceInstanceId) return f;
        if ((f.legId !== null) !== sourceIsLeg) return f;
        return withFoundationType(f, project.poleModel, foundationType, nowIso, source.parameters);
      });

      return {
        project: {
          ...project,
          foundationInstances,
          excavationInstances: syncExcavationBottomsToFoundations(project.excavationInstances, foundationInstances),
          fillInstances: syncFillTopsToFoundations(project.fillInstances, foundationInstances),
          upliftFillInstances: syncUpliftFillTopsToFoundations(project.upliftFillInstances, foundationInstances),
          geometryVersion: project.geometryVersion + 1,
          modifiedAt: nowIso,
        },
      };
    }),
  setGeotechLayerStyle: (layerId, style) =>
    set((state) => {
      if (!state.project) return {};
      return {
        project: {
          ...state.project,
          geotechLayers: state.project.geotechLayers.map((l) =>
            l.id === layerId ? { ...l, ...style } : l
          ),
        },
      };
    }),
  setGeotechLayerBoundary: (layerId, which, boundary) =>
    set((state) => {
      if (!state.project) return {};
      const key = which === "top" ? "topBoundary" : "bottomBoundary";
      return {
        project: {
          ...state.project,
          geotechLayers: state.project.geotechLayers.map((l) =>
            l.id === layerId ? { ...l, [key]: boundary } : l
          ),
          geometryVersion: state.project.geometryVersion + 1,
          modifiedAt: new Date().toISOString(),
        },
      };
    }),
  setGeotechLayerLabel: (layerId, label) =>
    set((state) => {
      if (!state.project) return {};
      return {
        project: {
          ...state.project,
          geotechLayers: state.project.geotechLayers.map((l) => (l.id === layerId ? { ...l, ...label } : l)),
          modifiedAt: new Date().toISOString(),
        },
      };
    }),
  addGeotechLayer: () =>
    set((state) => {
      const project = state.project;
      if (!project) return {};
      const nowIso = new Date().toISOString();
      const id = `geotech-${nowIso}-${Math.random().toString(36).slice(2, 8)}`;
      const newLayer: GeotechLayer = {
        id,
        name: "New layer",
        category: "custom",
        topBoundary: { method: "terrain-relative", depthBelowTerrainM: 0 },
        bottomBoundary: { method: "terrain-relative", depthBelowTerrainM: 1 },
        colour: "#9a8a72",
        opacity: 0.3,
        visible: true,
        wireframe: false,
        source: {
          originType: "user-entered",
          verificationState: "unverified",
          modifiedAt: nowIso,
          notes: "Added by the user; not derived from any borehole or geotechnical investigation.",
        },
      };
      return {
        project: {
          ...project,
          geotechLayers: [...project.geotechLayers, newLayer],
          geometryVersion: project.geometryVersion + 1,
          modifiedAt: nowIso,
        },
      };
    }),
  removeGeotechLayer: (layerId) =>
    set((state) => {
      if (!state.project) return {};
      return {
        project: {
          ...state.project,
          geotechLayers: state.project.geotechLayers.filter((l) => l.id !== layerId),
          geometryVersion: state.project.geometryVersion + 1,
          modifiedAt: new Date().toISOString(),
        },
      };
    }),
  setGroundwaterStyle: (style) =>
    set((state) => {
      if (!state.project?.groundwater) return {};
      return { project: { ...state.project, groundwater: { ...state.project.groundwater, ...style } } };
    }),
  setGroundwaterBoundary: (boundary) =>
    set((state) => {
      if (!state.project?.groundwater) return {};
      return {
        project: {
          ...state.project,
          groundwater: { ...state.project.groundwater, boundary },
          geometryVersion: state.project.geometryVersion + 1,
          modifiedAt: new Date().toISOString(),
        },
      };
    }),
  setExcavationStyle: (excavationId, style) =>
    set((state) => {
      if (!state.project) return {};
      return {
        project: {
          ...state.project,
          excavationInstances: state.project.excavationInstances.map((e) =>
            e.id === excavationId ? { ...e, ...style } : e
          ),
        },
      };
    }),
  setExcavationParameters: (excavationId, params) =>
    set((state) => {
      if (!state.project) return {};
      const excavationInstances = state.project.excavationInstances.map((e) =>
        e.id === excavationId ? { ...e, ...params } : e
      );
      // A directly-edited bottom elevation is the user explicitly choosing
      // a dig depth -- the foundation's own base must always follow it
      // (see excavationFoundationSync.ts), never sit at a stale,
      // independently-solved elevation. If this now means the foundation
      // no longer reaches its anchor, validateFoundationInstance's
      // connection-mismatch rule is what surfaces that, not a silent block
      // here.
      const updatedExcavation = excavationInstances.find((e) => e.id === excavationId);
      const foundationInstances =
        params.bottomElevationM !== undefined && updatedExcavation
          ? syncFoundationBaseToExcavation(state.project.foundationInstances, updatedExcavation)
          : state.project.foundationInstances;
      return {
        project: {
          ...state.project,
          excavationInstances,
          foundationInstances,
          geometryVersion: state.project.geometryVersion + 1,
          modifiedAt: new Date().toISOString(),
        },
      };
    }),
  setFillStyle: (fillId, style) =>
    set((state) => {
      if (!state.project) return {};
      return {
        project: {
          ...state.project,
          fillInstances: state.project.fillInstances.map((f) => (f.id === fillId ? { ...f, ...style } : f)),
        },
      };
    }),
  setFillParameters: (fillId, params) =>
    set((state) => {
      if (!state.project) return {};
      const fillInstances = state.project.fillInstances.map((f) => (f.id === fillId ? { ...f, ...params } : f));
      // Mirrors setExcavationParameters: a directly-edited top elevation is
      // the user explicitly choosing a fill-top level -- the foundation's
      // own base must always follow it (see fillFoundationSync.ts), never
      // sit at a stale, independently-solved elevation.
      const updatedFill = fillInstances.find((f) => f.id === fillId);
      const foundationInstances =
        params.topElevationM !== undefined && updatedFill
          ? syncFoundationBaseToFill(state.project.foundationInstances, updatedFill)
          : state.project.foundationInstances;
      return {
        project: {
          ...state.project,
          fillInstances,
          foundationInstances,
          geometryVersion: state.project.geometryVersion + 1,
          modifiedAt: new Date().toISOString(),
        },
      };
    }),
  setUpliftFillStyle: (fillId, style) =>
    set((state) => {
      if (!state.project) return {};
      return {
        project: {
          ...state.project,
          upliftFillInstances: state.project.upliftFillInstances.map((f) => (f.id === fillId ? { ...f, ...style } : f)),
        },
      };
    }),
  setUpliftFillParameters: (fillId, params) =>
    set((state) => {
      if (!state.project) return {};
      // Unlike setFillParameters, this never pushes into the foundation --
      // an uplift-fill's top elevation is a free value with no foundation
      // field it corresponds to (see fillFoundationSync.ts's
      // syncUpliftFillTopsToFoundations doc comment).
      const upliftFillInstances = state.project.upliftFillInstances.map((f) =>
        f.id === fillId ? { ...f, ...params } : f
      );
      return {
        project: {
          ...state.project,
          upliftFillInstances,
          geometryVersion: state.project.geometryVersion + 1,
          modifiedAt: new Date().toISOString(),
        },
      };
    }),
  setActiveSectionId: (sectionId) => set({ activeSectionId: sectionId }),
  addSection: (mode, legId) =>
    set((state) => {
      const project = state.project;
      if (!project) return {};
      const nowIso = new Date().toISOString();
      const id = `section-${mode}-${nowIso}`;
      const name =
        mode === "leg" && legId
          ? `Section through ${legId}`
          : mode === "custom"
            ? "Custom section"
            : mode === "longitudinal"
              ? "Longitudinal (through mast centre)"
              : "Transverse (through mast centre)";
      const newSection: SectionDefinition = {
        id,
        name,
        mode,
        legId: mode === "leg" ? legId : null,
        plane: buildSectionPlane(project, mode, legId),
        pointToleranceM: 1.0,
        visible: true,
      };
      return {
        project: { ...project, sections: [...project.sections, newSection] },
        activeSectionId: id,
      };
    }),
  updateSectionPlane: (sectionId, plane) =>
    set((state) => {
      if (!state.project) return {};
      return {
        project: {
          ...state.project,
          sections: state.project.sections.map((s) => (s.id === sectionId ? { ...s, plane } : s)),
        },
      };
    }),
  setSectionPointTolerance: (sectionId, toleranceM) =>
    set((state) => {
      if (!state.project) return {};
      return {
        project: {
          ...state.project,
          sections: state.project.sections.map((s) =>
            s.id === sectionId ? { ...s, pointToleranceM: toleranceM } : s
          ),
        },
      };
    }),
  setSectionVisible: (sectionId, visible) =>
    set((state) => {
      if (!state.project) return {};
      return {
        project: {
          ...state.project,
          sections: state.project.sections.map((s) => (s.id === sectionId ? { ...s, visible } : s)),
        },
      };
    }),
  removeSection: (sectionId) =>
    set((state) => {
      if (!state.project) return {};
      const remaining = state.project.sections.filter((s) => s.id !== sectionId);
      return {
        project: { ...state.project, sections: remaining },
        activeSectionId: get().activeSectionId === sectionId ? (remaining[0]?.id ?? null) : get().activeSectionId,
      };
    }),
  setHorizontalClipEnabled: (enabled) =>
    set((state) => ({ horizontalClip: { ...state.horizontalClip, enabled } })),
  setHorizontalClipElevation: (elevationLocalZ) =>
    set((state) => ({ horizontalClip: { ...state.horizontalClip, elevationLocalZ } })),
  startMeasurement: (kind) => set({ pendingMeasurement: { kind, points: [] } }),
  cancelMeasurement: () => set({ pendingMeasurement: null }),
  pickMeasurementPoint: (local) =>
    set((state) => {
      const project = state.project;
      const pending = state.pendingMeasurement;
      if (!project || !pending) return {};

      const localFrame: LocalFrameDefinition = {
        mastCentreProject: project.mastCentreProject,
        lineBearingRadians: project.lineBearingRadians,
      };
      const point: MeasurementPointRecord = { local, project: localToProject(local, localFrame) };
      const points = [...pending.points, point];

      if (points.length < requiredPointCount(pending.kind)) {
        return { pendingMeasurement: { kind: pending.kind, points } };
      }

      const measurement = buildPointBasedMeasurement(pending.kind, points, project);
      if (!measurement) return { pendingMeasurement: null };

      return {
        pendingMeasurement: null,
        project: { ...project, measurements: [...project.measurements, measurement] },
      };
    }),
  addFoundationClearanceMeasurement: (kind, instanceId, geotechLayerId) =>
    set((state) => {
      const project = state.project;
      if (!project || !project.terrainSurface) return {};
      const foundation = project.foundationInstances.find((f) => f.instanceId === instanceId);
      if (!foundation) return {};

      const nowIso = new Date().toISOString();
      const localFrame: LocalFrameDefinition = {
        mastCentreProject: project.mastCentreProject,
        lineBearingRadians: project.lineBearingRadians,
      };
      const foundationBaseLocal = localCoordinate(foundation.position.x, foundation.position.y, foundation.baseElevation);
      const basePoint: MeasurementPointRecord = {
        local: foundationBaseLocal,
        project: localToProject(foundationBaseLocal, localFrame),
      };

      let resultValue: number | null = null;
      let label: string;
      let relatedObjectIds: string[];

      if (kind === "foundation-to-bearing-layer") {
        const layer = geotechLayerId
          ? project.geotechLayers.find((l) => l.id === geotechLayerId)
          : project.geotechLayers.find((l) => l.category === "competent-bearing") ?? project.geotechLayers[0];
        if (!layer) return {};
        resultValue = measureFoundationToBearingLayerClearance(
          foundation,
          layer,
          project.terrainSurface,
          project.mastCentreProject.elevation
        );
        label = `${foundation.displayLabel} base to "${layer.name}" clearance`;
        relatedObjectIds = [foundation.instanceId, layer.id];
      } else {
        if (!project.groundwater) return {};
        resultValue = measureFoundationToGroundwaterSeparation(
          foundation,
          project.groundwater,
          project.terrainSurface,
          project.mastCentreProject.elevation
        );
        label = `${foundation.displayLabel} base to groundwater separation`;
        relatedObjectIds = [foundation.instanceId, project.groundwater.id];
      }

      const measurement: Measurement = {
        id: `measurement-${nowIso}-${Math.random().toString(36).slice(2, 8)}`,
        kind,
        label,
        points: [basePoint],
        resultValue,
        resultUnit: "m",
        relatedObjectIds,
        geometryVersionAtCalculation: project.geometryVersion,
        calculatedAtIso: nowIso,
      };

      return { project: { ...project, measurements: [...project.measurements, measurement] } };
    }),
  removeMeasurement: (measurementId) =>
    set((state) => {
      if (!state.project) return {};
      return {
        project: {
          ...state.project,
          measurements: state.project.measurements.filter((m) => m.id !== measurementId),
        },
      };
    }),
  recalculateMeasurement: (measurementId) =>
    set((state) => {
      const project = state.project;
      if (!project) return {};
      const existing = project.measurements.find((m) => m.id === measurementId);
      if (!existing) return {};

      const nowIso = new Date().toISOString();
      let updated: Measurement;

      if (existing.kind === "foundation-to-bearing-layer" || existing.kind === "foundation-to-groundwater") {
        const foundationId = existing.relatedObjectIds?.[0];
        const foundation = project.foundationInstances.find((f) => f.instanceId === foundationId);
        if (!foundation || !project.terrainSurface) return {};

        let resultValue: number | null = null;
        if (existing.kind === "foundation-to-bearing-layer") {
          const layerId = existing.relatedObjectIds?.[1];
          const layer = project.geotechLayers.find((l) => l.id === layerId);
          if (!layer) return {};
          resultValue = measureFoundationToBearingLayerClearance(
            foundation,
            layer,
            project.terrainSurface,
            project.mastCentreProject.elevation
          );
        } else {
          if (!project.groundwater) return {};
          resultValue = measureFoundationToGroundwaterSeparation(
            foundation,
            project.groundwater,
            project.terrainSurface,
            project.mastCentreProject.elevation
          );
        }
        updated = {
          ...existing,
          resultValue,
          geometryVersionAtCalculation: project.geometryVersion,
          calculatedAtIso: nowIso,
        };
      } else {
        const recalculated = buildPointBasedMeasurement(existing.kind, existing.points, project);
        if (!recalculated) return {};
        updated = { ...recalculated, id: existing.id, label: existing.label };
      }

      return {
        project: {
          ...project,
          measurements: project.measurements.map((m) => (m.id === measurementId ? updated : m)),
        },
      };
    }),
}));

function buildPointBasedMeasurement(
  kind: MeasurementKind,
  points: readonly MeasurementPointRecord[],
  project: Project
): Measurement | null {
  const nowIso = new Date().toISOString();
  const id = `measurement-${nowIso}-${Math.random().toString(36).slice(2, 8)}`;
  const base = {
    id,
    points,
    geometryVersionAtCalculation: project.geometryVersion,
    calculatedAtIso: nowIso,
  };

  const p0 = points[0];
  const p1 = points[1];
  if (!p0) return null;

  switch (kind) {
    case "point-coordinate":
      return {
        ...base,
        kind,
        label: `Point (${p0.local.x.toFixed(2)}, ${p0.local.y.toFixed(2)}, ${p0.local.z.toFixed(2)})`,
        resultValue: null,
        resultUnit: "m",
      };
    case "elevation":
      return {
        ...base,
        kind,
        label: "Elevation",
        resultValue: p0.local.z,
        resultUnit: "m",
      };
    case "depth-below-terrain": {
      if (!project.terrainSurface) return null;
      const depth = measureDepthBelowTerrain(p0.local, project.terrainSurface);
      return { ...base, kind, label: "Depth below terrain", resultValue: depth, resultUnit: "m" };
    }
    case "horizontal-distance": {
      if (!p1) return null;
      return {
        ...base,
        kind,
        label: "Horizontal distance",
        resultValue: measureHorizontalDistance(p0.local, p1.local),
        resultUnit: "m",
      };
    }
    case "three-d-distance": {
      if (!p1) return null;
      return {
        ...base,
        kind,
        label: "3D distance",
        resultValue: measureThreeDDistance(p0.local, p1.local),
        resultUnit: "m",
      };
    }
    case "vertical-difference": {
      if (!p1) return null;
      return {
        ...base,
        kind,
        label: "Vertical difference",
        resultValue: measureVerticalDifference(p0.local, p1.local),
        resultUnit: "m",
      };
    }
    case "slope": {
      if (!p1) return null;
      const slope = measureSlope(p0.local, p1.local);
      const angleDeg = (slope.angleFromHorizontalRadians * 180) / Math.PI;
      return {
        ...base,
        kind,
        label: "Slope",
        resultValue: slope.ratioHtoV,
        resultUnit: "ratio",
        ...(slope.percentGrade !== null
          ? { resultDetail: `${slope.percentGrade.toFixed(1)}% grade, ${angleDeg.toFixed(1)} deg` }
          : {}),
      };
    }
    case "foundation-to-bearing-layer":
    case "foundation-to-groundwater":
      return null; // built by addFoundationClearanceMeasurement, not point picking
  }
}
