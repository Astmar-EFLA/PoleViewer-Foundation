import { describe, expect, it } from "vitest";
import { localCoordinate, projectCoordinate, viewerCoordinate } from "../domain/coordinates";
import type { LocalFrameDefinition, ViewerFrameDefinition } from "../domain/coordinates";
import { degreesToRadians } from "./angles";
import {
  localToProject,
  localToViewer,
  projectToLocal,
  projectToViewer,
  viewerToLocal,
  viewerToProject,
} from "./coordinateTransform";

// See docs/architecture/coordinate-strategy.md for the tolerance table this
// file implements: pure float64 math stages (project<->local, local<->viewer)
// are held to 1e-6 m; anything that has passed through a float32
// BufferGeometry stage is a rendering-layer concern, not tested here.
const PURE_MATH_TOLERANCE_M = 1e-6;

// Representative ISN93-scale mast centre, chosen specifically to be large
// enough (~500,000 m) that a bug which fed project coordinates directly into
// a float32 buffer would be visible if this test suite ever grew a
// float32-precision assertion; at this geometry-layer (float64) stage it
// also just exercises the transform at realistic magnitudes.
const ISN93_SCALE_MAST_CENTRE = projectCoordinate(512_345.678, 487_654.321, 123.456);

function frameWithBearingDegrees(bearingDegrees: number): LocalFrameDefinition {
  return {
    mastCentreProject: ISN93_SCALE_MAST_CENTRE,
    lineBearingRadians: degreesToRadians(bearingDegrees),
  };
}

describe("projectToLocal / localToProject round trip", () => {
  const cases: Array<{ name: string; point: ReturnType<typeof projectCoordinate>; bearingDeg: number }> = [
    {
      name: "mast centre itself",
      point: ISN93_SCALE_MAST_CENTRE,
      bearingDeg: 37,
    },
    {
      name: "offset point, bearing 0",
      point: projectCoordinate(
        ISN93_SCALE_MAST_CENTRE.easting + 12.5,
        ISN93_SCALE_MAST_CENTRE.northing - 8.3,
        ISN93_SCALE_MAST_CENTRE.elevation + 2.1
      ),
      bearingDeg: 0,
    },
    {
      name: "offset point, bearing 137.25 (non-axis-aligned)",
      point: projectCoordinate(
        ISN93_SCALE_MAST_CENTRE.easting - 19.4,
        ISN93_SCALE_MAST_CENTRE.northing + 33.7,
        ISN93_SCALE_MAST_CENTRE.elevation - 4.9
      ),
      bearingDeg: 137.25,
    },
    {
      name: "offset point, bearing 350 (near-full-turn)",
      point: projectCoordinate(
        ISN93_SCALE_MAST_CENTRE.easting + 100.0,
        ISN93_SCALE_MAST_CENTRE.northing + 100.0,
        ISN93_SCALE_MAST_CENTRE.elevation
      ),
      bearingDeg: 350,
    },
  ];

  for (const { name, point, bearingDeg } of cases) {
    it(`round-trips: ${name}`, () => {
      const frame = frameWithBearingDegrees(bearingDeg);
      const local = projectToLocal(point, frame);
      const roundTripped = localToProject(local, frame);

      expect(roundTripped.easting).toBeCloseTo(point.easting, 6);
      expect(roundTripped.northing).toBeCloseTo(point.northing, 6);
      expect(roundTripped.elevation).toBeCloseTo(point.elevation, 6);

      expect(Math.abs(roundTripped.easting - point.easting)).toBeLessThan(PURE_MATH_TOLERANCE_M);
      expect(Math.abs(roundTripped.northing - point.northing)).toBeLessThan(
        PURE_MATH_TOLERANCE_M
      );
      expect(Math.abs(roundTripped.elevation - point.elevation)).toBeLessThan(
        PURE_MATH_TOLERANCE_M
      );
    });
  }

  it("places the mast centre itself at local (0,0,0) regardless of bearing", () => {
    for (const bearingDeg of [0, 45, 90, 180, 270, 359]) {
      const frame = frameWithBearingDegrees(bearingDeg);
      const local = projectToLocal(ISN93_SCALE_MAST_CENTRE, frame);
      expect(local.x).toBeCloseTo(0, 9);
      expect(local.y).toBeCloseTo(0, 9);
      expect(local.z).toBeCloseTo(0, 9);
    }
  });
});

