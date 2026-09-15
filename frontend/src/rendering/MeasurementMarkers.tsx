import { useMemo } from "react";
import type { ViewerFrameDefinition } from "../domain/coordinates";
import type { Measurement, MeasurementPointRecord } from "../domain/measurement";
import { localToViewer } from "../geometry/coordinateTransform";
import { toThreeArrayXYZ } from "./threeAdapters";

interface MeasurementMarkersProps {
  readonly measurements: readonly Measurement[];
  readonly pendingPoints: readonly MeasurementPointRecord[];
  readonly viewerFrame: ViewerFrameDefinition;
}

/** Small marker spheres at picked measurement points -- purely a projection of already-computed points (ADR-006), no geometry decided here. */
export function MeasurementMarkers({ measurements, pendingPoints, viewerFrame }: MeasurementMarkersProps) {
  const savedPositions = useMemo(
    () =>
      measurements.flatMap((m) =>
        m.points.map((p, i) => ({
          key: `${m.id}-${i}`,
          position: toThreeArrayXYZ(localToViewer(p.local, viewerFrame)),
        }))
      ),
    [measurements, viewerFrame]
  );

  const pendingPositions = useMemo(
    () =>
      pendingPoints.map((p, i) => ({
        key: `pending-${i}`,
        position: toThreeArrayXYZ(localToViewer(p.local, viewerFrame)),
      })),
    [pendingPoints, viewerFrame]
  );

  return (
    <group>
      {savedPositions.map(({ key, position }) => (
        <mesh key={key} position={position}>
          <sphereGeometry args={[0.12, 12, 12]} />
          <meshStandardMaterial color="#20a020" />
        </mesh>
      ))}
      {pendingPositions.map(({ key, position }) => (
        <mesh key={key} position={position}>
          <sphereGeometry args={[0.15, 12, 12]} />
          <meshStandardMaterial color="#e04020" />
        </mesh>
      ))}
    </group>
  );
}
