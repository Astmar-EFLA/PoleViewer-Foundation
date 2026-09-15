import type { CSSProperties } from "react";
import { useProjectStore } from "../state/projectStore";

function fmt(n: number, digits = 3): string {
  return n.toFixed(digits);
}

/**
 * Distinguishes measured/interpolated/no-data explicitly in the label
 * itself (spec: cursor terrain read-out must show whether the value is
 * direct-from-point or interpolated) -- never just shows a number.
 */
export function CoordinateReadout() {
  const hover = useProjectStore((s) => s.hover);

  if (!hover) {
    return (
      <div style={readoutStyle}>
        <span style={{ opacity: 0.6 }}>Hover the terrain to read coordinates.</span>
      </div>
    );
  }

  const sourceLabel =
    hover.terrainQuerySource === "point"
      ? "measured point"
      : hover.terrainQuerySource === "interpolated"
        ? "interpolated (TIN)"
        : "no data";

  return (
    <div style={readoutStyle}>
      <span>
        <strong>Local</strong> x={fmt(hover.local.x)} y={fmt(hover.local.y)} z={fmt(hover.local.z)} m
      </span>
      <span style={{ marginLeft: 16 }}>
        <strong>Project</strong> E={fmt(hover.project.easting)} N={fmt(hover.project.northing)} El=
        {fmt(hover.project.elevation)}
      </span>
      <span style={{ marginLeft: 16 }}>
        <strong>Terrain</strong>{" "}
        {hover.terrainElevation === null ? "-" : `${fmt(hover.terrainElevation)} m`} ({sourceLabel})
      </span>
    </div>
  );
}

const readoutStyle: CSSProperties = {
  position: "absolute",
  bottom: 12,
  left: 12,
  right: 12,
  background: "rgba(255,255,255,0.92)",
  borderRadius: 6,
  padding: "8px 12px",
  boxShadow: "0 1px 4px rgba(0,0,0,0.2)",
  fontFamily: "ui-monospace, monospace",
  fontSize: 12,
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
};
