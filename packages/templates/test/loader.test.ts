import { describe, expect, it } from "vitest";
import {
  parseLength,
  parseTemplate,
  resolveTemplate,
  TemplateError,
  type TemplateFile,
} from "../src/index.ts";

const BASE = `
schema: 1
id: base/test
name: Test base
kind: screenplay
page:
  size: letter
  margin: { top: 1in, bottom: 1in, left: 1.5in, right: 1in }
font: { family: Courier Prime, size: 12pt, line_height: 12pt }
elements:
  scene_heading: { case: upper, space_before: 1 }
  action: { space_before: 1 }
  character: { indent: 2.2in, case: upper, space_before: 1 }
  parenthetical: { indent: 1.6in, width: 2in }
  dialogue: { indent: 1in, width: 3.5in }
  transition: { align: right, case: upper, space_before: 1 }
  centered: { align: center, space_before: 1 }
  lyrics: { indent: 1in, width: 3.5in, style: [italic] }
pagination:
  dialogue: { split: true, more: "(MORE)", continued: "(CONT'D)", min_lines_each_side: 2 }
  character_continued: { enabled: true, text: "(CONT'D)" }
  scene_continued: { enabled: false, top: "CONTINUED:", bottom: "(CONTINUED)" }
  scene_heading: { keep_with_next: 2 }
  scene_numbers: both
scene_number: { left: 0.75in, right: 7.75in }
`;

function store(files: Record<string, string>): (id: string) => TemplateFile {
  return (id) => {
    const source = files[id];
    if (source === undefined)
      throw new TemplateError(`No template with id "${id}"`);
    return parseTemplate(source, `${id}.yaml`);
  };
}

describe("parseLength", () => {
  it("converts each unit to points", () => {
    expect(parseLength("1in")).toBe(72);
    expect(parseLength("25.4mm")).toBeCloseTo(72, 10);
    expect(parseLength("12pt")).toBe(12);
    expect(parseLength("-0.5in")).toBe(-36);
  });

  it.each(["12", "12 pt", "1.in", "in", "1cm", ""])("rejects %j", (value) => {
    expect(() => parseLength(value)).toThrow(TemplateError);
  });
});

describe("parseTemplate", () => {
  it("rejects a bare number where a length is needed, naming the field", () => {
    const source =
      "schema: 1\nid: bad\nname: Bad\npage:\n  margin: { top: 25 }\n";
    expect(() => parseTemplate(source, "bad.yaml")).toThrow(
      /bad\.yaml.*\/page\/margin\/top/s,
    );
  });

  it("rejects unknown fields", () => {
    expect(() =>
      parseTemplate("schema: 1\nid: x\nname: X\ncolour: red\n", "x.yaml"),
    ).toThrow(TemplateError);
  });

  it("rejects malformed YAML", () => {
    expect(() =>
      parseTemplate("schema: 1\nid: [unclosed\n", "broken.yaml"),
    ).toThrow(/broken\.yaml/);
  });

  it("accepts null, which removes an inherited value", () => {
    expect(() =>
      parseTemplate("schema: 1\nid: x\nname: X\nheader: null\n", "x.yaml"),
    ).not.toThrow();
  });
});

describe("resolveTemplate", () => {
  it("converts the merged template to points", () => {
    const t = resolveTemplate("base/test", store({ "base/test": BASE }));
    expect(t.page).toEqual({
      width: 612,
      height: 792,
      margin: { top: 72, bottom: 72, left: 108, right: 72 },
    });
    expect(t.abstract).toBe(true);
    expect(t.elements.dialogue).toEqual({
      indent: 72,
      width: 252,
      align: "left",
      case: "as-written",
      style: [],
      prefix: "",
      suffix: "",
      wrap: null,
      spaceBefore: 0,
    });
  });

  it("merges maps, replaces lists and removes values set to null", () => {
    const child = `
schema: 1
id: child
name: Child
extends: base/test
page:
  size: a4
  margin: { left: 38mm }
elements:
  lyrics: { style: [bold] }
  transition: { case: null }
`;
    const t = resolveTemplate("child", store({ "base/test": BASE, child }));
    expect(t.abstract).toBe(false);
    expect(t.page.width).toBeCloseTo((210 / 25.4) * 72, 6);
    expect(t.page.margin.left).toBeCloseTo((38 / 25.4) * 72, 6);
    expect(t.page.margin.top).toBe(72);
    expect(t.elements.lyrics?.style).toEqual(["bold"]);
    expect(t.elements.lyrics?.indent).toBe(72);
    expect(t.elements.transition?.case).toBe("as-written");
    expect(t.elements.transition?.align).toBe("right");
  });

  it("rejects a cycle and names it", () => {
    const files = {
      a: "schema: 1\nid: a\nname: A\nextends: b\n",
      b: "schema: 1\nid: b\nname: B\nextends: a\n",
    };
    expect(() => resolveTemplate("a", store(files))).toThrow(
      /cycle.*a → b → a/,
    );
  });

  it("rejects a template that extends itself", () => {
    expect(() =>
      resolveTemplate(
        "a",
        store({ a: "schema: 1\nid: a\nname: A\nextends: a\n" }),
      ),
    ).toThrow(/cycle/);
  });

  it("reports a missing parent", () => {
    expect(() =>
      resolveTemplate(
        "a",
        store({ a: "schema: 1\nid: a\nname: A\nextends: nowhere\n" }),
      ),
    ).toThrow(/nowhere/);
  });

  it("rejects a file whose id differs from the id it was loaded as", () => {
    expect(() =>
      resolveTemplate("a", store({ a: "schema: 1\nid: b\nname: B\n" })),
    ).toThrow(/"b".*"a"/);
  });

  it("lists what is still missing after inheritance", () => {
    const files = { a: "schema: 1\nid: a\nname: A\nkind: screenplay\n" };
    expect(() => resolveTemplate("a", store(files))).toThrow(/page/);
  });

  it("rejects stage elements in a screenplay template", () => {
    const child =
      "schema: 1\nid: c\nname: C\nextends: base/test\nelements:\n  act_heading: { case: upper }\n";
    expect(() =>
      resolveTemplate("c", store({ "base/test": BASE, c: child })),
    ).toThrow(/act_heading/);
  });

  it("requires every screenplay element", () => {
    const child =
      "schema: 1\nid: c\nname: C\nextends: base/test\nelements:\n  lyrics: null\n";
    expect(() =>
      resolveTemplate("c", store({ "base/test": BASE, c: child })),
    ).toThrow(/lyrics/);
  });
});
