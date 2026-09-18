import { afterEach, describe, expect, it, vi } from "vitest";
import { buildSyntheticDemoProject } from "../services/buildSyntheticDemoProject";
import { loadSyntheticFixtureJson } from "../tests/fixtures";
import { useProjectStore } from "./projectStore";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

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

describe("importPoleModel", () => {
  it("replaces the pole model and rebuilds foundations/excavations/sections/measurements for the new legs", () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse(200, loadSyntheticFixtureJson("pole-portal-2leg.json")))
    );
    const demo = buildSyntheticDemoProject();
    useProjectStore.getState().setProject(demo);
    const originalGeometryVersion = demo.geometryVersion;
    // The demo project's own pole model has 4 legs (leg-ne/se/sw/nw); the
    // imported one (pole-portal-2leg.json) has 2 legs (leg-a/leg-b) plus 2
    // guy-ground-anchor anchors -- a real structural change, not a no-op swap.
    expect(demo.foundationInstances).toHaveLength(4);

    return useProjectStore
      .getState()
      .importPoleModel("some-model.pol")
      .then(() => {
        const project = useProjectStore.getState().project!;
        expect(project.poleModel.modelId).toBe("synthetic-portal-2leg-001");
        expect(project.foundationInstances).toHaveLength(4);
        expect(
          project.foundationInstances
            .filter((f) => f.legId !== null)
            .map((f) => f.legId)
            .sort()
        ).toEqual(["leg-a", "leg-b"]);
        expect(project.foundationInstances.filter((f) => f.legId === null)).toHaveLength(2);
        expect(project.excavationInstances).toHaveLength(4);
        expect(project.excavationInstances.every((e) => project.foundationInstances.some((f) => f.instanceId === e.foundationInstanceId))).toBe(true);
        expect(project.fillInstances).toHaveLength(4);
        expect(project.fillInstances.every((fl) => project.foundationInstances.some((f) => f.instanceId === fl.foundationInstanceId))).toBe(true);
        expect(project.upliftFillInstances).toHaveLength(4);
        expect(project.upliftFillInstances.every((fl) => project.foundationInstances.some((f) => f.instanceId === fl.foundationInstanceId))).toBe(true);
        expect(project.sections.map((s) => s.id)).toEqual(["section-longitudinal", "section-transverse"]);
        expect(project.measurements).toEqual([]);
        expect(project.geometryVersion).toBe(originalGeometryVersion + 1);
        expect(useProjectStore.getState().poleModelImport.status).toBe("success");
        expect(useProjectStore.getState().selectedFoundationInstanceId).toBeNull();
      });
  });

  it("surfaces a backend error without touching the existing project", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    const demo = buildSyntheticDemoProject();
    useProjectStore.getState().setProject(demo);

    await useProjectStore.getState().importPoleModel("missing.pol");

    expect(useProjectStore.getState().poleModelImport.status).toBe("error");
    expect(useProjectStore.getState().project?.poleModel.modelId).toBe(demo.poleModel.modelId);
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

describe("excavation bottom / foundation base elevation stay locked together", () => {
  it("editing an excavation's bottom elevation pulls its own foundation's base to match", () => {
    useProjectStore.getState().setProject(buildSyntheticDemoProject());
    const excavation = useProjectStore.getState().project!.excavationInstances[0]!;
    const newBottom = excavation.bottomElevationM - 0.7;

    useProjectStore.getState().setExcavationParameters(excavation.id, { bottomElevationM: newBottom });

    const project = useProjectStore.getState().project!;
    const updatedExcavation = project.excavationInstances.find((e) => e.id === excavation.id)!;
    const updatedFoundation = project.foundationInstances.find(
      (f) => f.instanceId === updatedExcavation.foundationInstanceId
    )!;
    expect(updatedExcavation.bottomElevationM).toBe(newBottom);
    expect(updatedFoundation.baseElevation).toBe(newBottom);
  });

  it("editing an excavation's working space (not bottom elevation) leaves the foundation's base untouched", () => {
    useProjectStore.getState().setProject(buildSyntheticDemoProject());
    const excavation = useProjectStore.getState().project!.excavationInstances[0]!;
    const foundationBefore = useProjectStore
      .getState()
      .project!.foundationInstances.find((f) => f.instanceId === excavation.foundationInstanceId)!;

    useProjectStore.getState().setExcavationParameters(excavation.id, { workingSpaceOffsetM: 1.2 });

    const foundationAfter = useProjectStore
      .getState()
      .project!.foundationInstances.find((f) => f.instanceId === excavation.foundationInstanceId)!;
    expect(foundationAfter.baseElevation).toBe(foundationBefore.baseElevation);
  });

  it("changing a foundation's type (re-solving its base elevation) pulls its own excavation's bottom to match", () => {
    useProjectStore.getState().setProject(buildSyntheticDemoProject());
    const foundation = useProjectStore.getState().project!.foundationInstances[0]!;
    const otherTypeId =
      foundation.foundationTypeId === "rectangular-pad-pedestal-v1"
        ? "stepped-rectangular-v1"
        : "rectangular-pad-pedestal-v1";

    useProjectStore.getState().setFoundationType(foundation.instanceId, otherTypeId);

    const project = useProjectStore.getState().project!;
    const updatedFoundation = project.foundationInstances.find((f) => f.instanceId === foundation.instanceId)!;
    const updatedExcavation = project.excavationInstances.find(
      (e) => e.foundationInstanceId === foundation.instanceId
    )!;
    // The type change re-solves baseElevation for the new geometry -- confirm it actually
    // changed (otherwise this test would pass trivially), then confirm the excavation followed it.
    expect(updatedFoundation.baseElevation).not.toBe(foundation.baseElevation);
    expect(updatedExcavation.bottomElevationM).toBe(updatedFoundation.baseElevation);
  });
});

describe("fill top / foundation base elevation stay locked together", () => {
  it("editing a fill's top elevation pulls its own foundation's base to match", () => {
    useProjectStore.getState().setProject(buildSyntheticDemoProject());
    const fill = useProjectStore.getState().project!.fillInstances[0]!;
    const newTop = fill.topElevationM + 1.1;

    useProjectStore.getState().setFillParameters(fill.id, { topElevationM: newTop });

    const project = useProjectStore.getState().project!;
    const updatedFill = project.fillInstances.find((f) => f.id === fill.id)!;
    const updatedFoundation = project.foundationInstances.find(
      (f) => f.instanceId === updatedFill.foundationInstanceId
    )!;
    expect(updatedFill.topElevationM).toBe(newTop);
    expect(updatedFoundation.baseElevation).toBe(newTop);
  });

  it("editing a fill's working space (not top elevation) leaves the foundation's base untouched", () => {
    useProjectStore.getState().setProject(buildSyntheticDemoProject());
    const fill = useProjectStore.getState().project!.fillInstances[0]!;
    const foundationBefore = useProjectStore
      .getState()
      .project!.foundationInstances.find((f) => f.instanceId === fill.foundationInstanceId)!;

    useProjectStore.getState().setFillParameters(fill.id, { workingSpaceOffsetM: 1.2 });

    const foundationAfter = useProjectStore
      .getState()
      .project!.foundationInstances.find((f) => f.instanceId === fill.foundationInstanceId)!;
    expect(foundationAfter.baseElevation).toBe(foundationBefore.baseElevation);
  });

  it("setFillStyle only changes style fields, never geometryVersion", () => {
    useProjectStore.getState().setProject(buildSyntheticDemoProject());
    const before = useProjectStore.getState().project!;
    const fill = before.fillInstances[0]!;

    useProjectStore.getState().setFillStyle(fill.id, { visible: true, opacity: 0.6 });

    const after = useProjectStore.getState().project!;
    const updatedFill = after.fillInstances.find((f) => f.id === fill.id)!;
    expect(updatedFill.visible).toBe(true);
    expect(updatedFill.opacity).toBe(0.6);
    expect(after.geometryVersion).toBe(before.geometryVersion);
  });

  it("changing a foundation's type (re-solving its base elevation) pulls its own fill's top to match", () => {
    useProjectStore.getState().setProject(buildSyntheticDemoProject());
    const foundation = useProjectStore.getState().project!.foundationInstances[0]!;
    const otherTypeId =
      foundation.foundationTypeId === "rectangular-pad-pedestal-v1"
        ? "stepped-rectangular-v1"
        : "rectangular-pad-pedestal-v1";

    useProjectStore.getState().setFoundationType(foundation.instanceId, otherTypeId);

    const project = useProjectStore.getState().project!;
    const updatedFoundation = project.foundationInstances.find((f) => f.instanceId === foundation.instanceId)!;
    const updatedFill = project.fillInstances.find((f) => f.foundationInstanceId === foundation.instanceId)!;
    expect(updatedFoundation.baseElevation).not.toBe(foundation.baseElevation);
    expect(updatedFill.topElevationM).toBe(updatedFoundation.baseElevation);
  });
});

describe("uplift-fill top follows the foundation's own top, one-directionally", () => {
  it("defaults to the foundation's top (pad + pedestal/column), not its base", () => {
    useProjectStore.getState().setProject(buildSyntheticDemoProject());
    const project = useProjectStore.getState().project!;
    const upliftFill = project.upliftFillInstances[0]!;
    const foundation = project.foundationInstances.find((f) => f.instanceId === upliftFill.foundationInstanceId)!;

    expect(upliftFill.topElevationM).not.toBe(foundation.baseElevation);
    expect(upliftFill.topElevationM).toBeGreaterThan(foundation.baseElevation);
  });

  it("editing an uplift-fill's top elevation does NOT change its foundation's base (unlike the base fill)", () => {
    useProjectStore.getState().setProject(buildSyntheticDemoProject());
    const upliftFill = useProjectStore.getState().project!.upliftFillInstances[0]!;
    const foundationBefore = useProjectStore
      .getState()
      .project!.foundationInstances.find((f) => f.instanceId === upliftFill.foundationInstanceId)!;
    const newTop = upliftFill.topElevationM + 2.0;

    useProjectStore.getState().setUpliftFillParameters(upliftFill.id, { topElevationM: newTop });

    const project = useProjectStore.getState().project!;
    const updatedUpliftFill = project.upliftFillInstances.find((f) => f.id === upliftFill.id)!;
    const foundationAfter = project.foundationInstances.find((f) => f.instanceId === upliftFill.foundationInstanceId)!;
    expect(updatedUpliftFill.topElevationM).toBe(newTop);
    expect(foundationAfter.baseElevation).toBe(foundationBefore.baseElevation);
  });

  it("setUpliftFillStyle only changes style fields, never geometryVersion", () => {
    useProjectStore.getState().setProject(buildSyntheticDemoProject());
    const before = useProjectStore.getState().project!;
    const upliftFill = before.upliftFillInstances[0]!;

    useProjectStore.getState().setUpliftFillStyle(upliftFill.id, { visible: true, opacity: 0.6 });

    const after = useProjectStore.getState().project!;
    const updated = after.upliftFillInstances.find((f) => f.id === upliftFill.id)!;
    expect(updated.visible).toBe(true);
    expect(updated.opacity).toBe(0.6);
    expect(after.geometryVersion).toBe(before.geometryVersion);
  });

  it("changing a foundation's type (re-solving its geometry) pulls its own uplift-fill's top to match the new top-of-foundation", () => {
    useProjectStore.getState().setProject(buildSyntheticDemoProject());
    const foundation = useProjectStore.getState().project!.foundationInstances[0]!;
    const otherTypeId =
      foundation.foundationTypeId === "rectangular-pad-pedestal-v1"
        ? "stepped-rectangular-v1"
        : "rectangular-pad-pedestal-v1";

    useProjectStore.getState().setFoundationType(foundation.instanceId, otherTypeId);

    const project = useProjectStore.getState().project!;
    const updatedFoundation = project.foundationInstances.find((f) => f.instanceId === foundation.instanceId)!;
    const updatedUpliftFill = project.upliftFillInstances.find(
      (f) => f.foundationInstanceId === foundation.instanceId
    )!;
    expect(updatedUpliftFill.topElevationM).toBeGreaterThan(updatedFoundation.baseElevation);
  });
});

describe("setPoleModelHeightOffset", () => {
  it("moves the pole model and re-solves every foundation's base elevation (and its excavation's bottom) to follow the raised/lowered anchors", () => {
    useProjectStore.getState().setProject(buildSyntheticDemoProject());
    const before = useProjectStore.getState().project!;
    const foundationsBefore = before.foundationInstances;
    const newZ = before.poleModel.localOrigin.z + 2.5;

    useProjectStore.getState().setPoleModelHeightOffset(newZ);

    const after = useProjectStore.getState().project!;
    expect(after.poleModel.localOrigin.z).toBe(newZ);

    for (const foundationBefore of foundationsBefore) {
      const foundationAfter = after.foundationInstances.find((f) => f.instanceId === foundationBefore.instanceId)!;
      expect(foundationAfter.baseElevation).toBeCloseTo(foundationBefore.baseElevation + 2.5, 9);
      // Horizontal placement and type/parameters are untouched -- only the anchor's own vertical move.
      expect(foundationAfter.position).toEqual(foundationBefore.position);
      expect(foundationAfter.foundationTypeId).toBe(foundationBefore.foundationTypeId);

      const excavationAfter = after.excavationInstances.find((e) => e.foundationInstanceId === foundationAfter.instanceId);
      if (excavationAfter) expect(excavationAfter.bottomElevationM).toBe(foundationAfter.baseElevation);

      const fillAfter = after.fillInstances.find((fl) => fl.foundationInstanceId === foundationAfter.instanceId);
      if (fillAfter) expect(fillAfter.topElevationM).toBe(foundationAfter.baseElevation);

      const upliftFillBefore = before.upliftFillInstances.find(
        (fl) => fl.foundationInstanceId === foundationBefore.instanceId
      );
      const upliftFillAfter = after.upliftFillInstances.find(
        (fl) => fl.foundationInstanceId === foundationAfter.instanceId
      );
      if (upliftFillBefore && upliftFillAfter) {
        expect(upliftFillAfter.topElevationM).toBeCloseTo(upliftFillBefore.topElevationM + 2.5, 9);
      }
    }
  });
});

describe("whole-line import", () => {
  const CSV = [
    "mastName,easting,northing,elevation,modelPath,bearingLayerDepthM,groundwaterDepthM",
    "8-B-BS,512345.678,487654.321,123.456,8-B-BS.pol,3.0,2.1",
    "9-B-BS,512410.2,487720.9,121.0,9-B-BS.pol,3.5,2.4",
  ].join("\n");

  function csvFile(text: string): File {
    return new File([text], "line.csv", { type: "text/csv" });
  }

  it("importLineCsv parses a valid CSV into ordered mast rows", async () => {
    useProjectStore.getState().setProject(buildSyntheticDemoProject());
    await useProjectStore.getState().importLineCsv(csvFile(CSV));

    const { lineImport } = useProjectStore.getState();
    expect(lineImport.csvStatus).toBe("success");
    expect(lineImport.masts).toHaveLength(2);
    expect(lineImport.masts[0]!.mastName).toBe("8-B-BS");
    expect(lineImport.masts[1]!.mastName).toBe("9-B-BS");
  });

  it("importLineCsv surfaces a parse error without touching any existing masts", async () => {
    useProjectStore.getState().setProject(buildSyntheticDemoProject());
    await useProjectStore.getState().importLineCsv(csvFile("not,even,close,to,the,right,columns"));

    expect(useProjectStore.getState().lineImport.csvStatus).toBe("error");
    expect(useProjectStore.getState().lineImport.masts).toHaveLength(0);
  });

  it("selectLineMast rebuilds the project around the chosen row: pole model, mast centre, bearing, and geotech depths", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse(200, loadSyntheticFixtureJson("pole-portal-2leg.json")))
    );
    useProjectStore.getState().setProject(buildSyntheticDemoProject());
    await useProjectStore.getState().importLineCsv(csvFile(CSV));

    await useProjectStore.getState().selectLineMast(1); // "9-B-BS", the second row

    const project = useProjectStore.getState().project!;
    expect(project.poleModel.modelId).toBe("synthetic-portal-2leg-001");
    expect(project.mastCentreProject).toEqual({ space: "project", easting: 512410.2, northing: 487720.9, elevation: 121.0 });

    const bearingLayer = project.geotechLayers.find((l) => l.category === "competent-bearing")!;
    expect(bearingLayer.topBoundary).toEqual({ method: "terrain-relative", depthBelowTerrainM: 3.5 });
    expect(project.groundwater!.boundary).toEqual({ method: "terrain-relative", depthBelowTerrainM: 2.4 });

    expect(useProjectStore.getState().lineImport.selectedMastIndex).toBe(1);
    expect(useProjectStore.getState().lineImport.selectMastStatus).toBe("idle");
  });

  it("selectLineMast falls back to the straight mast-to-mast bearing when no centreline was uploaded", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse(200, loadSyntheticFixtureJson("pole-portal-2leg.json")))
    );
    useProjectStore.getState().setProject(buildSyntheticDemoProject());
    await useProjectStore.getState().importLineCsv(csvFile(CSV));

    await useProjectStore.getState().selectLineMast(0); // "8-B-BS", the first (and only "previous") row

    // 8-B-BS -> 9-B-BS is due-ish north-east; bearing is clockwise-from-north, strictly between 0 and pi/2.
    const bearing = useProjectStore.getState().project!.lineBearingRadians;
    expect(bearing).toBeGreaterThan(0);
    expect(bearing).toBeLessThan(Math.PI / 2);
  });

  it("selectLineMast surfaces a backend error without touching the existing project", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    const demo = buildSyntheticDemoProject();
    useProjectStore.getState().setProject(demo);
    await useProjectStore.getState().importLineCsv(csvFile(CSV));

    await useProjectStore.getState().selectLineMast(0);

    expect(useProjectStore.getState().lineImport.selectMastStatus).toBe("error");
    expect(useProjectStore.getState().project?.poleModel.modelId).toBe(demo.poleModel.modelId);
  });
});
