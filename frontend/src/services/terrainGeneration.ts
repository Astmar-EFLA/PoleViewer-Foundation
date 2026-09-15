import type { CoordinateReferenceSystem, ProjectCoordinate } from "../domain/coordinates";
import type {
  ClassificationCount,
  PointCloudSourceReference,
  ProcessingWarning,
  TerrainGenerationSettings,
} from "../domain/pointCloud";
import type { TerrainPoint, TerrainSurface } from "../domain/terrain";
import { measureSync } from "../geometry/perf";
import { generateTin } from "../geometry/terrain";
import { DEFAULT_BACKEND_BASE_URL, requestClip } from "./backendClient";

export interface TerrainGenerationResult {
  readonly terrainSurface: TerrainSurface;
  readonly warnings: readonly ProcessingWarning[];
  readonly classificationCounts: readonly ClassificationCount[];
  readonly sourcePointCount: number;
  readonly clippedPointCount: number;
  /** Time spent building the TIN client-side (Phase 9 performance instrumentation) -- distinct from the backend's own reported clip duration, so a slow regeneration can be attributed to the right half of the pipeline. */
  readonly tinGenerationDurationMs: number;
}

export interface TerrainGenerationProjectContext {
  readonly mastCentreProject: ProjectCoordinate;
  readonly lineBearingRadians: number;
  readonly crs: CoordinateReferenceSystem;
}

/**
 * Orchestrates the real (non-synthetic) terrain pipeline: request a clip
 * from the local backend (PDAL-backed, see backend/app/processing/las_clip.py),
 * then run the same TIN generator used for the Phase 1 synthetic demo
 * (geometry/terrain.ts) on the returned, already-local-coordinate points.
 * The backend's own warnings (CRS issues, empty clip, etc.) are passed
 * through unmodified -- this function does not swallow or reinterpret them.
 */
export async function generateTerrainFromPointCloud(
  project: TerrainGenerationProjectContext,
  source: PointCloudSourceReference,
  settings: TerrainGenerationSettings,
  nowIso: string,
  baseUrl: string = DEFAULT_BACKEND_BASE_URL,
  signal?: AbortSignal
): Promise<TerrainGenerationResult> {
  const clipResult = await requestClip(
    {
      filePath: source.filePath,
      projectCrs: project.crs,
      localFrame: {
        mastCentreProject: project.mastCentreProject,
        lineBearingRadians: project.lineBearingRadians,
      },
      boundary: { shape: "rectangular", ...settings.clipBoundary },
      classificationFilter: settings.classificationFilter as number[] | null,
      decimationStep: settings.decimationStep,
    },
    baseUrl,
    signal
  );

  const groundPoints: TerrainPoint[] = clipResult.points.map((p) => ({ x: p.x, y: p.y, z: p.z }));

  const { result: terrainSurface, durationMs: tinGenerationDurationMs } = measureSync(() =>
    generateTin(groundPoints, {
      maxEdgeLengthM: settings.maxEdgeLengthM,
      terrainVersion: `terrain-${nowIso}`,
      generatedAtIso: nowIso,
    })
  );

  return {
    terrainSurface,
    warnings: clipResult.warnings,
    classificationCounts: clipResult.classificationCounts,
    sourcePointCount: clipResult.sourcePointCount,
    clippedPointCount: clipResult.clippedPointCount,
    tinGenerationDurationMs,
  };
}
