/** Tiny DXF readers for tests -- just enough to inspect what services/dxfWriter.ts emits. */

/** Splits DXF text into its (group code, value) pairs. */
export function dxfPairs(dxf: string): [string, string][] {
  const lines = dxf.split(/\r?\n/);
  const pairs: [string, string][] = [];
  for (let i = 0; i + 1 < lines.length; i += 2) pairs.push([lines[i]!.trim(), lines[i + 1]!]);
  return pairs;
}

/** Every entity in the ENTITIES section as its type plus a code -> values map. */
export function dxfEntities(dxf: string): { type: string; codes: Map<string, string[]> }[] {
  const pairs = dxfPairs(dxf);
  const start = pairs.findIndex(([c, v], i) => c === "2" && v === "ENTITIES" && pairs[i - 1]?.[1] === "SECTION");
  const entities: { type: string; codes: Map<string, string[]> }[] = [];
  for (let i = start + 1; i < pairs.length; i += 1) {
    const [code, value] = pairs[i]!;
    if (code === "0") {
      if (value === "ENDSEC") break;
      entities.push({ type: value, codes: new Map() });
    } else {
      const codes = entities[entities.length - 1]!.codes;
      codes.set(code, [...(codes.get(code) ?? []), value]);
    }
  }
  return entities;
}
