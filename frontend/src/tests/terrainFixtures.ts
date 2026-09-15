import type { TerrainPoint } from "../domain/terrain";
import { loadSyntheticFixtureJson } from "./fixtures";

interface TerrainFixtureFile {
  readonly points: readonly TerrainPoint[];
}

export function loadTerrainFixturePoints(filename: string): TerrainPoint[] {
  const file = loadSyntheticFixtureJson(filename) as TerrainFixtureFile;
  return [...file.points];
}
