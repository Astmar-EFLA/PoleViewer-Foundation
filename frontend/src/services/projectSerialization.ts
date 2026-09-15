import type { Project } from "../domain/project";
import type { ParseResult } from "../validation/parseResult";
import { parseProject } from "../validation/projectSchema";

export function serializeProject(project: Project): string {
  return JSON.stringify(project, null, 2);
}

export function deserializeProject(json: string): ParseResult<Project> {
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(json);
  } catch (error) {
    return { success: false, errors: [`Invalid JSON: ${(error as Error).message}`] };
  }
  return parseProject(parsedJson);
}
