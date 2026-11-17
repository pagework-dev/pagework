import { parse } from "@pagework/fountain";
import { describe, expect, it } from "vitest";
import {
  DRAFTS_KEPT,
  draftToOffer,
  draftWriter,
  draftsToPrune,
  memoryDrafts,
  type Draft,
} from "../src/files/drafts.ts";
import {
  fileBaseName,
  hasFountainExtension,
  importScript,
  scriptTitle,
} from "../src/files/import.ts";
import { fileShortcut } from "../src/lib/shortcuts.ts";

function draft(
  id: string,
  updatedAt: number,
  extra: Partial<Draft> = {},
): Draft {
  return {
    id,
    text: "Rain.",
    fileName: null,
    templateId: "screenplay-a4",
    unsaved: true,
    updatedAt,
    ...extra,
  };
}

describe("importScript", () => {
  it("normalises the text and removes continuation markers (ADR 0011)", () => {
    const result = importScript(
      "﻿TOM\r\nI never said when.\r\n(MORE)\r\n\r\nTOM (CONT'D)\r\nOnly that.\r\n",
    );
    expect(result.text).toBe("TOM\nI never said when.\n\nTOM\nOnly that.\n");
    expect(result.removedMarkers).toBe(2);
  });

  it("keeps character extensions that are content", () => {
    expect(importScript("TOM (V.O.)\nHi.\n").text).toBe("TOM (V.O.)\nHi.\n");
  });
});

describe("file names", () => {
  it("recognises Fountain files", () => {
    expect(hasFountainExtension("Low Tide.FOUNTAIN")).toBe(true);
    expect(hasFountainExtension("draft.txt")).toBe(true);
    expect(hasFountainExtension("script.fdx")).toBe(false);
  });

  it("names a file after its title page, without characters files can't hold", () => {
    const title = scriptTitle(parse("Title: Low Tide: A *Story*\n\nRain.\n"));
    expect(title).toBe("Low Tide: A Story");
    expect(fileBaseName(null, title, "Untitled script")).toBe(
      "Low Tide A Story",
    );
    expect(fileBaseName("draft 3.fountain", title, "Untitled script")).toBe(
      "draft 3",
    );
    expect(fileBaseName(null, null, "Untitled script")).toBe("Untitled script");
  });
});

describe("drafts", () => {
  it("offers the newest draft with unsaved work, never the current one", () => {
    const drafts = [
      draft("a", 1),
      draft("b", 3, { unsaved: false }),
      draft("c", 2),
      draft("d", 4, { text: "  " }),
      draft("current", 5),
    ];
    expect(draftToOffer(drafts, "current")?.id).toBe("c");
    expect(draftToOffer([draft("b", 3, { unsaved: false })], "x")).toBeNull();
  });

  it("keeps only the newest drafts", () => {
    const drafts = Array.from({ length: DRAFTS_KEPT + 3 }, (_, i) =>
      draft(String(i), i),
    );
    expect(draftsToPrune(drafts)).toEqual(["2", "1", "0"]);
  });

  it("writes the latest change and reports whether it was kept", async () => {
    const store = memoryDrafts();
    const results: boolean[] = [];
    const writer = draftWriter(store, (ok) => results.push(ok), 10_000);
    writer.schedule(draft("x", 1, { text: "first" }));
    writer.schedule(draft("x", 2, { text: "second" }));
    await writer.flush();
    expect((await store.all()).map((d) => d.text)).toEqual(["second"]);
    expect(results).toEqual([true]);
  });

  it("reports a store that fails", async () => {
    const results: boolean[] = [];
    const writer = draftWriter(
      {
        put: () => Promise.reject(new Error("quota")),
        all: () => Promise.resolve([]),
        remove: () => Promise.resolve(),
      },
      (ok) => results.push(ok),
    );
    writer.schedule(draft("x", 1));
    await writer.flush();
    expect(results).toEqual([false]);
  });
});

describe("file shortcuts", () => {
  const key = (
    k: string,
    extra: Partial<Parameters<typeof fileShortcut>[0]> = {},
  ) =>
    fileShortcut({
      key: k,
      code: `Key${k.toUpperCase()}`,
      ctrlKey: true,
      metaKey: false,
      shiftKey: false,
      altKey: false,
      ...extra,
    });
  it("maps Ctrl/Cmd shortcuts to file actions", () => {
    expect(key("s")).toBe("save");
    expect(key("S", { shiftKey: true })).toBe("saveAs");
    expect(key("o")).toBe("open");
    expect(key("p")).toBe("print");
    expect(key("ñ", { code: "KeyN", altKey: true })).toBe("new");
    expect(key("n")).toBeNull();
    expect(key("s", { ctrlKey: false })).toBeNull();
  });
});
