import type { PointerEvent as ReactPointerEvent } from "react";
import { useEffect, useRef, useState } from "react";
import type { PoleMemberCategory } from "../domain/poleModel";
import { POLE_MEMBER_COLOURS } from "../domain/poleModel";
import type { SectionBoundaryLine, SectionResult, SectionSegment, SectionXZ } from "../geometry/section";

interface SectionViewProps {
  readonly result: SectionResult;
  readonly mastCentreProjectElevation: number;
  readonly width?: number;
  readonly height?: number;
  /** Changing this resets pan/zoom back to fit-all -- e.g. the active section's own id, so switching sections doesn't carry over a stale zoom, but re-rendering the SAME section after an edit does. */
  readonly resetViewKey?: string;
}

const MARGIN = { left: 62, right: 20, top: 20, bottom: 40 };

const FONT_FAMILY = "Arial, Helvetica, sans-serif";
const INK = "#1a1a1a";
const MUTED = "#707070"; // EFLA grey
const ACCENT = "#FA0000"; // EFLA red -- used once, for the mast-centre reference line only

const ZOOM_STEP = 1.18;

interface View {
  readonly scale: number; // pixels per metre; always equal for both axes -- never distorted.
  readonly sCenter: number;
  readonly zCenter: number;
}

function niceStep(roughStep: number): number {
  if (!(roughStep > 0)) return 1;
  const magnitude = Math.pow(10, Math.floor(Math.log10(roughStep)));
  const residual = roughStep / magnitude;
  const niceResidual = residual < 1.5 ? 1 : residual < 3.5 ? 2 : residual < 7.5 ? 5 : 10;
  return niceResidual * magnitude;
}

/** Dedupes and left-to-right sorts every segment endpoint into a single polyline -- boundary-surface/plane intersections chain naturally along a smoothly varying surface, so this is a reasonable reconstruction even though the segment list itself carries no explicit order. */
function polylineFromSegments(segs: readonly SectionSegment[]): SectionXZ[] {
  const points = new Map<string, SectionXZ>();
  for (const seg of segs) {
    points.set(`${seg.a.s.toFixed(4)},${seg.a.z.toFixed(4)}`, seg.a);
    points.set(`${seg.b.s.toFixed(4)},${seg.b.z.toFixed(4)}`, seg.b);
  }
  return Array.from(points.values()).sort((a, b) => a.s - b.s);
}

interface GeotechLayerPair {
  readonly layerId: string;
  readonly name: string;
  readonly colour: string;
  readonly verificationState: string;
  readonly top: SectionBoundaryLine;
  readonly bottom: SectionBoundaryLine;
}

/** Reconstructs top/bottom pairs from the flat boundary-line list -- geometry/section.ts emits one `<layerId>-top` and one `<layerId>-bottom` SectionBoundaryLine per geotech layer (see generateSectionResult), so the pairing is fully recoverable from the ids alone without needing the original GeotechLayer objects as a prop. */
function pairGeotechLayers(boundaries: readonly SectionBoundaryLine[]): GeotechLayerPair[] {
  const byLayerId = new Map<string, { top?: SectionBoundaryLine; bottom?: SectionBoundaryLine }>();
  for (const b of boundaries) {
    if (b.id.endsWith("-top")) {
      const layerId = b.id.slice(0, -4);
      byLayerId.set(layerId, { ...byLayerId.get(layerId), top: b });
    } else if (b.id.endsWith("-bottom")) {
      const layerId = b.id.slice(0, -7);
      byLayerId.set(layerId, { ...byLayerId.get(layerId), bottom: b });
    }
  }
  const pairs: GeotechLayerPair[] = [];
  for (const [layerId, { top, bottom }] of byLayerId) {
    if (!top || !bottom) continue;
    pairs.push({
      layerId,
      name: top.name.replace(/ \(top\)$/, ""),
      colour: top.colour,
      verificationState: top.verificationState,
      top,
      bottom,
    });
  }
  return pairs;
}

const POLE_MEMBER_CATEGORY_ORDER: readonly PoleMemberCategory[] = ["structure", "insulator", "cable"];

const POLE_MEMBER_LEGEND_LABELS: Record<PoleMemberCategory, string> = {
  structure: "Tower (projected)",
  insulator: "Insulators",
  cable: "Cables",
};

function clamp(value: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, value));
}

