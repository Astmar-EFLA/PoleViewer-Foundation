import { afterEach, describe, expect, it, vi } from "vitest";
import { projectCoordinate } from "../domain/coordinates";
import { DEFAULT_CLIP_BOUNDARY } from "../domain/pointCloud";
import { BackendClipBlockedError, BackendRequestError, requestClip, requestInspect } from "./backendClient";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const VALID_CLIP_REQUEST = {
  filePath: "pointcloud-mixed-classification.las",
  projectCrs: { kind: "epsg" as const, epsgCode: 3057 },
  localFrame: {
    mastCentreProject: projectCoordinate(512_345.678, 487_654.321, 123.456),
    lineBearingRadians: 0,
  },
  boundary: { shape: "rectangular" as const, ...DEFAULT_CLIP_BOUNDARY },
  classificationFilter: [2],
  decimationStep: null,
};

const VALID_CLIP_RESULT_BODY = {
  points: [{ x: 1, y: 2, z: 3, classification: 2 }],
  sourcePointCount: 1646,
  clippedPointCount: 400,
  returnedPointCount: 400,
  classificationCounts: [{ classificationCode: 2, pointCount: 400 }],
  warnings: [],
  processingMetadata: {
    filePath: "pointcloud-mixed-classification.las",
    boundary: { shape: "rectangular", ...DEFAULT_CLIP_BOUNDARY },
    classificationFilter: [2],
    decimationStep: null,
    durationMs: 12.5,
  },
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("requestClip", () => {
  it("returns validated data on success", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, VALID_CLIP_RESULT_BODY));
    vi.stubGlobal("fetch", fetchMock);

    const result = await requestClip(VALID_CLIP_REQUEST);
    expect(result.clippedPointCount).toBe(400);
    expect(fetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:8100/pointcloud/clip",
      expect.objectContaining({ method: "POST" })
    );
  });

  it("throws BackendRequestError when the network request itself fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new TypeError("Failed to fetch"))
    );

    await expect(requestClip(VALID_CLIP_REQUEST)).rejects.toBeInstanceOf(BackendRequestError);
  });

  it("throws BackendRequestError when the response fails schema validation", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(200, { unexpected: "shape" })));

    await expect(requestClip(VALID_CLIP_REQUEST)).rejects.toThrow(/failed validation/);
  });

  it("throws BackendClipBlockedError with structured warnings on a 422 block response", async () => {
    // Real shape returned by FastAPI's HTTPException(status_code=422,
    // detail={"message": ..., "warnings": [...]}) -- the structured body
    // is nested one level under "detail", not at the response's top
    // level. A previous version of this test used an unrealistic
    // un-nested body and passed while the production code was actually
    // broken against the real backend (see backendClient.ts's
    // blockedWarningsFromResponseBody) -- verified against the real
    // running backend before fixing this test.
    const blockedBody = {
      detail: {
        message: "Clip request blocked: CRS mismatch.",
        warnings: [
          { code: "pointcloud.crs-mismatch", severity: "blocking", message: "File CRS does not match project CRS." },
        ],
      },
    };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(422, blockedBody)));

    const error = await requestClip(VALID_CLIP_REQUEST).catch((e) => e);
    expect(error).toBeInstanceOf(BackendClipBlockedError);
    expect((error as BackendClipBlockedError).warnings[0]?.code).toBe("pointcloud.crs-mismatch");
  });

  it("throws a plain BackendRequestError (not BackendClipBlockedError) for a 422 without a warnings body", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(422, { detail: "Some other 422 reason." })));

    const error = await requestClip(VALID_CLIP_REQUEST).catch((e) => e);
    expect(error).toBeInstanceOf(BackendRequestError);
    expect(error).not.toBeInstanceOf(BackendClipBlockedError);
    expect((error as BackendRequestError).message).toContain("Some other 422 reason.");
  });
});

describe("postJson error messages", () => {
  it("includes the backend's detail string in the thrown error message", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse(404, { detail: "File not found in workspace: x.pol" }))
    );

    const error = await requestInspect("x.pol").catch((e) => e);
    expect(error).toBeInstanceOf(BackendRequestError);
    expect((error as BackendRequestError).message).toContain("File not found in workspace: x.pol");
  });

  it("falls back to a generic message when the body has no usable detail", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(500, { unexpected: "shape" })));

    const error = await requestInspect("x.las").catch((e) => e);
    expect((error as BackendRequestError).message).toMatch(/failed with status 500/);
  });
});

describe("requestInspect", () => {
  it("returns validated metadata on success", async () => {
    const body = {
      filePath: "pointcloud-mixed-classification.las",
      pointCount: 1646,
      boundsProject: {
        minEasting: 512_310.678,
        maxEasting: 512_380.678,
        minNorthing: 487_619.321,
        maxNorthing: 487_689.321,
        minElevation: 122.056,
        maxElevation: 130.262,
      },
      scale: [0.001, 0.001, 0.001],
      offset: [512_345.678, 487_654.321, 123.456],
      availableDimensions: ["X", "Y", "Z", "Classification"],
      crs: { kind: "epsg", epsgCode: 3057 },
      classificationCounts: [{ classificationCode: 2, pointCount: 1296 }],
      hasRgb: true,
      hasReturnInformation: true,
      warnings: [],
    };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(200, body)));

    const result = await requestInspect("pointcloud-mixed-classification.las");
    expect(result.pointCount).toBe(1646);
    expect(result.crs).toEqual({ kind: "epsg", epsgCode: 3057 });
  });
});
