import { downloadBlob } from "./browserDownload";

/** Screenshot export (spec section 20): the live WebGL canvas, captured as-is. Requires the Canvas to have been created with `preserveDrawingBuffer: true` (see Scene.tsx) -- otherwise the buffer may already be cleared by the time toBlob runs. */
export function downloadCanvasScreenshot(canvas: HTMLCanvasElement, filenameBase: string): Promise<void> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error("Could not capture the 3D view as an image."));
        return;
      }
      downloadBlob(blob, `${filenameBase}-screenshot.png`);
      resolve();
    }, "image/png");
  });
}

/**
 * Section image export (spec section 20): serialises the live section SVG
 * exactly as rendered -- not a re-rasterisation or a re-derivation, the
 * same principle as the section content itself (geometry/section.ts) not
 * being an independent illustration. SVG is a genuine, portable image
 * format (opens directly in browsers and image viewers), so no canvas
 * rasterisation step is needed.
 */
export function downloadSectionSvg(svg: SVGSVGElement, filenameBase: string): void {
  const serializer = new XMLSerializer();
  let source = serializer.serializeToString(svg);
  if (!source.includes("xmlns=")) {
    source = source.replace("<svg", '<svg xmlns="http://www.w3.org/2000/svg"');
  }
  downloadBlob(new Blob([source], { type: "image/svg+xml" }), `${filenameBase}-section.svg`);
}
