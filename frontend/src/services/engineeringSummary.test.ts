import { describe, expect, it } from "vitest";
import { bucketForOriginType, buildEngineeringSummary } from "./engineeringSummary";
import { buildSyntheticDemoProject } from "./buildSyntheticDemoProject";

describe("bucketForOriginType", () => {
  it("maps each origin type to exactly one of the four required buckets", () => {
    expect(bucketForOriginType("imported")).toBe("imported");
    expect(bucketForOriginType("user-entered")).toBe("user-entered");
    expect(bucketForOriginType("assumed")).toBe("assumed");
    expect(bucketForOriginType("library-default")).toBe("assumed");
    expect(bucketForOriginType("calculated")).toBe("calculated");
    expect(bucketForOriginType("transformed")).toBe("calculated");
    expect(bucketForOriginType("interpolated")).toBe("calculated");
  });
});

describe("buildEngineeringSummary", () => {
  it("produces one entry per provenanced engineering object in the demo project", () => {
    const project = buildSyntheticDemoProject();
    const summary = buildEngineeringSummary(project);

    // pole model + 4 foundations + 4 excavations + 3 geotech layers + groundwater
    expect(summary.entries.length).toBe(
      1 + project.foundationInstances.length + project.excavationInstances.length + project.geotechLayers.length + 1
    );
  });

  it("every entry falls into one of the four required buckets", () => {
    const summary = buildEngineeringSummary(buildSyntheticDemoProject());
    const validBuckets = new Set(["imported", "user-entered", "assumed", "calculated"]);
    for (const entry of summary.entries) {
      expect(validBuckets.has(entry.bucket)).toBe(true);
    }
  });

  it("lists mast centre and line bearing under project configuration, not guessed into a bucket", () => {
    const summary = buildEngineeringSummary(buildSyntheticDemoProject());
    const labels = summary.projectConfiguration.map((e) => e.label);
    expect(labels).toContain("Mast centre (project coordinates)");
    expect(labels).toContain("Line bearing");
  });
});

describe("buildEngineeringSummary: terrain source", () => {
  it("names a DEM source with its heights and flags a DEM-built terrain surface as derived", () => {
    const demo = buildSyntheticDemoProject();
    const project = {
      ...demo,
      pointCloudSource: {
        filePath: "DEM/arctic.tif",
        crs: { kind: "epsg" as const, epsgCode: 3413 },
        contentHash: null,
        kind: "dem" as const,
        heightReference: "ellipsoidal" as const,
        geoidHeightM: 64.5,
      },
      terrainSurface: demo.terrainSurface ? { ...demo.terrainSurface, source: { kind: "dem" as const, filePath: "DEM/arctic.tif" } } : null,
    };
    const config = buildEngineeringSummary(project).projectConfiguration;
    const source = config.find((e) => e.label === "Terrain source (DEM)");
    expect(source?.value).toContain("ellipsoidal heights, geoid N = 64.50 m");
    if (project.terrainSurface) {
      expect(config.find((e) => e.label === "Terrain surface")?.value).toContain("not measured points");
    }
  });
});
