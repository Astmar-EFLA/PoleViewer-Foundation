import { describe, expect, it } from "vitest";
import { pointCloudSourceReferenceSchema } from "../validation/pointCloudSchema";
import { terrainSourceKindForPath } from "./pointCloud";

describe("terrainSourceKindForPath", () => {
  it("treats .tif/.tiff (any case) as a DEM and everything else as a point cloud", () => {
    expect(terrainSourceKindForPath("C:\TempPole BL3\DEM\IslandsDEM_2m.tif")).toBe("dem");
    expect(terrainSourceKindForPath("Markhojdmodell.TIFF")).toBe("dem");
    expect(terrainSourceKindForPath("LAS/Blondulina-V1-DTM.las")).toBe("point-cloud");
    expect(terrainSourceKindForPath("tile.laz")).toBe("point-cloud");
    expect(terrainSourceKindForPath("tif-in-name.las")).toBe("point-cloud");
  });
});

describe("pointCloudSourceReferenceSchema", () => {
  it("still accepts a source saved before DEM support (no kind)", () => {
    const legacy = { filePath: "a.las", crs: { kind: "epsg", epsgCode: 3057 }, contentHash: null };
    expect(pointCloudSourceReferenceSchema.safeParse(legacy).success).toBe(true);
  });

  it("accepts a DEM source with its height settings", () => {
    const dem = {
      filePath: "arctic.tif",
      crs: { kind: "epsg", epsgCode: 3413 },
      contentHash: null,
      kind: "dem",
      heightReference: "ellipsoidal",
      geoidHeightM: 65,
    };
    expect(pointCloudSourceReferenceSchema.safeParse(dem).success).toBe(true);
  });
});
