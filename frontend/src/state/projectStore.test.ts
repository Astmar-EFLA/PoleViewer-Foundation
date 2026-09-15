import { afterEach, describe, expect, it, vi } from "vitest";
import { buildSyntheticDemoProject } from "../services/buildSyntheticDemoProject";
import { useProjectStore } from "./projectStore";

/**
 * Phase 9 acceptance criterion: "processing can be cancelled or stopped
 * safely." These exercise the real store actions against a `fetch` that
 * never resolves on its own (simulating a slow/hung backend) and confirm
 * cancelling actually aborts the in-flight request and returns the store
 * to a clean, non-loading state -- not just that a cancel button exists.
 */

function hangingFetchThatRejectsOnAbort() {
  return vi.fn((_url: string, init?: RequestInit) => {
    return new Promise((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => {
        reject(new DOMException("Aborted", "AbortError"));
      });
    });
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("checkPointCloudAssetStatus cancellation", () => {
  it("cancelAssetStatusCheck aborts an in-flight check and returns the store to idle", async () => {
    vi.stubGlobal("fetch", hangingFetchThatRejectsOnAbort());
    useProjectStore.getState().setProject(buildSyntheticDemoProject());

    const checkPromise = useProjectStore.getState().checkPointCloudAssetStatus();
    expect(useProjectStore.getState().assetStatus.status).toBe("loading");

    useProjectStore.getState().cancelAssetStatusCheck();
    await checkPromise;

    expect(useProjectStore.getState().assetStatus.status).toBe("idle");
    expect(useProjectStore.getState().assetStatusController).toBeNull();
  });

  it("starting a new check aborts a previous one still in flight", async () => {
    // First call hangs until aborted; every subsequent call resolves
    // immediately -- so the second (superseding) check can actually
    // complete while the first is left aborted, rather than both hanging.
    let callCount = 0;
    const fetchMock = vi.fn((_url: string, init?: RequestInit) => {
      callCount += 1;
      if (callCount === 1) {
        return new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
        });
      }
      return Promise.resolve(
        new Response(JSON.stringify({ filePath: "x.las", exists: true, sizeBytes: 10, sha256: "a".repeat(64) }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      );
    });
    vi.stubGlobal("fetch", fetchMock);
    useProjectStore.getState().setProject(buildSyntheticDemoProject());

    const firstPromise = useProjectStore.getState().checkPointCloudAssetStatus();
    const firstController = useProjectStore.getState().assetStatusController;
    const secondPromise = useProjectStore.getState().checkPointCloudAssetStatus();

    await Promise.all([firstPromise, secondPromise]);
    expect(firstController?.signal.aborted).toBe(true);
    expect(useProjectStore.getState().assetStatus.status).toBe("success");
  });
});

describe("regenerateTerrainFromPointCloud cancellation", () => {
  it("cancelTerrainRegeneration aborts an in-flight regeneration and returns the store to idle", async () => {
    vi.stubGlobal("fetch", hangingFetchThatRejectsOnAbort());
    useProjectStore.getState().setProject(buildSyntheticDemoProject());

    const regenPromise = useProjectStore.getState().regenerateTerrainFromPointCloud();
    expect(useProjectStore.getState().terrainRegeneration.status).toBe("loading");

    useProjectStore.getState().cancelTerrainRegeneration();
    await regenPromise;

    expect(useProjectStore.getState().terrainRegeneration.status).toBe("idle");
    expect(useProjectStore.getState().terrainRegenerationController).toBeNull();
  });
});