describe("orientation sign convention (clockwise-from-north bearing)", () => {
  // Hand-computed expected values, not just "geometry moved". See
  // docs/architecture/coordinate-strategy.md for the derivation: local +Y
  // (longitudinal) points along the bearing direction; local +X (transverse)
  // and +Y form a right-handed system with +Z up.

  it("bearing 0 (north): local Y = north, local X = east", () => {
    const frame = frameWithBearingDegrees(0);

    const pointEast = projectCoordinate(
      ISN93_SCALE_MAST_CENTRE.easting + 10,
      ISN93_SCALE_MAST_CENTRE.northing,
      ISN93_SCALE_MAST_CENTRE.elevation
    );
    const localEast = projectToLocal(pointEast, frame);
    expect(localEast.x).toBeCloseTo(10, 9);
    expect(localEast.y).toBeCloseTo(0, 9);

    const pointNorth = projectCoordinate(
      ISN93_SCALE_MAST_CENTRE.easting,
      ISN93_SCALE_MAST_CENTRE.northing + 10,
      ISN93_SCALE_MAST_CENTRE.elevation
    );
    const localNorth = projectToLocal(pointNorth, frame);
    expect(localNorth.x).toBeCloseTo(0, 9);
    expect(localNorth.y).toBeCloseTo(10, 9);
  });

  it("bearing 90 (east): local Y = east, local X = south", () => {
    const frame = frameWithBearingDegrees(90);

    const pointEast = projectCoordinate(
      ISN93_SCALE_MAST_CENTRE.easting + 10,
      ISN93_SCALE_MAST_CENTRE.northing,
      ISN93_SCALE_MAST_CENTRE.elevation
    );
    const localEast = projectToLocal(pointEast, frame);
    // A point in the bearing direction (east, when bearing=east) lands on
    // local +Y (longitudinal), not local X.
    expect(localEast.x).toBeCloseTo(0, 9);
    expect(localEast.y).toBeCloseTo(10, 9);

    const pointNorth = projectCoordinate(
      ISN93_SCALE_MAST_CENTRE.easting,
      ISN93_SCALE_MAST_CENTRE.northing + 10,
      ISN93_SCALE_MAST_CENTRE.elevation
    );
    const localNorth = projectToLocal(pointNorth, frame);
    // North is perpendicular to an east bearing; right-handedness (X x Y = Z,
    // Z up) puts a northward point on local -X, not +X.
    expect(localNorth.x).toBeCloseTo(-10, 9);
    expect(localNorth.y).toBeCloseTo(0, 9);
  });

  it("bearing 180 (south): local Y = south, local X = west", () => {
    const frame = frameWithBearingDegrees(180);

    const pointSouth = projectCoordinate(
      ISN93_SCALE_MAST_CENTRE.easting,
      ISN93_SCALE_MAST_CENTRE.northing - 10,
      ISN93_SCALE_MAST_CENTRE.elevation
    );
    const localSouth = projectToLocal(pointSouth, frame);
    expect(localSouth.x).toBeCloseTo(0, 9);
    expect(localSouth.y).toBeCloseTo(10, 9);
  });

  it("rotating the mast 90 degrees moves a fixed anchor to the hand-computed expected local coordinate", () => {
    // Regression guard against a sign flip in the bearing convention
    // (principle: never silently swap/invert an orientation sign).
    const fixedAnchor = projectCoordinate(
      ISN93_SCALE_MAST_CENTRE.easting + 15,
      ISN93_SCALE_MAST_CENTRE.northing + 0,
      ISN93_SCALE_MAST_CENTRE.elevation + 3
    );

    const at0deg = projectToLocal(fixedAnchor, frameWithBearingDegrees(0));
    expect(at0deg.x).toBeCloseTo(15, 9);
    expect(at0deg.y).toBeCloseTo(0, 9);
    expect(at0deg.z).toBeCloseTo(3, 9);

    const at90deg = projectToLocal(fixedAnchor, frameWithBearingDegrees(90));
    expect(at90deg.x).toBeCloseTo(0, 9);
    expect(at90deg.y).toBeCloseTo(15, 9);
    expect(at90deg.z).toBeCloseTo(3, 9);
  });
});

