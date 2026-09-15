import type { Project } from "../domain/project";
import type { ParseResult } from "../validation/parseResult";
import { downloadText } from "./browserDownload";
import { deserializeProject, serializeProject } from "./projectSerialization";

function sanitizeFilename(name: string): string {
  const cleaned = name
    .trim()
    .replace(/[^a-z0-9-_]+/gi, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return cleaned.length > 0 ? cleaned : "project";
}

/**
 * "Save" (spec section 20/8: "save; reopen"). This is the "explicit
 * project-file saving" option from the recommended technology list, not
 * IndexedDB -- a plain JSON file the user keeps wherever they choose, no
 * browser storage involved, consistent with local-first (ADR-001).
 */
export function downloadProjectJson(project: Project): void {
  downloadText(serializeProject(project), `${sanitizeFilename(project.name)}.project.json`, "application/json");
}

/** "Reopen": reads a user-selected file and runs it through the same migration + schema validation gate as any other load -- a malformed or incompatible file is reported with explicit errors, never partially loaded (see projectSerialization.deserializeProject). */
export async function readProjectJsonFile(file: File): Promise<ParseResult<Project>> {
  const text = await file.text();
  return deserializeProject(text);
}
