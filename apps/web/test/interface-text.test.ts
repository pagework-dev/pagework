import { parse } from "svelte/compiler";
import { describe, expect, it } from "vitest";
import messages from "../src/i18n/en-AU.json";

// CLAUDE.md: no literal interface strings in components. Every piece of text
// a person can read or hear comes from the translation file through t().

const components = import.meta.glob<string>("../src/**/*.svelte", {
  query: "?raw",
  import: "default",
  eager: true,
});
const sources = import.meta.glob<string>("../src/**/*.{ts,svelte}", {
  query: "?raw",
  import: "default",
  eager: true,
});

/** Attributes that people read or hear. */
const SPOKEN = new Set([
  "aria-label",
  "aria-description",
  "aria-roledescription",
  "aria-valuetext",
  "title",
  "placeholder",
  "alt",
  "label",
]);

interface Node {
  type: string;
  [key: string]: unknown;
}

function isNode(value: unknown): value is Node {
  return typeof value === "object" && value !== null && "type" in value;
}

function literals(source: string): string[] {
  const found: string[] = [];
  const visit = (node: unknown): void => {
    if (Array.isArray(node)) {
      node.forEach(visit);
      return;
    }
    if (!isNode(node)) return;
    if (node.type === "Text" && typeof node.data === "string") {
      if (node.data.trim() !== "") found.push(node.data.trim());
      return;
    }
    if (node.type === "Attribute" && typeof node.name === "string") {
      if (SPOKEN.has(node.name) && Array.isArray(node.value))
        for (const part of node.value as unknown[])
          if (isNode(part) && part.type === "Text")
            found.push(String(part.data));
      return;
    }
    for (const [key, child] of Object.entries(node)) {
      if (key === "attributes" || key === "fragment" || key === "nodes")
        visit(child);
      else if (key === "consequent" || key === "alternate" || key === "body")
        visit(child);
    }
  };
  const ast = parse(source, { modern: true });
  visit(ast.fragment);
  return found;
}

describe("interface text", () => {
  it("finds the components", () => {
    expect(Object.keys(components).length).toBeGreaterThan(0);
  });

  it.each(Object.entries(components))(
    "%s has no literal text",
    (_path, source) => {
      expect(literals(source)).toEqual([]);
    },
  );

  it("catches literal text and spoken attributes", () => {
    expect(
      literals('<button aria-label="Close">Save</button>{#if a}<p>Hi</p>{/if}'),
    ).toEqual(["Close", "Save", "Hi"]);
  });

  it("uses every message in the translation file", () => {
    const code = Object.values(sources).join("\n");
    // Keys built from data, e.g. element.<type>.
    const dynamic = ["element.", "status.pages."];
    const unused = Object.keys(messages).filter(
      (key) =>
        !code.includes(`"${key}"`) &&
        !dynamic.some((prefix) => key.startsWith(prefix)),
    );
    expect(unused).toEqual([]);
  });

  it("writes Australian English", () => {
    const text = Object.values(messages).join("\n");
    expect(text).not.toMatch(
      /\b(color|center|centered|organization|license)\b/i,
    );
  });
});
