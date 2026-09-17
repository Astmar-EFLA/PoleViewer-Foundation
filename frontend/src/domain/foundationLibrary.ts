import type { FoundationType } from "./foundation";
import foundationLibraryJson from "./foundationLibrary.json";
import { parseFoundationLibrary } from "../validation/foundationSchema";

/**
 * The parametric foundation-type library (spec section 10), data-file-backed
 * (./foundationLibrary.json) so a new type can be added or an existing one's
 * placeholder dimensions edited without touching any TypeScript -- exposed
 * only through the accessors below so callers never depend on the storage
 * format. Validated at load time (never trusted as-is): a hand-edited JSON
 * file is exactly the kind of input that can contain a typo, so an invalid
 * library fails loudly here, once, rather than surfacing as a broken
 * dropdown entry or a crash the first time someone selects it.
 *
 * Every entry's dimensions here are placeholder defaults (origin
 * "library-default", unverified), not a real design; every value a user
 * accepts without editing stays traceable as such via the resulting
 * FoundationInstance's provenance.
 */
const parsedLibrary = parseFoundationLibrary(foundationLibraryJson);
if (!parsedLibrary.success) {
  throw new Error(
    `Invalid foundation library data (domain/foundationLibrary.json): ${parsedLibrary.errors.join("; ")}`
  );
}

export const FOUNDATION_LIBRARY: readonly FoundationType[] = parsedLibrary.data;

export function getFoundationTypeById(foundationTypeId: string): FoundationType | undefined {
  return FOUNDATION_LIBRARY.find((t) => t.foundationTypeId === foundationTypeId);
}

export function requireFoundationTypeById(foundationTypeId: string): FoundationType {
  const type = getFoundationTypeById(foundationTypeId);
  if (!type) {
    throw new Error(`Unknown foundation type id: "${foundationTypeId}"`);
  }
  return type;
}
