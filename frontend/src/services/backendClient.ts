import type { CoordinateReferenceSystem, ProjectCoordinate } from "../domain/coordinates";
import type { ProcessingWarning, RectangularClipBoundarySettings } from "../domain/pointCloud";
import {
  parseClipResult,
  parsePointCloudMetadata,
  type BackendClipResult,
  type BackendPointCloudMetadata,
} from "../validation/backendPointCloudSchema";
import { parseFileStatus, type BackendFileStatus } from "../validation/backendWorkspaceSchema";

/**
 * The local-only FastAPI backend (see backend/README.md). Never a remote
 * host -- this is localhost-to-localhost traffic, not an external network
 * dependency, consistent with the local-first architecture (ADR-001).
 */
export const DEFAULT_BACKEND_BASE_URL = "http://127.0.0.1:8100";

export class BackendRequestError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly body?: unknown
  ) {
    super(message);
    this.name = "BackendRequestError";
  }
}

async function postJson(path: string, body: unknown, baseUrl: string): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(`${baseUrl}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch (error) {
    throw new BackendRequestError(
      `Could not reach the local backend at ${baseUrl}${path}. Is it running? (${(error as Error).message})`
    );
  }

  const json = await response.json().catch(() => null);
  if (!response.ok) {
    throw new BackendRequestError(
      `Backend request to ${path} failed with status ${response.status}.`,
      response.status,
      json
    );
  }
  return json;
}

export interface ClipRequestBody {
  readonly filePath: string;
  readonly projectCrs: CoordinateReferenceSystem;
  readonly localFrame: {
    readonly mastCentreProject: ProjectCoordinate;
    readonly lineBearingRadians: number;
  };
  readonly boundary: { readonly shape: "rectangular" } & RectangularClipBoundarySettings;
  readonly classificationFilter: readonly number[] | null;
  readonly decimationStep: number | null;
}

/**
 * Thrown when the backend explicitly blocks a clip (HTTP 422 with a
 * structured {message, warnings} body -- see ClipBlockedError in
 * backend/app/processing/las_clip.py). Distinguished from a generic
 * BackendRequestError so callers can show the actual blocking reason (e.g.
 * a CRS mismatch) rather than a bare "request failed" message.
 */
export class BackendClipBlockedError extends BackendRequestError {
  constructor(readonly warnings: ProcessingWarning[]) {
    super(warnings.map((w) => w.message).join(" "));
    this.name = "BackendClipBlockedError";
  }
}

function isBlockedErrorBody(body: unknown): body is { message: string; warnings: ProcessingWarning[] } {
  return (
    typeof body === "object" &&
    body !== null &&
    "warnings" in body &&
    Array.isArray((body as { warnings: unknown }).warnings)
  );
}

export async function requestClip(
  request: ClipRequestBody,
  baseUrl: string = DEFAULT_BACKEND_BASE_URL
): Promise<BackendClipResult> {
  let json: unknown;
  try {
    json = await postJson("/pointcloud/clip", request, baseUrl);
  } catch (error) {
    if (error instanceof BackendRequestError && error.status === 422 && isBlockedErrorBody(error.body)) {
      throw new BackendClipBlockedError(error.body.warnings);
    }
    throw error;
  }
  const parsed = parseClipResult(json);
  if (!parsed.success) {
    throw new BackendRequestError(`Backend clip response failed validation: ${parsed.errors.join("; ")}`);
  }
  return parsed.data;
}

export async function requestInspect(
  filePath: string,
  baseUrl: string = DEFAULT_BACKEND_BASE_URL
): Promise<BackendPointCloudMetadata> {
  const json = await postJson("/pointcloud/inspect", { filePath }, baseUrl);
  const parsed = parsePointCloudMetadata(json);
  if (!parsed.success) {
    throw new BackendRequestError(`Backend inspect response failed validation: ${parsed.errors.join("; ")}`);
  }
  return parsed.data;
}

/**
 * Asks the backend whether a workspace-relative asset still exists and, if
 * so, its current content hash -- used to detect a moved, missing or
 * externally-modified source file (ADR-008) rather than trusting a
 * project's recorded reference forever.
 */
export async function requestFileStatus(
  filePath: string,
  baseUrl: string = DEFAULT_BACKEND_BASE_URL
): Promise<BackendFileStatus> {
  const json = await postJson("/workspace/file-status", { filePath }, baseUrl);
  const parsed = parseFileStatus(json);
  if (!parsed.success) {
    throw new BackendRequestError(`Backend file-status response failed validation: ${parsed.errors.join("; ")}`);
  }
  return parsed.data;
}
