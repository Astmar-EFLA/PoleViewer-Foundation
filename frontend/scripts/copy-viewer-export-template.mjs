// Copies the singlefile build output (dist-viewer-export/viewer-export.html)
// to public/viewer-export-template.html, where services/exportProjectHtml.ts
// fetches it at runtime -- run via `npm run build:viewer-export`, never by
// hand, so the two never drift apart.
import { copyFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const source = path.resolve(here, "..", "dist-viewer-export", "viewer-export.html");
const destination = path.resolve(here, "..", "public", "viewer-export-template.html");

copyFileSync(source, destination);
console.log(`Copied ${source} -> ${destination}`);
