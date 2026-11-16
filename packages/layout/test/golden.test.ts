import { parse } from "@pagework/fountain";
import { resolveTemplate } from "@pagework/templates";
import { describe, expect, it } from "vitest";
import { paginate, renderText } from "../src/index.ts";
import { inputs, load, pictures } from "./fixtures.ts";

// Each fixture is fixtures/layout/<template id>/<name>.fountain with the
// expected pages beside it as a text picture (<name>.txt): one character per
// column, one Fountain line per row, numbered from the top edge.

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
