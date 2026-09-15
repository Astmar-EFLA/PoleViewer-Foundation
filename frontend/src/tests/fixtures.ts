import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// frontend/src/tests -> frontend/src -> frontend -> repo root
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

export function loadSyntheticFixtureJson(filename: string): unknown {
  const fullPath = path.join(REPO_ROOT, "fixtures", "synthetic", filename);
  return JSON.parse(readFileSync(fullPath, "utf-8"));
}
