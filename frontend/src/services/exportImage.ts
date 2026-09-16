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

/**
 * Opens the live section SVG, full-size, in its own browser tab -- the
 * embedded sidebar copy is necessarily cramped (it shares the viewport
 * with the 3D view and every other docked panel). Reuses the same
 * principle as downloadSectionSvg: serialises the SVG exactly as
 * rendered, never re-derives it -- only the width/height attributes are
 * widened (the section's own viewBox keeps every stroke/font proportion
 * intact, so it scales up losslessly, not a re-rasterisation).
 */
export function openSectionInNewWindow(svg: SVGSVGElement, title: string): void {
  // Open the window synchronously, first, so it stays tied to the click's
  // user-gesture -- writing content into it afterward (rather than passing
  // window.open a Blob URL to navigate to) is the robust way to avoid
  // popup blockers here.
  const target = window.open("", "_blank");
  if (!target) {
    throw new Error("The browser blocked opening a new window/tab for the section view. Allow pop-ups for this site and try again.");
  }

  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.removeAttribute("height");
  clone.removeAttribute("style");
  clone.setAttribute("width", "100%");
  clone.style.height = "auto";
  clone.style.maxWidth = "1400px";
  clone.style.border = "1px solid #d8d8d8";
  clone.style.borderRadius = "3px";

  const serializer = new XMLSerializer();
  let svgSource = serializer.serializeToString(clone);
  if (!svgSource.includes("xmlns=")) {
    svgSource = svgSource.replace("<svg", '<svg xmlns="http://www.w3.org/2000/svg"');
  }

  const escapedTitle = title.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]!);
  const generatedAt = new Date().toLocaleString();

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>${escapedTitle} -- section</title>
<style>
  :root { color-scheme: light; }
  body { margin: 0; font-family: Arial, Helvetica, sans-serif; background: #f2f2f2; color: #1a1a1a; }
  header { background: #FA0000; color: #ffffff; padding: 14px 24px; display: flex; align-items: baseline; justify-content: space-between; gap: 16px; flex-wrap: wrap; }
  header h1 { font-size: 16px; font-weight: 700; margin: 0; }
  header span { font-size: 11px; opacity: 0.85; }
  main { padding: 24px; display: flex; justify-content: center; }
  .sheet { background: #ffffff; padding: 20px; box-shadow: 0 1px 6px rgba(0,0,0,0.15); }
  .disclaimer { font-size: 10px; color: #707070; margin-top: 10px; max-width: 1400px; }
  .toolbar { position: fixed; top: 14px; right: 24px; }
  .toolbar button { font-size: 12px; padding: 6px 12px; border-radius: 4px; border: 1px solid #ffffff; background: transparent; color: #ffffff; cursor: pointer; }
  @media print { .toolbar { display: none; } header { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
</style>
</head>
<body>
<header>
  <h1>${escapedTitle}</h1>
  <span>Design-support drawing only -- not an approved design. Generated ${generatedAt}</span>
  <span class="toolbar"><button onclick="window.print()">Print</button></span>
</header>
<main>
  <div class="sheet">
    ${svgSource}
    <div class="disclaimer">This is a design-support summary only, not an approved design or certified construction drawing.</div>
  </div>
</main>
</body>
</html>`;

  target.document.open();
  target.document.write(html);
  target.document.close();
}
