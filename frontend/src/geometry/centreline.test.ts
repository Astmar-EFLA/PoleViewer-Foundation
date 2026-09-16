import { describe, expect, it } from "vitest";
import { projectCoordinate } from "../domain/coordinates";
import type { LineMastRow } from "../services/csvParsing";
import { bearingBetween, bearingForMast, nearestPointOnPolyline } from "./centreline";

function mast(mastName: string, easting: number, northing: number, legAxis: LineMastRow["legAxis"] = null): LineMastRow {
  return {
    mastName,
    position: projectCoordinate(easting, northing, 100),
    modelPath: `${mastName}.pol`,
    bearingLayerDepthM: 2.5,
    groundwaterDepthM: 1.8,
    legAxis,
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

  it("prefers a mast's own leg-axis pair over a centreline", () => {
    // Legs sit east-west (perpendicular to the line) in this synthetic case
    // purely to prove leg-axis wins over the centreline below, not to model
    // a realistic tower -- the centreline here points due north (matching
    // mast order) while the leg axis points due east/west.
    const legAxisMasts = [
      mast("A", 0, 0),
      mast("B", 0, 10, { a: { easting: -5, northing: 10 }, b: { easting: 5, northing: 10 } }),
      mast("C", 0, 20),
    ];
    const centreline = [
      { easting: 0, northing: -5 },
      { easting: 0, northing: 25 },
    ];
    // Leg axis A->B runs due east (pi/2) or due west (3pi/2); oriented
    // against the mast-to-mast forward reference (due north, ambiguous re:
    // east/west) picks whichever has a non-negative dot product -- east.
    expect(bearingForMast(legAxisMasts, centreline, 1)).toBeCloseTo(Math.PI / 2, 9);
  });

  it("orients a leg-axis pair regardless of which leg is listed first", () => {
    const forward = mast("B", 0, 10, { a: { easting: -5, northing: 10 }, b: { easting: 5, northing: 12 } });
    const reversed = mast("B", 0, 10, { a: { easting: 5, northing: 12 }, b: { easting: -5, northing: 10 } });
    const others = [mast("A", 0, 0), mast("C", 0, 20)];

    const forwardBearing = bearingForMast([others[0]!, forward, others[1]!], null, 1);
    const reversedBearing = bearingForMast([others[0]!, reversed, others[1]!], null, 1);
    expect(reversedBearing).toBeCloseTo(forwardBearing, 9);
  });
});
