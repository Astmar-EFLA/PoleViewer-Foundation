import { describe, expect, it } from "vitest";
import { buildSyntheticDemoProject } from "./buildSyntheticDemoProject";
import { embedProjectIntoTemplate, ViewerExportError } from "./exportProjectHtml";
import { serializeProject } from "./projectSerialization";

const TEMPLATE = [
  "<!doctype html>",
  "<html><head></head><body>",
  '<div id="root"></div>',
  '<script id="embedded-project-json" type="application/json">null</script>',
  '<script type="module" src="/assets/main.js"></script>',
  "</body></html>",
].join("\n");

describe("embedProjectIntoTemplate", () => {
  it("replaces the placeholder tag's content with the project's serialized JSON", () => {
    const project = buildSyntheticDemoProject();
    const html = embedProjectIntoTemplate(TEMPLATE, project);

    expect(html).toContain(`<script id="embedded-project-json" type="application/json">${serializeProject(project)}</script>`);
    // Everything else in the template is untouched.
    expect(html).toContain('<script type="module" src="/assets/main.js"></script>');
    expect(html).not.toContain(">null</script>");
  });

  it("produces output that still parses back to an equivalent project", () => {
    const project = buildSyntheticDemoProject();
    const html = embedProjectIntoTemplate(TEMPLATE, project);

    const match = html.match(/<script id="embedded-project-json" type="application\/json">([\s\S]*?)<\/script>/);
    expect(match).not.toBeNull();
    expect(JSON.parse(match![1]!)).toEqual(JSON.parse(serializeProject(project)));
  });

  it("escapes a literal </script sequence so embedded data can't break out of its tag", () => {
    const project = buildSyntheticDemoProject();
    const withHostileNotes = { ...project, notes: 'end tag attempt </script><script>alert(1)</script>' };
    const html = embedProjectIntoTemplate(TEMPLATE, withHostileNotes);

    expect(html).not.toContain("</script><script>alert(1)</script>");
    expect(html).toContain("<\\/script>");
  });

  it("throws a clear error when the template is missing the placeholder tag", () => {
    const project = buildSyntheticDemoProject();
    expect(() => embedProjectIntoTemplate("<html><body>no placeholder here</body></html>", project)).toThrow(
      ViewerExportError
    );
  });
});
