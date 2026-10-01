import { useMemo } from "react";
import type { ViewerFrameDefinition } from "../domain/coordinates";
import type { PoleModel } from "../domain/poleModel";
import { POLE_MEMBER_COLOURS } from "../domain/poleModel";
import { buildPoleMemberLines } from "./meshGeometry";
import { useAutoDispose } from "./useAutoDispose";

interface PoleMembersMeshProps {
  readonly poleModel: PoleModel;
  readonly viewerFrame: ViewerFrameDefinition;
  readonly visible: boolean;
  readonly opacity: number;
}

/**
 * Renders an imported pole model's real structural geometry (e.g. from a
 * PLS-POLE import -- see services/backendClient.ts's requestPoleModelImport)
 * as coloured line segments, one draw call per category rather than per
 * member (a real tower easily has 200-400 members). Purely a rendering
 * projection of PoleVisualGeometry (ADR-006) -- this component decides
 * nothing about which nodes are anchors; that was already decided by the
 * importer (ADR-005) before this ever runs.
 */
export function PoleMembersMesh({ poleModel, viewerFrame, visible, opacity }: PoleMembersMeshProps) {
  const members = useMemo(() => poleModel.visualGeometry?.members ?? [], [poleModel.visualGeometry]);

  const structureGeometry = useAutoDispose(
    useMemo(() => buildPoleMemberLines(members, "structure", poleModel, viewerFrame), [members, poleModel, viewerFrame])
  );
  const cableGeometry = useAutoDispose(
    useMemo(() => buildPoleMemberLines(members, "cable", poleModel, viewerFrame), [members, poleModel, viewerFrame])
  );
  const insulatorGeometry = useAutoDispose(
    useMemo(() => buildPoleMemberLines(members, "insulator", poleModel, viewerFrame), [members, poleModel, viewerFrame])
  );

  if (!visible || members.length === 0) return null;

  return (
    <group>
      <lineSegments geometry={structureGeometry}>
        <lineBasicMaterial color={POLE_MEMBER_COLOURS.structure} transparent opacity={opacity} />
      </lineSegments>
      <lineSegments geometry={cableGeometry}>
        <lineBasicMaterial color={POLE_MEMBER_COLOURS.cable} transparent opacity={opacity} />
      </lineSegments>
      <lineSegments geometry={insulatorGeometry}>
        <lineBasicMaterial color={POLE_MEMBER_COLOURS.insulator} transparent opacity={opacity} />
      </lineSegments>
    </group>
  );
}
