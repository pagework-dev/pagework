/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";
import { parse } from "../src/index.ts";

// Golden files: each fixture is a .fountain input with its expected element
// list beside it as JSON. Load with Vite's glob so the package itself stays
// free of Node APIs.
const inputs = import.meta.glob<string>(
  "../../../fixtures/fountain/*.fountain",
  {
    query: "?raw",
    import: "default",
    eager: true,
  },
);
const expected = import.meta.glob<unknown>(
  "../../../fixtures/fountain/*.json",
  {
    import: "default",
    eager: true,
  },
);

const cases = Object.entries(inputs).map(([path, source]) => {
  const jsonPath = path.replace(/\.fountain$/, ".json");
  return { name: path.slice(path.lastIndexOf("/") + 1), source, jsonPath };
});

describe("golden files", () => {
  it("finds the fixtures", () => {
    expect(cases.length).toBeGreaterThan(0);
  });

  it.each(cases)("$name", ({ source, jsonPath }) => {
    expect(expected[jsonPath], `missing ${jsonPath}`).toBeDefined();
    expect(parse(source)).toEqual(expected[jsonPath]);
  });
});
