import type { ProjectLayerStyles } from "../domain/project";
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
    </div>
  );
}

export function LayerPanel() {
  const layerStyles = useProjectStore((s) => s.project?.layerStyles);
  if (!layerStyles) return null;

  return (
    <div
      style={{
        position: "absolute",
        top: 12,
        left: 12,
        background: "rgba(255,255,255,0.92)",
        borderRadius: 6,
        padding: "10px 12px",
        boxShadow: "0 1px 4px rgba(0,0,0,0.2)",
        width: 200,
        fontFamily: "system-ui, sans-serif",
      }}
    >
      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Layers</div>
      {(Object.keys(layerStyles) as LayerKey[]).map((key) => (
        <LayerRow key={key} layerKey={key} style={layerStyles[key]} />
      ))}
    </div>
  );
}
