import { useEffect } from "react";

/**
 * Three.js GPU resources (BufferGeometry, Material, Texture) are not
 * garbage-collected by the JS engine -- their underlying WebGL buffers
 * leak unless `.dispose()` is called explicitly (Phase 9: "geometry
 * disposal"). Every component that builds one imperatively (`new
 * THREE.BufferGeometry()` inside `useMemo`, rather than a JSX-declared
 * `<bufferGeometry>` that @react-three/fiber already disposes on unmount)
 * must route it through this hook, so a long editing session (repeatedly
 * tweaking a foundation, regenerating terrain, editing an excavation) does
 * not accumulate undisposed buffers every time the memoised value changes.
 */
export function useAutoDispose<T extends { dispose: () => void }>(object: T): T {
  useEffect(() => {
    return () => object.dispose();
  }, [object]);
  return object;
}
