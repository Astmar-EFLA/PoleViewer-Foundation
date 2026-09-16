import { useEffect, useMemo, useState } from "react";
import { CoordinateReadout } from "../rendering/CoordinateReadout";
import { ErrorBoundary } from "../rendering/ErrorBoundary";
import { ReportModal } from "../rendering/ReportModal";
import { Scene } from "../rendering/Scene";
import { SectionPanel } from "../rendering/SectionPanel";
import { Toolbar } from "../rendering/Toolbar";
import { deserializeProject } from "../services/projectSerialization";
import { useProjectStore } from "../state/projectStore";

/**
 * Reads the project embedded by services/exportProjectHtml.ts into this
 * page's own `#embedded-project-json` tag (see viewer-export.html) --
 * substituted in at export time, so at runtime this is just a JSON string
 * already sitting in the DOM, no fetch/backend involved. Goes through the
 * same deserializeProject() (schema validation + migration) as opening a
 * project file normally does -- an exported file is handed to someone
 * outside the team, so a corrupted or hand-edited embed must fail loudly
 * with a real error, never render a half-valid scene.
 */
function readEmbeddedProject(): { project: ReturnType<typeof deserializeProject> } {
  const el = document.getElementById("embedded-project-json");
  const raw = el?.textContent?.trim();
  if (!raw || raw === "null") {
    return { project: { success: false, errors: ["This page has no project embedded in it."] } };
  }
  return { project: deserializeProject(raw) };
}

/**
 * The standalone entry point built by vite.viewer-export.config.ts (via
 * `npm run build:viewer-export`) into one self-contained HTML file with no
 * external references (confirmed: nothing in rendering/ loads a texture,
 * HDRI, or other network asset -- see the plan this was built from) --
 * open it straight from disk, no server or app install needed. Reuses the
 * exact same view components as the live app (Scene/Toolbar/SectionPanel/
 * ReportModal/CoordinateReadout) so the exported viewer never drifts from
 * what the app itself renders; only the project bootstrap differs
 * (embedded JSON here vs. the synthetic demo / live edits in app/App.tsx).
 */
export function ViewerExportApp() {
  const project = useProjectStore((s) => s.project);
  const setProject = useProjectStore((s) => s.setProject);
  const [loadError, setLoadError] = useState<string | null>(null);

  const embedded = useMemo(() => readEmbeddedProject(), []);

  useEffect(() => {
    if (embedded.project.success) {
      setProject(embedded.project.data);
    } else {
      setLoadError(embedded.project.errors.join("; "));
    }
  }, [embedded, setProject]);

  if (loadError) {
    return (
      <div style={{ padding: 24, fontFamily: "system-ui, sans-serif" }}>
        <h2>Could not load the embedded project</h2>
        <p style={{ opacity: 0.7 }}>{loadError}</p>
      </div>
    );
  }

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <ErrorBoundary label="3D view">
        {project ? (
          <Scene project={project} />
        ) : (
          <div style={{ padding: 24, fontFamily: "system-ui, sans-serif" }}>Loading project...</div>
        )}
      </ErrorBoundary>
      <ErrorBoundary label="Toolbar">
        <Toolbar />
      </ErrorBoundary>
      <ErrorBoundary label="Sections panel">
        <SectionPanel />
      </ErrorBoundary>
      <ErrorBoundary label="Coordinate readout">
        <CoordinateReadout />
      </ErrorBoundary>
      <ErrorBoundary label="Report">
        <ReportModal />
      </ErrorBoundary>
    </div>
  );
}