describe("localToViewer / viewerToLocal round trip", () => {
  it("round-trips through a non-zero floating render origin", () => {
    const viewerFrame: ViewerFrameDefinition = {
      renderOriginLocal: localCoordinate(1.5, -2.25, 0.5),
    };
    const local = localCoordinate(10, 20, 3);

    const viewer = localToViewer(local, viewerFrame);
    const roundTripped = viewerToLocal(viewer, viewerFrame);

    expect(roundTripped.x).toBeCloseTo(local.x, 9);
    expect(roundTripped.y).toBeCloseTo(local.y, 9);
    expect(roundTripped.z).toBeCloseTo(local.z, 9);
  });

  it("viewer coordinate equals local coordinate when render origin is zero", () => {
    const viewerFrame: ViewerFrameDefinition = {
      renderOriginLocal: localCoordinate(0, 0, 0),
    };
    const local = localCoordinate(7, -4, 1);
    const viewer = localToViewer(local, viewerFrame);

    expect(viewer.x).toBeCloseTo(local.x, 9);
    expect(viewer.y).toBeCloseTo(local.y, 9);
    expect(viewer.z).toBeCloseTo(local.z, 9);
  });
});

describe("projectToViewer / viewerToProject composed round trip", () => {
  it("round-trips project -> viewer -> project through both frames", () => {
    const localFrame = frameWithBearingDegrees(64.0);
    const viewerFrame: ViewerFrameDefinition = {
      renderOriginLocal: localCoordinate(3, -1, 0),
    };
    const original = projectCoordinate(
      ISN93_SCALE_MAST_CENTRE.easting + 22.2,
      ISN93_SCALE_MAST_CENTRE.northing - 5.6,
      ISN93_SCALE_MAST_CENTRE.elevation + 1.1
    );

    const viewer = projectToViewer(original, localFrame, viewerFrame);
    const roundTripped = viewerToProject(viewer, localFrame, viewerFrame);

    expect(Math.abs(roundTripped.easting - original.easting)).toBeLessThan(
      PURE_MATH_TOLERANCE_M
    );
    expect(Math.abs(roundTripped.northing - original.northing)).toBeLessThan(
      PURE_MATH_TOLERANCE_M
    );
    expect(Math.abs(roundTripped.elevation - original.elevation)).toBeLessThan(
      PURE_MATH_TOLERANCE_M
    );
  });

  it("keeps viewer-space magnitudes small even though project coordinates are ISN93-scale", () => {
    // This is the concrete claim behind ADR-004: after the local + viewer
    // origin subtraction, magnitudes fall well within float32's
    // sub-millimetre-accurate range, unlike raw project coordinates
    // (~500,000 m) which would not.
    const localFrame = frameWithBearingDegrees(10);
    const viewerFrame: ViewerFrameDefinition = {
      renderOriginLocal: localCoordinate(0, 0, 0),
    };
    const nearbyPoint = projectCoordinate(
      ISN93_SCALE_MAST_CENTRE.easting + 18,
      ISN93_SCALE_MAST_CENTRE.northing - 12,
      ISN93_SCALE_MAST_CENTRE.elevation + 2
    );

    const viewer = projectToViewer(nearbyPoint, localFrame, viewerFrame);

    expect(Math.abs(viewer.x)).toBeLessThan(200);
    expect(Math.abs(viewer.y)).toBeLessThan(200);
    expect(Math.abs(viewer.z)).toBeLessThan(200);
  });
});

describe("viewerCoordinate helper", () => {
  it("tags the space literal correctly", () => {
    const v = viewerCoordinate(1, 2, 3);
    expect(v.space).toBe("viewer");
  });
});
