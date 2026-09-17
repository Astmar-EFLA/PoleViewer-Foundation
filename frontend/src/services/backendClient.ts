import type { CoordinateReferenceSystem, ProjectCoordinate } from "../domain/coordinates";
import type { PoleModel } from "../domain/poleModel";
import type { ProcessingWarning, RectangularClipBoundarySettings } from "../domain/pointCloud";
import {
  parseClipResult,
  parsePointCloudMetadata,
  type BackendClipResult,
  type BackendPointCloudMetadata,
} from "../validation/backendPointCloudSchema";
import {
  parseFileStatus,
  parseUploadResult,
  type BackendFileStatus,
  type BackendUploadResult,
} from "../validation/backendWorkspaceSchema";
import { parseCentrelineResult, type BackendCentrelineResult } from "../validation/backendLineSchema";
import { parseOrthophotoRegisterResult, type BackendOrthophotoRegisterResult } from "../validation/backendOrthophotoSchema";
import { parsePoleModel } from "../validation/poleModelSchema";

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

/**
 * FastAPI's error bodies are either `{"detail": "some string"}` (most
 * endpoints) or `{"detail": {"message": "...", "warnings": [...]}}` (the
 * clip-blocked case). Pulls a human-readable string out of either shape,
 * so a failure shows its actual reason (e.g. "File not found in workspace:
 * x.pol") instead of just a bare status code -- the generic message alone
 * was genuinely undiagnosable from the UI (see the 404 that turned out to
 * mean "the file isn't in backend/workspace/ (any more)").
 */
function extractDetailMessage(json: unknown): string | null {
  if (typeof json !== "object" || json === null || !("detail" in json)) return null;
  const detail = (json as { detail: unknown }).detail;
  if (typeof detail === "string") return detail;
  if (typeof detail === "object" && detail !== null && "message" in detail) {
    const message = (detail as { message: unknown }).message;
    if (typeof message === "string") return message;
  }
  return null;
}

