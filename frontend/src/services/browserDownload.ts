/**
 * The shared "save a file to the user's machine" primitive (spec section 20
 * export requirements): a temporary object URL plus a synthetic anchor
 * click. Every export (project JSON, screenshot, section image, summary
 * text) goes through this one function so the mechanism is defined once.
 */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

export function downloadText(content: string, filename: string, mimeType = "text/plain"): void {
  downloadBlob(new Blob([content], { type: mimeType }), filename);
}
