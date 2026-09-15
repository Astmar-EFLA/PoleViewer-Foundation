import type { CSSProperties } from "react";
import type { FoundationParameters, RectangularStep } from "../domain/foundation";
import { FOUNDATION_LIBRARY } from "../domain/foundationLibrary";
import { placedAnchorPosition } from "../geometry/polePlacement";
import { useProjectStore } from "../state/projectStore";
import { validateFoundationInstance } from "../validation/foundationValidation";

const panelStyle: CSSProperties = {
  position: "absolute",
  bottom: 44,
  right: 12,
  background: "rgba(255,255,255,0.94)",
  borderRadius: 6,
  padding: "10px 12px",
  boxShadow: "0 1px 4px rgba(0,0,0,0.2)",
  width: 280,
  maxHeight: "60vh",
  overflowY: "auto",
  fontFamily: "system-ui, sans-serif",
  fontSize: 12,
};

function NumberField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <label style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 6, marginBottom: 4 }}>
      <span style={{ opacity: 0.8 }}>{label}</span>
      <input
        type="number"
        step={0.05}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ width: 80 }}
      />
    </label>
  );
}

export function FoundationPanel() {
  const project = useProjectStore((s) => s.project);
  const selectedLegId = useProjectStore((s) => s.selectedLegId);
  const setSelectedLeg = useProjectStore((s) => s.setSelectedLeg);
  const setFoundationType = useProjectStore((s) => s.setFoundationType);
  const setFoundationParameters = useProjectStore((s) => s.setFoundationParameters);
  const copyFoundationToOtherLegs = useProjectStore((s) => s.copyFoundationToOtherLegs);

  if (!project) return null;

  const legs = project.poleModel.structuralLegs;
  const selectedLeg = legs.find((l) => l.id === selectedLegId) ?? legs[0] ?? null;
  const instance = selectedLeg
    ? project.foundationInstances.find((f) => f.legId === selectedLeg.id)
    : undefined;

  const validation = instance
    ? validateFoundationInstance(
        instance,
        placedAnchorPosition(instance.anchorId, project.poleModel),
        project.modifiedAt
      )
    : [];

  function updateParameters(next: FoundationParameters) {
    if (selectedLeg) setFoundationParameters(selectedLeg.id, next);
  }

  return (
    <div style={panelStyle}>
      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Foundations</div>

      {legs.map((leg) => {
        const legInstance = project.foundationInstances.find((f) => f.legId === leg.id);
        const typeName =
          FOUNDATION_LIBRARY.find((t) => t.foundationTypeId === legInstance?.foundationTypeId)?.name ?? "-";
        const isSelected = leg.id === (selectedLeg?.id ?? null);
        return (
          <button
            key={leg.id}
            type="button"
            onClick={() => setSelectedLeg(leg.id)}
            style={{
              display: "block",
              width: "100%",
              textAlign: "left",
              padding: "4px 6px",
              marginBottom: 2,
              background: isSelected ? "#e0a03022" : "transparent",
              border: isSelected ? "1px solid #e0a030" : "1px solid transparent",
              borderRadius: 4,
              cursor: "pointer",
            }}
          >
            {leg.name}: <span style={{ opacity: 0.75 }}>{typeName}</span>
          </button>
        );
      })}

      {selectedLeg && instance && (
        <div style={{ marginTop: 10, borderTop: "1px solid #ddd", paddingTop: 8 }}>
          <label style={{ display: "block", marginBottom: 6 }}>
            <span style={{ opacity: 0.8, display: "block", marginBottom: 2 }}>Type</span>
            <select
              value={instance.foundationTypeId}
              onChange={(e) => setFoundationType(selectedLeg.id, e.target.value)}
              style={{ width: "100%" }}
            >
              {FOUNDATION_LIBRARY.map((t) => (
                <option key={t.foundationTypeId} value={t.foundationTypeId}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>

          {instance.parameters.geometryType === "rectangular-pad-pedestal" && (
            <>
              <NumberField
                label="Pad width"
                value={instance.parameters.padWidth}
                onChange={(v) => updateParameters({ ...instance.parameters, padWidth: v } as FoundationParameters)}
              />
              <NumberField
                label="Pad length"
                value={instance.parameters.padLength}
                onChange={(v) => updateParameters({ ...instance.parameters, padLength: v } as FoundationParameters)}
              />
              <NumberField
                label="Pad thickness"
                value={instance.parameters.padThickness}
                onChange={(v) => updateParameters({ ...instance.parameters, padThickness: v } as FoundationParameters)}
              />
              <NumberField
                label="Pedestal width"
                value={instance.parameters.pedestalWidth}
                onChange={(v) => updateParameters({ ...instance.parameters, pedestalWidth: v } as FoundationParameters)}
              />
              <NumberField
                label="Pedestal length"
                value={instance.parameters.pedestalLength}
                onChange={(v) => updateParameters({ ...instance.parameters, pedestalLength: v } as FoundationParameters)}
              />
              <NumberField
                label="Pedestal height"
                value={instance.parameters.pedestalHeight}
                onChange={(v) => updateParameters({ ...instance.parameters, pedestalHeight: v } as FoundationParameters)}
              />
            </>
          )}

          {instance.parameters.geometryType === "stepped-rectangular" && (
            <>
              {instance.parameters.steps.map((step, index) => (
                <div key={index} style={{ marginBottom: 6, paddingBottom: 4, borderBottom: "1px dotted #ccc" }}>
                  <div style={{ opacity: 0.6, marginBottom: 2 }}>Step {index + 1}</div>
                  {(["width", "length", "height"] as const).map((key) => (
                    <NumberField
                      key={key}
                      label={key}
                      value={step[key]}
                      onChange={(v) => {
                        const steps = instance.parameters.geometryType === "stepped-rectangular" ? [...instance.parameters.steps] : [];
                        steps[index] = { ...steps[index], [key]: v } as RectangularStep;
                        updateParameters({ geometryType: "stepped-rectangular", steps });
                      }}
                    />
                  ))}
                </div>
              ))}
              <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
                <button
                  type="button"
                  onClick={() => {
                    if (instance.parameters.geometryType !== "stepped-rectangular") return;
                    const steps = [...instance.parameters.steps, { width: 0.5, length: 0.5, height: 0.3 }];
                    updateParameters({ geometryType: "stepped-rectangular", steps });
                  }}
                >
                  + Step
                </button>
                <button
                  type="button"
                  disabled={instance.parameters.steps.length <= 1}
                  onClick={() => {
                    if (instance.parameters.geometryType !== "stepped-rectangular") return;
                    updateParameters({
                      geometryType: "stepped-rectangular",
                      steps: instance.parameters.steps.slice(0, -1),
                    });
                  }}
                >
                  - Step
                </button>
              </div>
            </>
          )}

          <div style={{ opacity: 0.7, marginBottom: 8 }}>
            Base elevation (calculated): {instance.baseElevation.toFixed(3)} m
          </div>

          <button type="button" onClick={() => copyFoundationToOtherLegs(selectedLeg.id)} style={{ width: "100%" }}>
            Copy to other legs
          </button>

          {validation.length > 0 && (
            <ul style={{ marginTop: 8, paddingLeft: 16 }}>
              {validation.map((v, i) => (
                <li key={i} style={{ color: v.severity === "blocking" ? "#c02020" : "#c98a12", marginBottom: 4 }}>
                  {v.detail}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