/**
 * Flat 2D orthographic diagram of a vertical section, drawn directly from
 * the intersected segments computed by geometry/section.ts -- this
 * component performs no geometry of its own beyond the (s, z) -> screen
 * mapping, per "each section must derive from the same authoritative
 * three-dimensional geometry used in the main viewer" (spec section 14).
 * Horizontal and vertical scale are always equal (never distorted), so
 * depths, heights and slope angles read correctly -- zooming changes how
 * much of the section is visible, never the s:z ratio.
 *
 * Ticks/gridlines are generated from the CURRENTLY VISIBLE domain, not the
 * full data extent, so they stay a sensible density as you zoom in rather
 * than staying fixed at whatever spacing suited the fit-all view.
 */
export function SectionView({
  result,
  mastCentreProjectElevation,
  width = 760,
  height = 360,
  resetViewKey,
}: SectionViewProps) {
  const [view, setView] = useState<View | null>(null);
  const dragRef = useRef<{ pointerId: number; startClientX: number; startClientY: number; startView: View } | null>(
    null
  );
  const [isDragging, setIsDragging] = useState(false);
  const svgRef = useRef<SVGSVGElement>(null);
  // React's onWheel is a passive listener (can't preventDefault there, which
  // is required to stop the page itself scrolling while zooming) -- a
  // native, explicitly non-passive listener is the only way around that.
  // Always reads through this ref so the listener itself never needs to be
  // re-attached as scale/sCenter/zCenter change on every zoom/pan.
  const zoomAtRef = useRef<(xPx: number, yPx: number, factor: number) => void>(() => {});

  // A new section (switched tab, not just an edit to the same one) starts fresh at fit-all.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => setView(null), [resetViewKey]);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const handler = (e: WheelEvent) => {
      e.preventDefault();
      const rect = svg.getBoundingClientRect();
      const xPx = ((e.clientX - rect.left) / rect.width) * width;
      const yPx = ((e.clientY - rect.top) / rect.height) * height;
      zoomAtRef.current(xPx, yPx, e.deltaY > 0 ? 1 / ZOOM_STEP : ZOOM_STEP);
    };
    svg.addEventListener("wheel", handler, { passive: false });
    return () => svg.removeEventListener("wheel", handler);
  }, [width, height]);

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
  for (const fl of result.fillOutlines) collect(fl.segments);
  for (const fl of result.upliftFillOutlines) collect(fl.segments);
  for (const b of result.geotechBoundaries) collect(b.segments);
  if (result.groundwater) collect(result.groundwater.segments);
  // The projected tower counts toward the full extent (so zooming out always
  // reaches its top), but not the default structure fit below -- a tower is
  // several times taller than its foundations, and fitting it would shrink
  // the foundation detail this view opens on.
  collect(result.poleMembers);

  if (allS.length === 0) {
    return (
      <div style={{ padding: 16, fontFamily: FONT_FAMILY, fontSize: 12, opacity: 0.65, width, height }}>
        Nothing in the current project crosses this section plane.
      </div>
    );
  }

  const usableWidth = width - MARGIN.left - MARGIN.right;
  const usableHeight = height - MARGIN.top - MARGIN.bottom;
  const padFactor = 0.1;

  function fitFrom(sVals: readonly number[], zVals: readonly number[]): View {
    const sMin = Math.min(...sVals);
    const sMax = Math.max(...sVals);
    const zMin = Math.min(...zVals);
    const zMax = Math.max(...zVals);
    const sSpan = Math.max(sMax - sMin, 1e-6);
    const zSpan = Math.max(zMax - zMin, 1e-6);
    const paddedSSpan = sSpan * (1 + padFactor * 2);
    const paddedZSpan = zSpan * (1 + padFactor * 2);
    const scale = Math.min(usableWidth / paddedSSpan, usableHeight / paddedZSpan);
    return { scale, sCenter: (sMin + sMax) / 2, zCenter: (zMin + zMax) / 2 };
  }

  // Full-extent fit (terrain, geotech layers, everything) -- used only to
  // bound how far out zooming can go, so "see the whole profile" is always
  // reachable by scrolling out.
  const fitView = fitFrom(allS, allZ);
  const minScale = fitView.scale * 0.4;
  const maxScale = fitView.scale * 200;

  // The INITIAL/reset view fits only the built structures (foundations,
  // anchors, excavation, fill) -- a geotech profile can span the whole
  // terrain clip width, which made the old "fit everything" default open
  // zoomed out far past the point anyone actually looks at first. Falls
  // back to the full-extent fit for a section that happens to cross no
  // structure at all.
  const structureS: number[] = [];
  const structureZ: number[] = [];
  const collectInto = (sArr: number[], zArr: number[], segs: readonly SectionSegment[]) => {
    for (const seg of segs) {
      sArr.push(seg.a.s, seg.b.s);
      zArr.push(seg.a.z, seg.b.z);
    }
  };
  for (const a of result.anchors) {
    structureS.push(a.s);
    structureZ.push(a.z);
  }
  for (const f of result.foundations) collectInto(structureS, structureZ, f.segments);
  for (const e of result.excavations) collectInto(structureS, structureZ, e.segments);
  for (const fl of result.fillOutlines) collectInto(structureS, structureZ, fl.segments);
  for (const fl of result.upliftFillOutlines) collectInto(structureS, structureZ, fl.segments);
  const structureFit = structureS.length > 0 ? fitFrom(structureS, structureZ) : null;
  const defaultView = structureFit ? { ...structureFit, scale: clamp(structureFit.scale, minScale, maxScale) } : fitView;

  const effective = view ?? defaultView;
  const { scale, sCenter, zCenter } = effective;

  const plotCentreX = MARGIN.left + usableWidth / 2;
  const plotCentreY = MARGIN.top + usableHeight / 2;

  const toX = (s: number) => plotCentreX + (s - sCenter) * scale;
  const toY = (z: number) => plotCentreY - (z - zCenter) * scale;
  const fromXY = (xPx: number, yPx: number) => ({
    s: sCenter + (xPx - plotCentreX) / scale,
    z: zCenter - (yPx - plotCentreY) / scale,
  });

  function zoomAt(xPx: number, yPx: number, factor: number) {
    const before = fromXY(xPx, yPx);
    const newScale = clamp(scale * factor, minScale, maxScale);
    setView({
      scale: newScale,
      sCenter: before.s - (xPx - plotCentreX) / newScale,
      zCenter: before.z + (yPx - plotCentreY) / newScale,
    });
  }
  zoomAtRef.current = zoomAt;

  function handlePointerDown(e: ReactPointerEvent<SVGSVGElement>) {
    if (e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = { pointerId: e.pointerId, startClientX: e.clientX, startClientY: e.clientY, startView: effective };
    setIsDragging(true);
  }

  function handlePointerMove(e: ReactPointerEvent<SVGSVGElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const dxPx = ((e.clientX - drag.startClientX) / rect.width) * width;
    const dyPx = ((e.clientY - drag.startClientY) / rect.height) * height;
    setView({
      scale: drag.startView.scale,
      sCenter: drag.startView.sCenter - dxPx / drag.startView.scale,
      zCenter: drag.startView.zCenter + dyPx / drag.startView.scale,
    });
  }

  function endDrag(e: ReactPointerEvent<SVGSVGElement>) {
    if (dragRef.current?.pointerId === e.pointerId) dragRef.current = null;
    setIsDragging(false);
  }

  function renderSegments(
    segs: readonly SectionSegment[],
    colour: string,
    key: string,
    strokeWidth = 1,
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
        strokeLinecap="round"
        strokeDasharray={dashed ? "3 2.5" : undefined}
      />
    ));
  }

  // Ticks follow the currently VISIBLE window, not the full data extent, so they stay
  // a sensible density (and stay a "nice" round number) at any zoom level.
  const visSMin = sCenter - usableWidth / 2 / scale;
  const visSMax = sCenter + usableWidth / 2 / scale;
  const visZMin = zCenter - usableHeight / 2 / scale;
  const visZMax = zCenter + usableHeight / 2 / scale;

  const zStep = niceStep((visZMax - visZMin) / 5);
  const zTicks: number[] = [];
  for (let z = Math.ceil(visZMin / zStep) * zStep; z <= visZMax + 1e-9; z += zStep) zTicks.push(z);

  const sStep = niceStep((visSMax - visSMin) / 6);
  const sTicks: number[] = [];
  for (let s = Math.ceil(visSMin / sStep) * sStep; s <= visSMax + 1e-9; s += sStep) sTicks.push(s);

  const layerPairs = pairGeotechLayers(result.geotechBoundaries);
  const layerFills = layerPairs
    .map((pair) => {
      const topLine = polylineFromSegments(pair.top.segments);
      const bottomLine = polylineFromSegments(pair.bottom.segments);
      if (topLine.length < 2 || bottomLine.length < 2) return null;
      const points = [...topLine, ...[...bottomLine].reverse()].map((p) => `${toX(p.s)},${toY(p.z)}`).join(" ");
      return { ...pair, points };
    })
    .filter((f): f is NonNullable<typeof f> => f !== null);

  // Scale bar length: the largest "nice" round metre value that still fits in about a fifth of the drawing width.
  const scaleBarMetres = niceStep((usableWidth / scale) * 0.2);
  const scaleBarPx = scaleBarMetres * scale;
  const clipId = `section-clip-${resetViewKey ?? "default"}`;

  const memberCategories = POLE_MEMBER_CATEGORY_ORDER.filter((c) => result.poleMembers.some((m) => m.category === c));
  const legendItems = [
    ...memberCategories.map((c) => ({
      id: `tower-${c}`,
      name: POLE_MEMBER_LEGEND_LABELS[c],
      colour: POLE_MEMBER_COLOURS[c],
      status: "n/a",
      hatch: false,
    })),
    ...layerPairs.map((p) => ({ id: p.layerId, name: p.name, colour: p.colour, status: p.verificationState, hatch: true })),
    ...(result.groundwater
      ? [{ id: result.groundwater.id, name: result.groundwater.name, colour: result.groundwater.colour, status: "n/a", hatch: false }]
      : []),
  ];

  const zoomButtonStyle = {
    width: 22,
    height: 22,
    lineHeight: "20px",
    padding: 0,
    fontSize: 13,
    border: `1px solid ${MUTED}`,
    borderRadius: 3,
    background: "#ffffff",
    color: INK,
    cursor: "pointer",
  } as const;

  return (
    <div style={{ fontFamily: FONT_FAMILY, position: "relative" }}>
      <svg
        ref={svgRef}
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        style={{ background: "#ffffff", borderRadius: 3, touchAction: "none", cursor: isDragging ? "grabbing" : "grab" }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={endDrag}
        onPointerLeave={endDrag}
        onPointerCancel={endDrag}
      >
        <defs>
          <clipPath id={clipId}>
            <rect x={MARGIN.left} y={MARGIN.top} width={usableWidth} height={usableHeight} />
          </clipPath>
          {layerPairs.map((p, i) => (
            <pattern
              key={p.layerId}
              id={`hatch-${p.layerId}`}
              patternUnits="userSpaceOnUse"
              width={7}
              height={7}
              patternTransform={`rotate(${i % 2 === 0 ? 45 : 135})`}
            >
              <rect width={7} height={7} fill={p.colour} fillOpacity={0.07} />
              <line x1={0} y1={0} x2={0} y2={7} stroke={p.colour} strokeWidth={1} strokeOpacity={0.6} />
            </pattern>
          ))}
        </defs>

        {/* Drawing frame */}
        <rect x={0.5} y={0.5} width={width - 1} height={height - 1} fill="none" stroke={MUTED} strokeWidth={1} />

        {zTicks.map((z) => (
          <g key={`z-${z}`}>
            <line x1={MARGIN.left} y1={toY(z)} x2={width - MARGIN.right} y2={toY(z)} stroke="#e6e6e6" strokeWidth={0.6} />
            <text x={MARGIN.left - 7} y={toY(z) + 3} fontSize={9} textAnchor="end" fill={INK} fontFamily={FONT_FAMILY}>
              {z.toFixed(1)}
            </text>
            <text x={5} y={toY(z) + 3} fontSize={7.5} fill={MUTED} fontFamily={FONT_FAMILY}>
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
              stroke="#f0f0f0"
              strokeWidth={0.6}
            />
            <text x={toX(s)} y={height - MARGIN.bottom + 14} fontSize={9} textAnchor="middle" fill={INK} fontFamily={FONT_FAMILY}>
              {s.toFixed(1)}
            </text>
          </g>
        ))}

        <g clipPath={`url(#${clipId})`}>
          {/* Mast-centre reference line (s=0) -- the one deliberate, sparing use of EFLA red as an accent. */}
          <line
            x1={toX(0)}
            y1={MARGIN.top}
            x2={toX(0)}
            y2={height - MARGIN.bottom}
            stroke={ACCENT}
            strokeWidth={0.8}
            strokeDasharray="1 3"
            strokeOpacity={0.55}
          />

          {layerFills.map((f) => (
            <polygon key={f.layerId} points={f.points} fill={`url(#hatch-${f.layerId})`} stroke="none" />
          ))}

          {renderSegments(result.terrainSegments, "#6b5636", "terrain", 1.4)}
          {result.terrainSourcePoints.map((p, i) => (
            <circle key={`tp-${i}`} cx={toX(p.s)} cy={toY(p.z)} r={0.9} fill="#3a2f1c" fillOpacity={0.7} />
          ))}

          {layerPairs.map((p) => (
            <g key={p.layerId}>
              {renderSegments(p.top.segments, p.colour, `${p.layerId}-top`, 0.9, true)}
              {renderSegments(p.bottom.segments, p.colour, `${p.layerId}-bottom`, 0.9, true)}
            </g>
          ))}
          {result.groundwater && renderSegments(result.groundwater.segments, result.groundwater.colour, "groundwater", 1.1, true)}

          {memberCategories.map((c) => (
            <g key={`tower-${c}`}>
              {renderSegments(
                result.poleMembers.filter((m) => m.category === c),
                POLE_MEMBER_COLOURS[c],
                `tower-${c}`,
                c === "structure" ? 1 : 0.8
              )}
            </g>
          ))}

          {result.foundations.map((f) => (
            <g key={f.instanceId}>{renderSegments(f.segments, f.colour, f.instanceId, 1.2)}</g>
          ))}
          {result.excavations.map((e) => (
            <g key={e.excavationId}>
              {renderSegments(e.segments, e.truncated ? ACCENT : e.colour, e.excavationId, 1)}
            </g>
          ))}
          {result.fillOutlines.map((fl) => (
            <g key={fl.fillId}>
              {renderSegments(fl.segments, fl.truncated ? ACCENT : fl.colour, fl.fillId, 1, true)}
            </g>
          ))}
          {result.upliftFillOutlines.map((fl) => (
            <g key={fl.fillId}>
              {renderSegments(fl.segments, fl.truncated ? ACCENT : fl.colour, fl.fillId, 1, true)}
            </g>
          ))}

          {result.anchors.map((a) => (
            <g key={a.anchorId}>
              <circle cx={toX(a.s)} cy={toY(a.z)} r={2.4} fill="#ffffff" stroke="#e0a030" strokeWidth={1.4} />
              <text x={toX(a.s) + 5} y={toY(a.z) - 5} fontSize={8.5} fill={INK} fontFamily={FONT_FAMILY}>
                {a.name}
              </text>
            </g>
          ))}
        </g>

        {/* Scale bar */}
        <g transform={`translate(${width - MARGIN.right - scaleBarPx}, ${height - 12})`}>
          <line x1={0} y1={0} x2={scaleBarPx} y2={0} stroke={INK} strokeWidth={1} />
          <line x1={0} y1={-3} x2={0} y2={3} stroke={INK} strokeWidth={1} />
          <line x1={scaleBarPx} y1={-3} x2={scaleBarPx} y2={3} stroke={INK} strokeWidth={1} />
          <text x={scaleBarPx / 2} y={-5} fontSize={8} textAnchor="middle" fill={MUTED} fontFamily={FONT_FAMILY}>
            {scaleBarMetres} m
          </text>
        </g>

        <text x={5} y={13} fontSize={8} fill={MUTED} fontFamily={FONT_FAMILY}>
          local Z / project elevation (m)
        </text>
      </svg>

      <div style={{ position: "absolute", top: 4, right: 4, display: "flex", flexDirection: "column", gap: 2 }}>
        <button
          type="button"
          title="Zoom in"
          style={zoomButtonStyle}
          onClick={() => zoomAt(plotCentreX, plotCentreY, ZOOM_STEP)}
        >
          +
        </button>
        <button
          type="button"
          title="Zoom out"
          style={zoomButtonStyle}
          onClick={() => zoomAt(plotCentreX, plotCentreY, 1 / ZOOM_STEP)}
        >
          &minus;
        </button>
        <button type="button" title="Reset view" style={zoomButtonStyle} onClick={() => setView(null)}>
          &#8634;
        </button>
      </div>

      {legendItems.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 6, fontSize: 10, fontFamily: FONT_FAMILY }}>
          {legendItems.map((item) => (
            <span key={item.id} style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <svg width={12} height={12} style={{ flexShrink: 0 }}>
                {item.hatch && (
                  <defs>
                    <pattern id={`legend-hatch-${item.id}`} patternUnits="userSpaceOnUse" width={5} height={5} patternTransform="rotate(45)">
                      <rect width={5} height={5} fill={item.colour} fillOpacity={0.1} />
                      <line x1={0} y1={0} x2={0} y2={5} stroke={item.colour} strokeWidth={1} strokeOpacity={0.7} />
                    </pattern>
                  </defs>
                )}
                <rect
                  width={12}
                  height={12}
                  fill={item.hatch ? `url(#legend-hatch-${item.id})` : item.colour}
                  stroke={item.colour}
                  strokeWidth={1}
                />
              </svg>
              {item.name}
              {item.status !== "n/a" && <span style={{ opacity: 0.6 }}>({item.status})</span>}
            </span>
          ))}
        </div>
      )}
      <div style={{ fontSize: 9, color: MUTED, marginTop: 3 }}>Scroll to zoom, drag to pan.</div>
    </div>
  );
}
