/**
 * Makes a user-facing name (a CSV mast name, a section name) safe to use as
 * a download filename while keeping it recognisable -- unlike the slug
 * helpers elsewhere, case, spaces, hyphens and non-ASCII letters are kept,
 * so "M-12" stays "M-12" and "Þverá 3" stays "Þverá 3". Only characters
 * Windows forbids in filenames are replaced.
 */
export function fileSafeName(name: string, fallback: string): string {
  const cleaned = name
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_")
    .trim()
    .replace(/[. ]+$/, "");
  return cleaned || fallback;
}
