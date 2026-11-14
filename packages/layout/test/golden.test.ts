/// <reference types="vite/client" />
import { parse } from "@pagework/fountain";
import {
  resolveTemplate,
  templateIdFromPath,
  templateStore,
} from "@pagework/templates";
import { describe, expect, it } from "vitest";
import { paginate, renderText } from "../src/index.ts";

// Each fixture is fixtures/layout/<template id>/<name>.fountain with the
// expected pages beside it as a text picture (<name>.txt): one character per
// column, one Fountain line per row, numbered from the top edge.
const raw = { query: "?raw", import: "default", eager: true } as const;
const builtIn = import.meta.glob<string>("../../../templates/**/*.yaml", raw);
const testTemplates = import.meta.glob<string>(
  "../../../fixtures/layout/templates/*.yaml",
  raw,
);
const inputs = import.meta.glob<string>(
  "../../../fixtures/layout/*/*.fountain",
  raw,
);
const pictures = import.meta.glob<string>(
  "../../../fixtures/layout/*/*.txt",
  raw,
);

const sources: Record<string, string> = {};
for (const [path, source] of Object.entries(builtIn)) {
  sources[
    templateIdFromPath(
      path.slice(path.indexOf("/templates/") + "/templates/".length),
    )
  ] = source;
}
for (const [path, source] of Object.entries(testTemplates)) {
  sources[templateIdFromPath(path.slice(path.lastIndexOf("/") + 1))] = source;
}
const load = templateStore(sources);

const cases = Object.entries(inputs).map(([path, source]) => {
  const [templateId = "", name = ""] = path.split("/").slice(-2);
  return {
    name: `${templateId}/${name}`,
    templateId,
    source,
    picture: path.replace(/\.fountain$/, ".txt"),
  };
});

describe("layout golden files", () => {
  it("finds the fixtures", () => {
    expect(cases.length).toBeGreaterThan(0);
  });

  it.each(cases)("$name", ({ templateId, source, picture }) => {
    expect(pictures[picture], `missing ${picture}`).toBeDefined();
    const model = paginate(parse(source), resolveTemplate(templateId, load));
    expect(renderText(model)).toBe(pictures[picture]);
  });
});
