import { useEffect, useMemo, useState } from "react";
import * as THREE from "three";
import type { ThreeEvent } from "@react-three/fiber";
import { localCoordinate, type LocalFrameDefinition, type ViewerFrameDefinition } from "../domain/coordinates";
import type { OrthophotoReference } from "../domain/orthophoto";
import type { TerrainSurface } from "../domain/terrain";
import { localToProject, localToViewer, viewerToLocal } from "../geometry/coordinateTransform";
import { computeOrthophotoUv } from "../geometry/orthophotoUv";
import { DEFAULT_BACKEND_BASE_URL } from "../services/backendClient";
import { fromThreeVector3, toThreeVector3 } from "./threeAdapters";
import { useAutoDispose } from "./useAutoDispose";

interface TerrainMeshProps {
  readonly surface: TerrainSurface;
  readonly viewerFrame: ViewerFrameDefinition;
  readonly localFrame: LocalFrameDefinition;
  readonly visible: boolean;
  readonly opacity: number;
  readonly wireframe?: boolean;
  readonly orthophoto?: OrthophotoReference | null;
  readonly showOrthophoto?: boolean;
  readonly onHoverLocalXY?: (localX: number, localY: number) => void;
  readonly onHoverEnd?: () => void;
  readonly onPickLocalXY?: (localX: number, localY: number) => void;
}

/** Loads (and disposes, on URL change/unmount) a Three.js texture from a URL. Manual (not useLoader/Suspense) so a failed or still-loading orthophoto degrades to the flat terrain colour instead of suspending or crashing the whole scene. */
function useOrthophotoTexture(url: string | null): THREE.Texture | null {
  const [texture, setTexture] = useState<THREE.Texture | null>(null);

  useEffect(() => {
    if (!url) {
      setTexture(null);
      return;
    }
    let cancelled = false;
    new THREE.TextureLoader().load(
      url,
      (loaded) => {
        if (cancelled) {
          loaded.dispose();
          return;
        }
        loaded.colorSpace = THREE.SRGBColorSpace;
        setTexture(loaded);
      },
      undefined,
      () => {
        if (!cancelled) setTexture(null);
      }
    );
    return () => {
      cancelled = true;
    };
  }, [url]);

  useEffect(() => {
    return () => texture?.dispose();
  }, [texture]);

  return texture;
}

/**
 * Renders the terrain TIN. Vertex positions are derived from the domain
 * surface's local-space points at render time (the only float32 boundary,
 * per ADR-004) -- the geometry is rebuilt only when `surface` or
 * `viewerFrame` change, never mutated in place, so this stays a pure
 * projection of domain state (ADR-006), not a second source of truth.
 */
export function TerrainMesh({
  surface,
  viewerFrame,
  localFrame,
  visible,
  opacity,
  wireframe = false,
  orthophoto = null,
  showOrthophoto = false,
  onHoverLocalXY,
  onHoverEnd,
  onPickLocalXY,
}: TerrainMeshProps) {
  const textureUrl = orthophoto ? `${DEFAULT_BACKEND_BASE_URL}${orthophoto.imageUrl}` : null;
  const texture = useOrthophotoTexture(showOrthophoto ? textureUrl : null);

  const geometry = useAutoDispose(
    useMemo(() => {
      const geom = new THREE.BufferGeometry();
      const positions = new Float32Array(surface.points.length * 3);
      // Only populated when an orthophoto is registered -- computing a UV
      // for every vertex otherwise would be wasted work for the common
      // (no-orthophoto) case, and Three.js tolerates a geometry with no uv
      // attribute at all when nothing samples it.
      const uvs = orthophoto ? new Float32Array(surface.points.length * 2) : null;

      for (let i = 0; i < surface.points.length; i += 1) {
        const p = surface.points[i]!;
        const local = localCoordinate(p.x, p.y, p.z);
        const viewer = localToViewer(local, viewerFrame);
        const v3 = toThreeVector3(viewer);
        positions[i * 3] = v3.x;
        positions[i * 3 + 1] = v3.y;
        positions[i * 3 + 2] = v3.z;

        if (uvs && orthophoto) {
          const projectPoint = localToProject(local, localFrame);
          const uv = computeOrthophotoUv(
            orthophoto.worldFile,
            orthophoto.imageWidthPx,
            orthophoto.imageHeightPx,
            projectPoint.easting,
            projectPoint.northing
          );
          uvs[i * 2] = uv.u;
          uvs[i * 2 + 1] = uv.v;
        }
      }
      geom.setAttribute("position", new THREE.BufferAttribute(positions, 3));
      if (uvs) geom.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));

      const indices: number[] = [];
      for (const triangle of surface.triangles) {
        indices.push(triangle.indices[0], triangle.indices[1], triangle.indices[2]);
      }
      geom.setIndex(indices);
      geom.computeVertexNormals();
      return geom;
    }, [surface, viewerFrame, localFrame, orthophoto])
  );

  if (!visible) return null;

  function handlePointerMove(event: ThreeEvent<PointerEvent>) {
    event.stopPropagation();
    if (!onHoverLocalXY) return;
    const viewerPoint = fromThreeVector3(event.point);
    const local = viewerToLocal(viewerPoint, viewerFrame);
    onHoverLocalXY(local.x, local.y);
  }

  function handleClick(event: ThreeEvent<MouseEvent>) {
    event.stopPropagation();
    if (!onPickLocalXY) return;
    const viewerPoint = fromThreeVector3(event.point);
    const local = viewerToLocal(viewerPoint, viewerFrame);
    onPickLocalXY(local.x, local.y);
  }

  const useTexture = showOrthophoto && texture !== null;

  return (
    <mesh
      geometry={geometry}
      onPointerMove={handlePointerMove}
      onPointerOut={() => onHoverEnd?.()}
      onClick={handleClick}
    >
      <meshStandardMaterial
        color={useTexture ? "#ffffff" : "#8a9a7b"}
        map={useTexture ? texture : null}
        transparent
        opacity={opacity}
        side={THREE.DoubleSide}
        depthWrite={opacity >= 0.999}
        wireframe={wireframe}
        polygonOffset
        polygonOffsetFactor={1}
        polygonOffsetUnits={1}
      />
    </mesh>
  );
}
