/**
 * Exports the current project as one self-contained, distributable HTML
 * file: the full interactive viewer (3D scene, sections, report -- the
 * exact same components the live app renders, see viewer-export/) with
 * this project's data embedded directly in the page. A contractor with no
 * access to this app, and no network connection, can open the file
 * straight from disk and get the real thing, not a screenshot.
 *
 * The viewer itself is a *prebuilt* artifact (frontend/public/viewer-export-template.html,
 * produced by `npm run build:viewer-export` -- see vite.viewer-export.config.ts) with a
 * placeholder tag; this module's job at export time is only to splice the
 * live project's JSON into that placeholder and trigger a download. It
 * never re-bundles anything at runtime.
 */
import type { Project } from "../domain/project";
import { downloadText } from "./browserDownload";
import { serializeProject } from "./projectSerialization";

const TEMPLATE_URL = "/viewer-export-template.html";
const EMBED_TAG_OPEN = '<script id="embedded-project-json" type="application/json">';
const EMBED_TAG_CLOSE = "</script>";
// The open tag and close tag matched *separately* would also match this
// module's own EMBED_TAG_OPEN/EMBED_TAG_CLOSE string constants once they get
// bundled into the very template being searched (ReportModal imports this
// module, and ViewerExportApp reuses ReportModal -- so the viewer bundle's
// own minified JS contains these exact strings as data, ahead of the real
// tag in the document). Matching the whole placeholder -- open tag, the
// literal "null" body it always ships with, and the close tag -- as one
// contiguous string sidesteps that false match entirely, since nowhere in
// this module's own source is "null</script>" written immediately after
// the open tag.
const EMBED_PLACEHOLDER = `${EMBED_TAG_OPEN}null${EMBED_TAG_CLOSE}`;

export class ViewerExportError extends Error {}

/**
 * Escapes the one sequence that would let embedded JSON break out of its
 * <script type="application/json"> tag early (a literal "</script",
 * case-insensitively) -- the standard guard for embedding arbitrary JSON
 * inside an HTML <script> tag, same concern as any JSON-in-script
 * hydration payload.
 */
function escapeForScriptEmbedding(json: string): string {
  return json.replace(/<\/script/gi, "<\\/script");
}

/**
 * Splices the given project's JSON into the prebuilt viewer template by
 * replacing the exact placeholder it ships with (see viewer-export.html;
 * EMBED_PLACEHOLDER above explains why the whole placeholder, not just its
 * open tag, is matched). Exported (rather than kept private) so it's
 * directly unit-testable without a fetch mock.
 */
export function embedProjectIntoTemplate(templateHtml: string, project: Project): string {
  const placeholderIndex = templateHtml.indexOf(EMBED_PLACEHOLDER);
  if (placeholderIndex === -1) {
    throw new ViewerExportError(
      'Viewer template is missing the "embedded-project-json" placeholder -- rebuild it with `npm run build:viewer-export`.'
    );
  }

  const json = escapeForScriptEmbedding(serializeProject(project));
  const before = templateHtml.slice(0, placeholderIndex);
  const after = templateHtml.slice(placeholderIndex + EMBED_PLACEHOLDER.length);
  return `${before}${EMBED_TAG_OPEN}${json}${EMBED_TAG_CLOSE}${after}`;
}

function projectFileBaseName(project: Project): string {
  const slug = project.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return slug || "project";
}

/**
 * Fetches the prebuilt viewer template, embeds this exact project (a
 * snapshot -- opening the downloaded file later never reflects edits made
 * in the live app afterward), and downloads the result as one .html file.
 * `fileBaseName` overrides the default `<project-name>-viewer` filename (the
 * batch export names each file after its mast instead).
 */
export async function exportProjectAsStandaloneHtml(
  project: Project,
  fileBaseName: string = `${projectFileBaseName(project)}-viewer`
): Promise<void> {
  const response = await fetch(TEMPLATE_URL);
  if (!response.ok) {
    throw new ViewerExportError(
      `Could not load the viewer template (HTTP ${response.status}). It may not have been built yet -- run \`npm run build:viewer-export\`.`
    );
  }
  const template = await response.text();
  const html = embedProjectIntoTemplate(template, project);
  downloadText(html, `${fileBaseName}.html`, "text/html");
}
