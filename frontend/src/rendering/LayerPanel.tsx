import type { ProjectLayerStyles, TerrainLayerStyle } from "../domain/project";
import type { LayerKey } from "../state/projectStore";
import { useProjectStore } from "../state/projectStore";

const LAYER_LABELS: Record<LayerKey, string> = {
  pole: "Pole / anchors",
  foundations: "Foundations",
  terrain: "Terrain",
};

function LayerRow({ layerKey, style }: { layerKey: LayerKey; style: ProjectLayerStyles[LayerKey] }) {
  const setLayerVisible = useProjectStore((s) => s.setLayerVisible);
  const setLayerOpacity = useProjectStore((s) => s.setLayerOpacity);
  const setTerrainShowPoints = useProjectStore((s) => s.setTerrainShowPoints);
  const setTerrainWireframe = useProjectStore((s) => s.setTerrainWireframe);

  return (
    <div style={{ marginBottom: 10 }}>
      <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
        <input
          type="checkbox"
          checked={style.visible}
          onChange={(e) => setLayerVisible(layerKey, e.target.checked)}
        />
        {LAYER_LABELS[layerKey]}
      </label>
      <input
        type="range"
        min={0}
        max={1}
        step={0.05}
        value={style.opacity}
        disabled={!style.visible}
        onChange={(e) => setLayerOpacity(layerKey, Number(e.target.value))}
        style={{ width: "100%" }}
      />
      {layerKey === "terrain" &&
        (() => {
          const terrainStyle = style as TerrainLayerStyle;
          return (
            <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
              <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12 }}>
                <input
                  type="checkbox"
                  checked={terrainStyle.showPoints}
                  onChange={(e) => setTerrainShowPoints(e.target.checked)}
                />
                Points
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12 }}>
                <input
                  type="checkbox"
                  checked={terrainStyle.wireframe}
                  onChange={(e) => setTerrainWireframe(e.target.checked)}
                />
                Wireframe
              </label>
            </div>
          );
        })()}
    </div>
  );
}

/** Dropdown content only -- positioning/card styling is provided by the DropdownButton this is rendered inside of (see Toolbar.tsx). */
export function LayerPanel() {
  const layerStyles = useProjectStore((s) => s.project?.layerStyles);
  if (!layerStyles) return null;

  return (
    <div>
      {(Object.keys(layerStyles) as LayerKey[]).map((key) => (
        <LayerRow key={key} layerKey={key} style={layerStyles[key]} />
      ))}
    </div>
  );
}
