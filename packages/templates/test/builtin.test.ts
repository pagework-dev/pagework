/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";
import {
  resolveTemplate,
  templateIdFromPath,
  templateStore,
} from "../src/index.ts";

const files = import.meta.glob<string>("../../../templates/**/*.yaml", {
  query: "?raw",
  import: "default",
  eager: true,
});
const sources = Object.fromEntries(
  Object.entries(files).map(([path, source]) => [
    templateIdFromPath(
      path.slice(path.indexOf("/templates/") + "/templates/".length),
    ),
    source,
  ]),
);
const load = templateStore(sources);
const ids = Object.keys(sources).sort();
const inch = 72;
const mm = 72 / 25.4;

describe("built-in templates", () => {
  it("includes the screenplay templates", () => {
    expect(ids).toEqual(["base/screenplay", "screenplay-a4", "screenplay-us"]);
  });

  it.each(ids)("%s matches the schema", (id) => {
    expect(() => load(id)).not.toThrow();
  });

  // Base templates leave out the page on purpose, so only the templates a
  // script can choose are resolved.
  it.each(ids.filter((id) => !id.startsWith("base/")))(
    "%s resolves completely",
    (id) => {
      expect(resolveTemplate(id, load).abstract).toBe(false);
    },
  );

  it.each(ids)("%s gives every measurement a source comment", (id) => {
    const lines = (sources[id] ?? "").split("\n");
    const uncommented = lines.filter(
      (line) => /:\s*-?[0-9.]+(mm|in|pt)\b/.test(line) && !line.includes("#"),
    );
    expect(uncommented).toEqual([]);
  });

  it("screenplay-us is US Letter with a 1.5 in left margin", () => {
    const t = resolveTemplate("screenplay-us", load);
    expect(t.page).toEqual({
      width: 8.5 * inch,
      height: 11 * inch,
      margin: { top: inch, bottom: inch, left: 1.5 * inch, right: inch },
    });
    expect(t.font).toEqual({
      family: "Courier Prime",
      size: 12,
      lineHeight: 12,
    });
  });

  it("screenplay-a4 is A4 and keeps the shared element indents", () => {
    const a4 = resolveTemplate("screenplay-a4", load);
    const us = resolveTemplate("screenplay-us", load);
    expect(a4.page.width).toBeCloseTo(210 * mm, 6);
    expect(a4.page.height).toBeCloseTo(297 * mm, 6);
    expect(a4.elements).toEqual(us.elements);
  });

  it.each(["screenplay-us", "screenplay-a4"])(
    "%s fits every element inside the margins",
    (id) => {
      const t = resolveTemplate(id, load);
      const textWidth = t.page.width - t.page.margin.left - t.page.margin.right;
      for (const [name, style] of Object.entries(t.elements)) {
        expect(style.indent + (style.width ?? 0), name).toBeLessThanOrEqual(
          textWidth,
        );
      }
    },
  );
});
