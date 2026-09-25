/**
 * Minimal plain-text DXF R12 (AC1009) writer -- the most widely readable
 * DXF version (AutoCAD, BricsCAD, QGIS, ezdxf all open it), and small
 * enough to write by hand rather than pull in a dependency for. 2D only:
 * every entity sits at z = 0. Supports exactly what the section export
 * needs -- layers (with CONTINUOUS/DASHED linetypes), LINE, POINT and
 * single-line TEXT -- nothing more.
 */

export type DxfLinetype = "CONTINUOUS" | "DASHED";
export type DxfTextAlign = "left" | "center";

interface DxfLayer {
  readonly name: string;
  readonly aciColour: number;
  readonly linetype: DxfLinetype;
}

export interface DxfDocument {
  /** Registers a layer and returns its sanitised name (use that name for entities). Re-adding an existing name keeps the first definition. */
  addLayer(name: string, aciColour: number, linetype?: DxfLinetype): string;
  line(layer: string, x1: number, y1: number, x2: number, y2: number): void;
  point(layer: string, x: number, y: number): void;
  text(layer: string, x: number, y: number, height: number, value: string, align?: DxfTextAlign): void;
  toString(): string;
}

const TRANSLITERATIONS: Record<string, string> = { ð: "d", Ð: "D", þ: "th", Þ: "TH", æ: "ae", Æ: "AE", ø: "o", Ø: "O", ß: "ss" };

/** R12 layer names allow only A-Z, 0-9, `$`, `-` and `_` -- transliterates common accented letters (e.g. Icelandic geotech layer names) and replaces anything else with `_`. */
export function sanitizeDxfLayerName(name: string): string {
  const ascii = Array.from(name)
    .map((ch) => TRANSLITERATIONS[ch] ?? ch)
    .join("")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
  const cleaned = ascii.toUpperCase().replace(/[^A-Z0-9$_-]+/g, "_").slice(0, 31);
  return cleaned || "LAYER";
}

/** R12 text is single-byte; `\U+XXXX` is the escape AutoCAD-family readers (and ezdxf) decode back into the original character. */
export function escapeDxfText(value: string): string {
  let out = "";
  for (const ch of value.replace(/[\r\n]+/g, " ")) {
    const code = ch.codePointAt(0)!;
    out += code < 0x80 ? ch : `\\U+${code.toString(16).toUpperCase().padStart(4, "0")}`;
  }
  return out;
}

function num(value: number): string {
  const fixed = value.toFixed(4);
  return fixed === "-0.0000" ? "0.0000" : fixed;
}

export function createDxfDocument(): DxfDocument {
  const layers = new Map<string, DxfLayer>([["0", { name: "0", aciColour: 7, linetype: "CONTINUOUS" }]]);
  const entities: string[] = [];
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  const extend = (x: number, y: number) => {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  };
  const finite = (...values: number[]) => values.every(Number.isFinite);
  const layerOf = (layer: string) => (layers.has(layer) ? layer : "0");

  return {
    addLayer(name, aciColour, linetype = "CONTINUOUS") {
      const safe = sanitizeDxfLayerName(name);
      if (!layers.has(safe)) layers.set(safe, { name: safe, aciColour, linetype });
      return safe;
    },

    line(layer, x1, y1, x2, y2) {
      if (!finite(x1, y1, x2, y2)) return;
      extend(x1, y1);
      extend(x2, y2);
      entities.push(
        "0", "LINE", "8", layerOf(layer),
        "10", num(x1), "20", num(y1), "30", "0.0",
        "11", num(x2), "21", num(y2), "31", "0.0"
      );
    },

    point(layer, x, y) {
      if (!finite(x, y)) return;
      extend(x, y);
      entities.push("0", "POINT", "8", layerOf(layer), "10", num(x), "20", num(y), "30", "0.0");
    },

    text(layer, x, y, height, value, align = "left") {
      if (!finite(x, y, height)) return;
      extend(x, y);
      entities.push(
        "0", "TEXT", "8", layerOf(layer),
        "10", num(x), "20", num(y), "30", "0.0",
        "40", num(height), "1", escapeDxfText(value)
      );
      // R12 aligns non-left text on the second alignment point (11/21), not the first.
      if (align === "center") entities.push("72", "1", "11", num(x), "21", num(y), "31", "0.0");
    },

    toString() {
      const hasExtents = Number.isFinite(minX);
      const out: string[] = [
        "0", "SECTION", "2", "HEADER",
        "9", "$ACADVER", "1", "AC1009",
        "9", "$INSBASE", "10", "0.0", "20", "0.0", "30", "0.0",
        "9", "$EXTMIN", "10", num(hasExtents ? minX : 0), "20", num(hasExtents ? minY : 0), "30", "0.0",
        "9", "$EXTMAX", "10", num(hasExtents ? maxX : 0), "20", num(hasExtents ? maxY : 0), "30", "0.0",
        "9", "$LTSCALE", "40", "1.0",
        "0", "ENDSEC",
        "0", "SECTION", "2", "TABLES",
        "0", "TABLE", "2", "LTYPE", "70", "2",
        "0", "LTYPE", "2", "CONTINUOUS", "70", "0", "3", "Solid line", "72", "65", "73", "0", "40", "0.0",
        "0", "LTYPE", "2", "DASHED", "70", "0", "3", "Dashed __ __ __", "72", "65", "73", "2", "40", "0.75",
        "49", "0.5", "49", "-0.25",
        "0", "ENDTAB",
        "0", "TABLE", "2", "LAYER", "70", String(layers.size),
      ];
      for (const layer of layers.values()) {
        out.push("0", "LAYER", "2", layer.name, "70", "0", "62", String(layer.aciColour), "6", layer.linetype);
      }
      out.push("0", "ENDTAB", "0", "ENDSEC", "0", "SECTION", "2", "ENTITIES", ...entities, "0", "ENDSEC", "0", "EOF");
      return `${out.join("\r\n")}\r\n`;
    },
  };
}
