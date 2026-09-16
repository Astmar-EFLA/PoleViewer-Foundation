import react from "@vitejs/plugin-react";
import path from "node:path";
import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

/**
 * Builds viewer-export.html into exactly one self-contained .html file (all
 * JS/CSS inlined, no external <script src>/<link> references -- see
 * viteSingleFile()) so it can be emailed to a contractor or opened straight
 * from disk with no server, no app install, and no network access. This is
 * a *separate* build from the main app (npm run build) -- that one still
 * needs a normal multi-file output served by a real web server, so
 * inlining everything into one file would be pure regression there.
 *
 * Output (dist-viewer-export/viewer-export.html) is not itself distributed
 * -- it is copied to frontend/public/viewer-export-template.html, which
 * services/exportProjectHtml.ts fetches at runtime and injects the live
 * project's JSON into (replacing the `#embedded-project-json` placeholder).
 * Re-run `npm run build:viewer-export` (and re-copy) whenever
 * viewer-export/ or anything it renders (Scene, Toolbar, ReportModal, ...)
 * changes -- the template is a build artifact, not hand-maintained.
 */
export default defineConfig({
  plugins: [react(), viteSingleFile()],
  build: {
    outDir: "dist-viewer-export",
    emptyOutDir: true,
    rollupOptions: {
      input: path.resolve(__dirname, "viewer-export.html"),
    },
    // The whole point is one file with everything inlined -- an inline
    // size warning here would just be noise.
    chunkSizeWarningLimit: 10_000,
  },
});
