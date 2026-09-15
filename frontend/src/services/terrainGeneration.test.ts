import { afterEach, describe, expect, it, vi } from "vitest";
import { projectCoordinate } from "../domain/coordinates";
import { DEFAULT_TERRAIN_GENERATION_SETTINGS } from "../domain/pointCloud";
import { generateTerrainFromPointCloud } from "./terrainGeneration";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

const PROJECT_CONTEXT = {
  mastCentreProject: projectCoordinate(512_345.678, 487_654.321, 123.456),
  lineBearingRadians: 0,
  crs: { kind: "epsg" as const, epsgCode: 3057 },
};

const SOURCE = { filePath: "pointcloud-mixed-classification.las", crs: { kind: "epsg" as const, epsgCode: 3057 } };

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("generateTerrainFromPointCloud", () => {
  it("maps clipped backend points into a TIN and passes through backend warnings/counts unmodified", async () => {
    const backendBody = {
      points: [
        { x: 0, y: 0, z: 1.0, classification: 2 },
        { x: 3, y: 0, z: 1.5, classification: 2 },
        { x: 0, y: 3, z: 2.0, classification: 2 },
        { x: 3, y: 3, z: 2.5, classification: 2 },
      ],
      sourcePointCount: 1646,
      clippedPointCount: 4,
      returnedPointCount: 4,
      classificationCounts: [{ classificationCode: 2, pointCount: 4 }],
      warnings: [{ code: "pointcloud.no-ground-classification", severity: "warning", message: "test warning" }],
      processingMetadata: {
        filePath: SOURCE.filePath,
        boundary: { shape: "rectangular", widthM: 40, lengthM: 40, centerOffsetLocal: { x: 0, y: 0 }, rotationRadians: 0 },
        classificationFilter: [2],
        decimationStep: null,
        durationMs: 5,
      },
    };
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, backendBody));
    vi.stubGlobal("fetch", fetchMock);

    const result = await generateTerrainFromPointCloud(
      PROJECT_CONTEXT,
      SOURCE,
      DEFAULT_TERRAIN_GENERATION_SETTINGS,
      "2026-09-15T00:00:00.000Z"
    );

    expect(result.terrainSurface.points).toHaveLength(4);
    expect(result.terrainSurface.triangles.length).toBeGreaterThan(0);
    expect(result.sourcePointCount).toBe(1646);
    expect(result.clippedPointCount).toBe(4);
    expect(result.warnings).toEqual(backendBody.warnings);
    expect(result.classificationCounts).toEqual(backendBody.classificationCounts);

    // request body sent to the backend reflects the project + settings passed in
    const [, init] = fetchMock.mock.calls[0]!;
    const sentBody = JSON.parse(init.body as string);
    expect(sentBody.filePath).toBe(SOURCE.filePath);
    expect(sentBody.classificationFilter).toEqual([2]);
    expect(sentBody.localFrame.mastCentreProject.easting).toBe(512_345.678);
  });

  it("uses the requested maxEdgeLengthM when generating the TIN", async () => {
    const backendBody = {
      points: [
        { x: 0, y: 0, z: 0, classification: 2 },
        { x: 100, y: 0, z: 0, classification: 2 },
        { x: 0, y: 100, z: 0, classification: 2 },
      ],
      sourcePointCount: 3,
      clippedPointCount: 3,
      returnedPointCount: 3,
      classificationCounts: [{ classificationCode: 2, pointCount: 3 }],
      warnings: [],
      processingMetadata: {
        filePath: SOURCE.filePath,
        boundary: { shape: "rectangular", widthM: 40, lengthM: 40, centerOffsetLocal: { x: 0, y: 0 }, rotationRadians: 0 },
        classificationFilter: [2],
        decimationStep: null,
        durationMs: 1,
      },
    };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(200, backendBody)));

    // Triangle edges here are ~100-140m; a small maxEdgeLengthM should reject it.
    const result = await generateTerrainFromPointCloud(
      PROJECT_CONTEXT,
      SOURCE,
      { ...DEFAULT_TERRAIN_GENERATION_SETTINGS, maxEdgeLengthM: 5 },
      "2026-09-15T00:00:00.000Z"
    );

    expect(result.terrainSurface.triangles).toHaveLength(0);
    expect(result.terrainSurface.rejectedTriangleCount).toBeGreaterThan(0);
  });
});
