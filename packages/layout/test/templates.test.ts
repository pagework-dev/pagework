/// <reference types="vite/client" />
import { parse, removeContinuationMarkers } from "@pagework/fountain";
import { resolveTemplate } from "@pagework/templates";
import { describe, expect, it } from "vitest";
import { paginate, renderText } from "../src/index.ts";
import { load } from "./fixtures.ts";

// docs/TEMPLATES.md: every template renders the standard sample script, and
// the pages are snapshot-tested, so a template change that moves a page break
// shows up in review. Update with `pnpm test -u` and explain the change.
const sample = Object.values(
  import.meta.glob<string>("../../../fixtures/sample-script.fountain", {
    query: "?raw",
    import: "default",
    eager: true,
  }),
)[0];

describe("sample script", () => {
  it.each(["screenplay-us", "screenplay-a4"])("%s pages", async (id) => {
    expect(sample).toBeDefined();
    const elements = parse(removeContinuationMarkers(sample ?? "").text);
    const pages = renderText(paginate(elements, resolveTemplate(id, load)));
    await expect(pages).toMatchFileSnapshot(
      `../../../fixtures/sample-script.${id}.txt`,
    );
  });
});
