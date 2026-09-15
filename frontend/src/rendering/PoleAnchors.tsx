import { useMemo } from "react";
import type { ViewerFrameDefinition } from "../domain/coordinates";
import type { PoleModel } from "../domain/poleModel";
import { localToViewer } from "../geometry/coordinateTransform";
import { placePoleModelPoint } from "../geometry/polePlacement";
import { toThreeArrayXYZ } from "./threeAdapters";

interface PoleAnchorsProps {
  readonly poleModel: PoleModel;
  readonly viewerFrame: ViewerFrameDefinition;
  readonly visible: boolean;
  readonly opacity: number;
}

/**
 * Renders every declared anchor as a small marker. Positions are derived
 * from the pole model's own anchors via the geometry layer's placement
 * function (ADR-005) -- never from the visual mesh, which this Phase-1
 * slice does not even load yet.
 */
export function PoleAnchors({ poleModel, viewerFrame, visible, opacity }: PoleAnchorsProps) {
  const anchorPositions = useMemo(
    () =>
      poleModel.anchors.map((anchor) => {
        const local = placePoleModelPoint(anchor.localPosition, poleModel);
        const viewer = localToViewer(local, viewerFrame);
        return { anchor, position: toThreeArrayXYZ(viewer) };
      }),
    [poleModel, viewerFrame]
  );

  if (!visible) return null;

  return (
    <group>
      {anchorPositions.map(({ anchor, position }) => (
        <mesh key={anchor.id} position={position}>
          <sphereGeometry args={[0.15, 16, 16]} />
          <meshStandardMaterial
            color={anchor.anchorType === "mast-centre" ? "#e0a030" : "#3070e0"}
            transparent
            opacity={opacity}
          />
        </mesh>
      ))}
    </group>
  );
}
