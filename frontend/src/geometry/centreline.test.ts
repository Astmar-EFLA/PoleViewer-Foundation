import { describe, expect, it } from "vitest";
import { projectCoordinate } from "../domain/coordinates";
import type { LineMastRow } from "../services/csvParsing";
import { bearingBetween, bearingForMast, nearestPointOnPolyline } from "./centreline";

function mast(mastName: string, easting: number, northing: number): LineMastRow {
  return {
    mastName,
    position: projectCoordinate(easting, northing, 100),
    modelPath: `${mastName}.pol`,
    bearingLayerDepthM: 2.5,
    groundwaterDepthM: 1.8,
  };
}

describe("bearingBetween", () => {
  it("is 0 due north, pi/2 due east, pi due south, 3pi/2 due west -- clockwise from north", () => {
    const origin = { easting: 0, northing: 0 };
    expect(bearingBetween(origin, { easting: 0, northing: 10 })).toBeCloseTo(0, 9);
    expect(bearingBetween(origin, { easting: 10, northing: 0 })).toBeCloseTo(Math.PI / 2, 9);
    expect(bearingBetween(origin, { easting: 0, northing: -10 })).toBeCloseTo(Math.PI, 9);
    expect(bearingBetween(origin, { easting: -10, northing: 0 })).toBeCloseTo((3 * Math.PI) / 2, 9);
  });
});

describe("nearestPointOnPolyline", () => {
  const polyline = [
    { easting: 0, northing: 0 },
    { easting: 10, northing: 0 },
    { easting: 10, northing: 10 },
  ];

  it("finds the closest segment and its tangent for a point directly on a segment", () => {
    const result = nearestPointOnPolyline({ easting: 5, northing: 0 }, polyline);
    expect(result).not.toBeNull();
    expect(result!.segmentIndex).toBe(0);
    expect(result!.distanceM).toBeCloseTo(0, 9);
    // Segment 0 runs due east -> bearing pi/2.
    expect(result!.tangentRadians).toBeCloseTo(Math.PI / 2, 9);
  });

  it("reports the correct perpendicular distance for a point off to the side", () => {
    const result = nearestPointOnPolyline({ easting: 5, northing: 3 }, polyline);
    expect(result!.segmentIndex).toBe(0);
    expect(result!.distanceM).toBeCloseTo(3, 9);
  });

  it("picks the second segment when a point is closer to it", () => {
    const result = nearestPointOnPolyline({ easting: 11, northing: 5 }, polyline);
    expect(result!.segmentIndex).toBe(1);
    // Segment 1 runs due north -> bearing 0.
    expect(result!.tangentRadians).toBeCloseTo(0, 9);
  });

  it("returns null for a degenerate (<2 vertex) polyline", () => {
    expect(nearestPointOnPolyline({ easting: 0, northing: 0 }, [{ easting: 0, northing: 0 }])).toBeNull();
  });
});

describe("bearingForMast", () => {
  const masts = [mast("A", 0, 0), mast("B", 0, 10), mast("C", 0, 20)];

  it("without a centreline, uses the straight bearing to the next mast", () => {
    expect(bearingForMast(masts, null, 0)).toBeCloseTo(0, 9); // due north, toward B
  });

  it("without a centreline, the last mast uses the bearing from the previous mast", () => {
    expect(bearingForMast(masts, null, 2)).toBeCloseTo(0, 9); // B -> C is also due north
  });

  it("with a centreline whose tangent already points forward, uses it directly", () => {
    const centreline = [
      { easting: 0, northing: -5 },
      { easting: 0, northing: 25 },
    ];
    // The one segment runs due north, same direction as mast order -- no flip needed.
    expect(bearingForMast(masts, centreline, 1)).toBeCloseTo(0, 9);
  });

  it("with a centreline whose tangent points backward, flips it to match low-to-high mast order", () => {
    // Vertex order reversed relative to the masts -- the raw segment tangent points due south.
    const centreline = [
      { easting: 0, northing: 25 },
      { easting: 0, northing: -5 },
    ];
    expect(bearingForMast(masts, centreline, 1)).toBeCloseTo(0, 9); // still resolves to "forward" (north)
  });
});
