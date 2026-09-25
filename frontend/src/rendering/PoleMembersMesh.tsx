import { useMemo } from "react";
import * as THREE from "three";
import type { ViewerFrameDefinition } from "../domain/coordinates";
import type { PoleMember, PoleMemberCategory, PoleModel } from "../domain/poleModel";
import { POLE_MEMBER_COLOURS } from "../domain/poleModel";
import { localToViewer } from "../geometry/coordinateTransform";
import { placePoleModelPoint } from "../geometry/polePlacement";
import { toThreeVector3 } from "./threeAdapters";
import { useAutoDispose } from "./useAutoDispose";

interface PoleMembersMeshProps {
  readonly poleModel: PoleModel;
  readonly viewerFrame: ViewerFrameDefinition;
  readonly visible: boolean;
  readonly opacity: number;
}

function buildCategoryGeometry(
  members: readonly PoleMember[],
  category: PoleMemberCategory,
  poleModel: PoleModel,
  viewerFrame: ViewerFrameDefinition
): THREE.BufferGeometry {
  const filtered = members.filter((m) => m.category === category);
  const positions = new Float32Array(filtered.length * 2 * 3);
  filtered.forEach((m, i) => {
    const aViewer = toThreeVector3(localToViewer(placePoleModelPoint(m.a, poleModel), viewerFrame));
    const bViewer = toThreeVector3(localToViewer(placePoleModelPoint(m.b, poleModel), viewerFrame));
    positions[i * 6] = aViewer.x;
    positions[i * 6 + 1] = aViewer.y;
    positions[i * 6 + 2] = aViewer.z;
    positions[i * 6 + 3] = bViewer.x;
    positions[i * 6 + 4] = bViewer.y;
    positions[i * 6 + 5] = bViewer.z;
  });
  const geom = new THREE.BufferGeometry();
  geom.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  return geom;
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
    useMemo(() => buildCategoryGeometry(members, "structure", poleModel, viewerFrame), [members, poleModel, viewerFrame])
  );
  const cableGeometry = useAutoDispose(
    useMemo(() => buildCategoryGeometry(members, "cable", poleModel, viewerFrame), [members, poleModel, viewerFrame])
  );
  const insulatorGeometry = useAutoDispose(
    useMemo(() => buildCategoryGeometry(members, "insulator", poleModel, viewerFrame), [members, poleModel, viewerFrame])
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
