import type { LocalCoordinate } from "../domain/coordinates";
import { localCoordinate } from "../domain/coordinates";
import type { FoundationInstance } from "../domain/foundation";

export interface OrientedBox {
  readonly centre: LocalCoordinate;
  readonly halfExtents: { readonly x: number; readonly y: number; readonly z: number };
  readonly orientationRadians: number;
}

export interface FoundationGeometry {
  readonly pad: OrientedBox;
  readonly pedestal: OrientedBox;
  /** Top-of-pedestal centre point, as derived purely from the instance's own parameters (independent of any anchor). */
  readonly topConnectionPoint: LocalCoordinate;
}

/**
 * Pure function: a foundation instance's geometry depends only on that
 * instance's own fields. Two instances never share mutable state, so
 * regenerating one instance's geometry never touches another's (principle:
 * changing a foundation affects only that foundation).
 */
export function generateRectangularPadPedestalGeometry(
  instance: FoundationInstance
): FoundationGeometry {
  const { padWidth, padLength, padThickness, pedestalWidth, pedestalLength, pedestalHeight } =
    instance.parameters;

  const padCentreZ = instance.baseElevation + padThickness / 2;
  const pedestalCentreZ = instance.baseElevation + padThickness + pedestalHeight / 2;
  const topConnectionZ = instance.baseElevation + padThickness + pedestalHeight;

  return {
    pad: {
      centre: localCoordinate(instance.position.x, instance.position.y, padCentreZ),
      halfExtents: { x: padWidth / 2, y: padLength / 2, z: padThickness / 2 },
      orientationRadians: instance.orientationRadians,
    },
    pedestal: {
      centre: localCoordinate(instance.position.x, instance.position.y, pedestalCentreZ),
      halfExtents: { x: pedestalWidth / 2, y: pedestalLength / 2, z: pedestalHeight / 2 },
      orientationRadians: instance.orientationRadians,
    },
    topConnectionPoint: localCoordinate(instance.position.x, instance.position.y, topConnectionZ),
  };
}