/** Thrown (name "AbortError", the standard DOM name) when the caller's AbortSignal was triggered -- callers treat this as a clean cancellation, not a failure to surface as an error. */
async function postJson(path: string, body: unknown, baseUrl: string, signal?: AbortSignal): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(`${baseUrl}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      ...(signal ? { signal } : {}),
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw new BackendRequestError(
      `Could not reach the local backend at ${baseUrl}${path}. Is it running? (${(error as Error).message})`
    );
  }

  const json = await response.json().catch(() => null);
  if (!response.ok) {
    const detail = extractDetailMessage(json);
    throw new BackendRequestError(
      detail
        ? `Backend request to ${path} failed (${response.status}): ${detail}`
        : `Backend request to ${path} failed with status ${response.status}.`,
      response.status,
      json
    );
  }
  return json;
}

/**
 * Sibling to postJson for the one request shape that isn't JSON: a file
 * upload. No explicit Content-Type header -- the browser sets the
 * multipart boundary itself when given a FormData body, and setting it
 * manually would break that.
 */
async function postFormData(path: string, formData: FormData, baseUrl: string, signal?: AbortSignal): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(`${baseUrl}${path}`, {
      method: "POST",
      body: formData,
      ...(signal ? { signal } : {}),
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw new BackendRequestError(
      `Could not reach the local backend at ${baseUrl}${path}. Is it running? (${(error as Error).message})`
    );
  }

  const json = await response.json().catch(() => null);
  if (!response.ok) {
    const detail = extractDetailMessage(json);
    throw new BackendRequestError(
      detail
        ? `Backend request to ${path} failed (${response.status}): ${detail}`
        : `Backend request to ${path} failed with status ${response.status}.`,
      response.status,
      json
    );
  }
  return json;
}

export type UploadKind = "pole-model" | "point-cloud" | "line-centreline" | "orthophoto-image" | "orthophoto-world-file";

/**
 * Uploads a file picked via a native file-open dialog into the backend's
 * workspace (see backend/app/api/workspace.py's /workspace/upload) and
 * returns the workspace-relative path it landed at -- callers then pass
 * that path, unmodified, to requestPoleModelImport/requestInspect exactly
 * as if it had already been sitting in the workspace.
 */
export async function requestUpload(
  file: File,
  kind: UploadKind,
  baseUrl: string = DEFAULT_BACKEND_BASE_URL,
  signal?: AbortSignal
): Promise<BackendUploadResult> {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("kind", kind);
  const json = await postFormData("/workspace/upload", formData, baseUrl, signal);
  const parsed = parseUploadResult(json);
  if (!parsed.success) {
    throw new BackendRequestError(`Backend upload response failed validation: ${parsed.errors.join("; ")}`);
  }
  return parsed.data;
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

/** FastAPI's HTTPException(detail={...}) serialises as {"detail": {...}} -- the structured {message, warnings} body lives one level under `detail`, not at the response body's top level (verified against the real running backend, not just this project's own mocked tests -- see backendClient.test.ts). */
function blockedWarningsFromResponseBody(body: unknown): ProcessingWarning[] | null {
  if (typeof body !== "object" || body === null || !("detail" in body)) return null;
  const detail = (body as { detail: unknown }).detail;
  if (typeof detail !== "object" || detail === null || !("warnings" in detail)) return null;
  const warnings = (detail as { warnings: unknown }).warnings;
  return Array.isArray(warnings) ? (warnings as ProcessingWarning[]) : null;
}

export async function requestClip(
  request: ClipRequestBody,
  baseUrl: string = DEFAULT_BACKEND_BASE_URL,
  signal?: AbortSignal
): Promise<BackendClipResult> {
  let json: unknown;
  try {
    json = await postJson("/pointcloud/clip", request, baseUrl, signal);
  } catch (error) {
    if (error instanceof BackendRequestError && error.status === 422) {
      const warnings = blockedWarningsFromResponseBody(error.body);
      if (warnings) throw new BackendClipBlockedError(warnings);
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
  baseUrl: string = DEFAULT_BACKEND_BASE_URL,
  signal?: AbortSignal
): Promise<BackendFileStatus> {
  const json = await postJson("/workspace/file-status", { filePath }, baseUrl, signal);
  const parsed = parseFileStatus(json);
  if (!parsed.success) {
    throw new BackendRequestError(`Backend file-status response failed validation: ${parsed.errors.join("; ")}`);
  }
  return parsed.data;
}

/**
 * Imports a PLS-POLE (.pol) file from the backend workspace and returns it
 * already shaped as this app's own PoleModel (see
 * backend/app/processing/pol_import.py) -- reuses parsePoleModel, the same
 * schema-validation gate every other pole model (synthetic fixture,
 * reopened project) goes through, so an imported model can never bypass it.
 */
export async function requestPoleModelImport(
  filePath: string,
  baseUrl: string = DEFAULT_BACKEND_BASE_URL,
  signal?: AbortSignal
): Promise<PoleModel> {
  const json = await postJson("/polemodel/import", { filePath }, baseUrl, signal);
  const parsed = parsePoleModel(json);
  if (!parsed.success) {
    throw new BackendRequestError(`Backend pole-model import response failed validation: ${parsed.errors.join("; ")}`);
  }
  return parsed.data;
}

/**
 * Extracts a transmission line's centreline from a zipped shapefile already
 * uploaded to the workspace (see backend/app/processing/shapefile_import.py)
 * -- vertices come back in project coordinates (easting/northing only,
 * elevation isn't needed for a bearing calculation).
 */
export async function requestCentreline(
  filePath: string,
  projectCrs: CoordinateReferenceSystem,
  baseUrl: string = DEFAULT_BACKEND_BASE_URL,
  signal?: AbortSignal
): Promise<BackendCentrelineResult> {
  const json = await postJson("/line/centreline", { filePath, projectCrs }, baseUrl, signal);
  const parsed = parseCentrelineResult(json);
  if (!parsed.success) {
    throw new BackendRequestError(`Backend centreline response failed validation: ${parsed.errors.join("; ")}`);
  }
  return parsed.data;
}

/**
 * Registers an orthophoto (.jpg + its .jgw world file, already on the
 * backend's workspace) for draping onto the terrain TIN. `worldFilePath` is
 * only needed when the two don't share a basename (e.g. after a browser
 * upload gave them different uuid-prefixed names) -- otherwise the backend
 * finds the sidecar itself (see app/api/orthophoto.py).
 */
export async function requestOrthophotoRegister(
  imagePath: string,
  worldFilePath?: string,
  baseUrl: string = DEFAULT_BACKEND_BASE_URL,
  signal?: AbortSignal
): Promise<BackendOrthophotoRegisterResult> {
  const json = await postJson(
    "/orthophoto/register",
    { imagePath, worldFilePath: worldFilePath ?? null },
    baseUrl,
    signal
  );
  const parsed = parseOrthophotoRegisterResult(json);
  if (!parsed.success) {
    throw new BackendRequestError(`Backend orthophoto register response failed validation: ${parsed.errors.join("; ")}`);
  }
  return parsed.data;
}

/**
 * Fetches and reprojects Esri World Imagery tiles for a square area around
 * a project coordinate (backend: app/processing/world_imagery.py), caches
 * the result under the workspace, and returns it in the exact same shape as
 * requestOrthophotoRegister -- the only network-dependent request this app
 * makes (everything else is local-only, ADR-001), and only ever sent when
 * the user explicitly asks for it.
 */
export async function requestWorldImageryOrthophoto(
  centreEasting: number,
  centreNorthing: number,
  projectCrs: CoordinateReferenceSystem,
  widthM: number,
  heightM: number,
  baseUrl: string = DEFAULT_BACKEND_BASE_URL,
  signal?: AbortSignal
): Promise<BackendOrthophotoRegisterResult> {
  const json = await postJson(
    "/orthophoto/world-imagery",
    { centreEasting, centreNorthing, projectCrs, widthM, heightM },
    baseUrl,
    signal
  );
  const parsed = parseOrthophotoRegisterResult(json);
  if (!parsed.success) {
    throw new BackendRequestError(`Backend world-imagery response failed validation: ${parsed.errors.join("; ")}`);
  }
  return parsed.data;
}
