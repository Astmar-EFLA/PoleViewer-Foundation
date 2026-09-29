import type { ExcavationInstance } from "../domain/excavation";
import type { FillInstance } from "../domain/fill";
import { gravelPadThickness } from "../domain/fill";
import type { FoundationInstance } from "../domain/foundation";
import { localCoordinate } from "../domain/coordinates";
import { excavationBottomFootprint, foundationBottomFootprint } from "./excavationGeometry";
import type { OrientedBox } from "./foundationGeometry";

/**
 * The gravel pad (malarpúði) a foundation sits on: a flat slab whose top is
 * the foundation base and whose footprint is the whole excavation floor --
 * the foundation's pad grown by the excavation's own working space, so the
 * pad always fills the floor exactly. With no excavation for that
 * foundation, the pad's own `workingSpaceOffsetM` is used instead.
 *
 * Needs no terrain: the pad sits on the excavation floor, not on ground, so
 * its volume is exact (footprint area x thickness), never blocked.
 */
export function generateGravelPadBox(
  pad: FillInstance,
  foundation: FoundationInstance,
  excavation?: ExcavationInstance
): OrientedBox {
  const offset = excavation?.workingSpaceOffsetM ?? pad.workingSpaceOffsetM;
  const footprint = excavationBottomFootprint(foundationBottomFootprint(foundation), offset);
  const thickness = gravelPadThickness(pad);
  return {
    kind: "box",
    centre: localCoordinate(footprint.centre.x, footprint.centre.y, foundation.baseElevation - thickness / 2),
    halfExtents: { x: footprint.halfWidth, y: footprint.halfLength, z: thickness / 2 },
    orientationRadians: footprint.orientationRadians,
  };
}

export function gravelPadVolumeM3(box: OrientedBox): number {
  return 8 * box.halfExtents.x * box.halfExtents.y * box.halfExtents.z;
}

/** The excavation dug around the same foundation as `pad`, if any -- its working space sets the pad's footprint. */
export function excavationForPad(
  pad: FillInstance,
  excavationInstances: readonly ExcavationInstance[]
): ExcavationInstance | undefined {
  return excavationInstances.find((e) => e.foundationInstanceId === pad.foundationInstanceId);
}
