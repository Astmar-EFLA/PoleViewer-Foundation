import { describe, expect, it } from "vitest";
import { localCoordinate } from "../domain/coordinates";
import type { PoleModel } from "../domain/poleModel";
import { loadSyntheticFixtureJson } from "../tests/fixtures";
import { parsePoleModel } from "../validation/poleModelSchema";
import { placePoleModelPoint, placedAnchorPosition } from "./polePlacement";

describe("placePoleModelPoint", () => {
  it("is the identity transform when localOrigin is zero and orientation is zero", () => {
    const identityModel: Pick<PoleModel, "localOrigin" | "modelOrientationRadians"> = {
      localOrigin: localCoordinate(0, 0, 0),
      modelOrientationRadians: 0,
    };
    const point = localCoordinate(3, -2, 1.5);
    const placed = placePoleModelPoint(point, identityModel);
    expect(placed.x).toBeCloseTo(3, 9);
    expect(placed.y).toBeCloseTo(-2, 9);
    expect(placed.z).toBeCloseTo(1.5, 9);
  });

  it("applies rotation before translation, and rotation is about Z only", () => {
    const rotated90: Pick<PoleModel, "localOrigin" | "modelOrientationRadians"> = {
      localOrigin: localCoordinate(10, 0, 0),
      modelOrientationRadians: Math.PI / 2,
    };
    // model-space +X (transverse) should rotate to project-local +Y after a 90deg turn
    const point = localCoordinate(1, 0, 0);
    const placed = placePoleModelPoint(point, rotated90);
    expect(placed.x).toBeCloseTo(10, 9); // translation only affects x here since rotated x-component is ~0
    expect(placed.y).toBeCloseTo(1, 9);
    expect(placed.z).toBeCloseTo(0, 9);
  });
});

describe("placedAnchorPosition: per-leg anchor connection after placement", () => {
  it("places each leg's anchor at its declared local position when localOrigin/orientation are identity (2-leg portal)", () => {
    const parsed = parsePoleModel(loadSyntheticFixtureJson("pole-portal-2leg.json"));
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;

    const legAPlaced = placedAnchorPosition("anchor-leg-a", parsed.data);
    const legBPlaced = placedAnchorPosition("anchor-leg-b", parsed.data);

    expect(legAPlaced.x).toBeCloseTo(-1.5, 9);
    expect(legAPlaced.z).toBeCloseTo(-0.2, 9);
    expect(legBPlaced.x).toBeCloseTo(1.5, 9);
    expect(legBPlaced.z).toBeCloseTo(-0.2, 9);
  });

  it("each structural leg resolves to a distinct placed anchor position, never sharing one (4-leg lattice)", () => {
    const parsed = parsePoleModel(loadSyntheticFixtureJson("pole-lattice-4leg.json"));
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;

    const placedPositions = parsed.data.structuralLegs.map((leg) =>
      placedAnchorPosition(leg.linkedFoundationAnchorId, parsed.data)
    );

    const asStrings = placedPositions.map((p) => `${p.x},${p.y},${p.z}`);
    expect(new Set(asStrings).size).toBe(placedPositions.length);

    // Independent per-leg elevation is preserved through placement, not
    // collapsed to a shared base level.
    const elevations = placedPositions.map((p) => p.z);
    expect(new Set(elevations).size).toBe(4);
  });

  it("throws rather than silently returning a default when the anchor id does not exist", () => {
    const parsed = parsePoleModel(loadSyntheticFixtureJson("pole-portal-2leg.json"));
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;

    expect(() => placedAnchorPosition("no-such-anchor", parsed.data)).toThrow();
  });
});
