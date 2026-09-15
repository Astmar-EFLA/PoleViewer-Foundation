/**
 * Places pole-model anchors (authored in the model's own frame) into the
 * project's mast-centred local engineering frame. Two separate, composable
 * concerns:
 *
 *  - `modelOrientationRadians`: rotation about Z applied to the model's own
 *    axes (e.g. correcting a model authored with its "front" face not
 *    aligned to the line bearing).
 *  - `localOrigin`: translation, in the project's local frame, of the
 *    model's own origin.
 *
 * The project's line-bearing rotation (docs/architecture/coordinate-strategy.md)
 * is applied separately, upstream, when converting project coordinates to
 * the local frame -- this function only resolves a pole model's placement
 * *within* that already-oriented local frame, so changing project mast
 * orientation and changing a model's own orientation offset are independent,
 * testable operations.
 */

import type { LocalCoordinate } from "../domain/coordinates";
import { localCoordinate } from "../domain/coordinates";
import type { PoleModel } from "../domain/poleModel";

export function placePoleModelPoint(
  modelSpacePoint: LocalCoordinate,
  poleModel: Pick<PoleModel, "localOrigin" | "modelOrientationRadians">
): LocalCoordinate {
  const cos = Math.cos(poleModel.modelOrientationRadians);
  const sin = Math.sin(poleModel.modelOrientationRadians);

  const rotatedX = modelSpacePoint.x * cos - modelSpacePoint.y * sin;
  const rotatedY = modelSpacePoint.x * sin + modelSpacePoint.y * cos;

  return localCoordinate(
    rotatedX + poleModel.localOrigin.x,
    rotatedY + poleModel.localOrigin.y,
    modelSpacePoint.z + poleModel.localOrigin.z
  );
}

export function placedAnchorPosition(
  anchorId: string,
  poleModel: PoleModel
): LocalCoordinate {
  const anchor = poleModel.anchors.find((a) => a.id === anchorId);
  if (!anchor) {
    throw new Error(`Anchor "${anchorId}" not found on pole model "${poleModel.modelId}"`);
  }
  return placePoleModelPoint(anchor.localPosition, poleModel);
}
