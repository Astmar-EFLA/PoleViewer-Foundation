import react from "@vitejs/plugin-react";
import path from "node:path";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  server: {
    fs: {
      // Allows importing synthetic fixtures from the repo-root fixtures/
      // folder (one level above this workspace), used only for the Phase-1
      // demo project bootstrap -- see services/buildSyntheticDemoProject.ts.
      allow: [path.resolve(__dirname, "..")],
    },
  },
});
