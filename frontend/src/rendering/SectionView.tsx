import type { SectionResult, SectionSegment } from "../geometry/section";

interface SectionViewProps {
  readonly result: SectionResult;
  readonly mastCentreProjectElevation: number;
  readonly width?: number;
  readonly height?: number;
}

const MARGIN = { left: 60, right: 16, top: 16, bottom: 34 };

function niceStep(roughStep: number): number {
  if (!(roughStep > 0)) return 1;
  const magnitude = Math.pow(10, Math.floor(Math.log10(roughStep)));
  const residual = roughStep / magnitude;
  const niceResidual = residual < 1.5 ? 1 : residual < 3.5 ? 2 : residual < 7.5 ? 5 : 10;
  return niceResidual * magnitude;
}

/**
 * Flat 2D orthographic diagram of a vertical section, drawn directly from
 * the intersected segments computed by geometry/section.ts -- this
 * component performs no geometry of its own beyond the (s, z) -> screen
 * mapping, per "each section must derive from the same authoritative
 * three-dimensional geometry used in the main viewer" (spec section 14).
 * Horizontal and vertical scale are always equal (never distorted), so
 * depths, heights and slope angles read correctly.
 */
export function SectionView({ result, mastCentreProjectElevation, width = 760, height = 360 }: SectionViewProps) {
  const allS: number[] = [];
  const allZ: number[] = [];
  const collect = (segs: readonly SectionSegment[]) => {
    for (const seg of segs) {
      allS.push(seg.a.s, seg.b.s);
      allZ.push(seg.a.z, seg.b.z);
    }
  };
  collect(result.terrainSegments);
  for (const p of result.terrainSourcePoints) {
    allS.push(p.s);
    allZ.push(p.z);
  }
  for (const a of result.anchors) {
    allS.push(a.s);
    allZ.push(a.z);
  }
  for (const f of result.foundations) collect(f.segments);
  for (const e of result.excavations) collect(e.segments);
  for (const b of result.geotechBoundaries) collect(b.segments);
  if (result.groundwater) collect(result.groundwater.segments);

  if (allS.length === 0) {
    return (
      <div style={{ padding: 16, fontFamily: "system-ui, sans-serif", fontSize: 12, opacity: 0.65, width, height }}>
        Nothing in the current project crosses this section plane.
      </div>
    );
  }

  const sMin = Math.min(...allS);
  const sMax = Math.max(...allS);
  const zMin = Math.min(...allZ);
  const zMax = Math.max(...allZ);
  const sSpan = Math.max(sMax - sMin, 1e-6);
  const zSpan = Math.max(zMax - zMin, 1e-6);

  const usableWidth = width - MARGIN.left - MARGIN.right;
  const usableHeight = height - MARGIN.top - MARGIN.bottom;
  const padFactor = 0.1;
  const paddedSSpan = sSpan * (1 + padFactor * 2);
  const paddedZSpan = zSpan * (1 + padFactor * 2);
  const scale = Math.min(usableWidth / paddedSSpan, usableHeight / paddedZSpan);

  const sOrigin = sMin - sSpan * padFactor;
  const zTop = zMax + zSpan * padFactor;

  const toX = (s: number) => MARGIN.left + (s - sOrigin) * scale;
  const toY = (z: number) => MARGIN.top + (zTop - z) * scale;

  function renderSegments(
    segs: readonly SectionSegment[],
    colour: string,
    key: string,
    strokeWidth = 1.5,
    dashed = false
  ) {
    return segs.map((seg, i) => (
      <line
        key={`${key}-${i}`}
        x1={toX(seg.a.s)}
        y1={toY(seg.a.z)}
        x2={toX(seg.b.s)}
        y2={toY(seg.b.z)}
        stroke={colour}
        strokeWidth={strokeWidth}
        strokeDasharray={dashed ? "4 3" : undefined}
      />
    ));
  }

  const zStep = niceStep(zSpan / 5);
  const zTicks: number[] = [];
  for (let z = Math.ceil(zMin / zStep) * zStep; z <= zMax + 1e-9; z += zStep) zTicks.push(z);

  const sStep = niceStep(sSpan / 6);
  const sTicks: number[] = [];
  for (let s = Math.ceil(sMin / sStep) * sStep; s <= sMax + 1e-9; s += sStep) sTicks.push(s);

  const legendItems = [
    ...result.geotechBoundaries.map((b) => ({ id: b.id, name: b.name, colour: b.colour, status: b.verificationState })),
    ...(result.groundwater
      ? [{ id: result.groundwater.id, name: result.groundwater.name, colour: result.groundwater.colour, status: "n/a" }]
      : []),
  ];

  return (
    <div>
      <svg width={width} height={height} style={{ background: "#f4f6f2", borderRadius: 4 }}>
        {zTicks.map((z) => (
          <g key={`z-${z}`}>
            <line x1={MARGIN.left} y1={toY(z)} x2={width - MARGIN.right} y2={toY(z)} stroke="#d8d8d8" strokeWidth={1} />
            <text x={MARGIN.left - 6} y={toY(z) + 3} fontSize={9} textAnchor="end" fill="#555">
              {z.toFixed(1)}
            </text>
            <text x={4} y={toY(z) + 3} fontSize={8} fill="#999">
              {(z + mastCentreProjectElevation).toFixed(1)}
            </text>
          </g>
        ))}
        {sTicks.map((s) => (
          <g key={`s-${s}`}>
            <line
              x1={toX(s)}
              y1={MARGIN.top}
              x2={toX(s)}
              y2={height - MARGIN.bottom}
              stroke="#e6e6e6"
              strokeWidth={1}
            />
            <text x={toX(s)} y={height - MARGIN.bottom + 13} fontSize={9} textAnchor="middle" fill="#555">
              {s.toFixed(1)}
            </text>
          </g>
        ))}

        {renderSegments(result.terrainSegments, "#6b5636", "terrain", 2)}
        {result.terrainSourcePoints.map((p, i) => (
          <circle key={`tp-${i}`} cx={toX(p.s)} cy={toY(p.z)} r={1.4} fill="#3a2f1c" />
        ))}

        {result.geotechBoundaries.map((b) => (
          <g key={b.id}>{renderSegments(b.segments, b.colour, b.id, 1.2, true)}</g>
        ))}
        {result.groundwater && renderSegments(result.groundwater.segments, result.groundwater.colour, "groundwater", 1.4, true)}

        {result.foundations.map((f) => (
          <g key={f.instanceId}>{renderSegments(f.segments, f.colour, f.instanceId, 1.6)}</g>
        ))}
        {result.excavations.map((e) => (
          <g key={e.excavationId}>
            {renderSegments(e.segments, e.truncated ? "#c02020" : e.colour, e.excavationId, 1.4)}
          </g>
        ))}

        {result.anchors.map((a) => (
          <g key={a.anchorId}>
            <circle cx={toX(a.s)} cy={toY(a.z)} r={3} fill="#e0a030" />
            <text x={toX(a.s) + 5} y={toY(a.z) - 5} fontSize={9} fill="#333">
              {a.name}
            </text>
          </g>
        ))}

        <text x={4} y={height - 6} fontSize={8} fill="#999">
          local Z / project elevation (m)
        </text>
      </svg>
      {legendItems.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 4, fontSize: 10 }}>
          {legendItems.map((item) => (
            <span key={item.id} style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <span style={{ width: 10, height: 10, background: item.colour, display: "inline-block", borderRadius: 2 }} />
              {item.name}
              {item.status !== "n/a" && <span style={{ opacity: 0.6 }}>({item.status})</span>}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
