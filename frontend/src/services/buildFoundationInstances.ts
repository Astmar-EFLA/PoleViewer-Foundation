/**
 * Application-layer service: derives one default foundation instance per
 * structural leg from a pole model. Pure function, no React/Three.js
 * dependency (principle: never embed domain calculations directly inside
 * UI components) -- UI code calls this and stores the result, it does not
 * recompute placement itself.
 *
 * Base elevation is solved so each foundation's own pedestal top meets its
 * leg's placed anchor exactly; dimensions come from the caller-supplied
 * default parameters (library defaults, not a real design), which is why
 * every produced instance is tagged origin "library-default"/"calculated"
 * rather than "user-entered".
 */

import type { RectangularPadPedestalParameters } from "../domain/foundation";
import type { FoundationInstance } from "../domain/foundation";
import type { PoleModel } from "../domain/poleModel";
import { placedAnchorPosition } from "../geometry/polePlacement";

export function buildDefaultFoundationInstances(
  poleModel: PoleModel,
  defaultParameters: RectangularPadPedestalParameters,
  nowIso: string
): FoundationInstance[] {
  return poleModel.structuralLegs.map((leg) => {
    const anchorPos = placedAnchorPosition(leg.linkedFoundationAnchorId, poleModel);
    const baseElevation =
      anchorPos.z - defaultParameters.padThickness - defaultParameters.pedestalHeight;

    return {
      instanceId: `foundation-${leg.id}`,
      poleModelId: poleModel.modelId,
      legId: leg.id,
      anchorId: leg.linkedFoundationAnchorId,
      foundationTypeId: "rectangular-pad-pedestal-v1",
      parameters: defaultParameters,
      position: { x: anchorPos.x, y: anchorPos.y },
      orientationRadians: 0,
      baseElevation,
      visible: true,
      colour: "#9aa5b1",
      opacity: 1,
      provenance: {
        originType: "library-default",
        verificationState: "unverified",
        modifiedAt: nowIso,
        notes:
          "Default foundation dimensions and base elevation calculated to connect to the leg anchor; not a verified design.",
      },
    };
  });
}
