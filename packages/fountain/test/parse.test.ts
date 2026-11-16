import { describe, expect, it } from "vitest";
import { parse, parseInline } from "../src/index.ts";

describe("parse", () => {
  it("returns nothing for an empty script", () => {
    expect(parse("")).toEqual([]);
    expect(parse("\n\n")).toEqual([]);
  });

  it("reads Windows and old Mac line endings and a byte-order mark", () => {
    const unix = parse("INT. HOUSE - DAY\n\nSTEEL\nHello.\n");
    expect(parse("﻿INT. HOUSE - DAY\r\n\r\nSTEEL\r\nHello.\r\n")).toEqual(unix);
    expect(parse("INT. HOUSE - DAY\r\rSTEEL\rHello.\r")).toEqual(unix);
  });

  it("keeps an unclosed boneyard opener as text", () => {
    expect(parse("They wait. /* forever")).toEqual([
      {
        type: "action",
        lines: [1, 1],
        content: [{ text: "They wait. /* forever" }],
        forced: false,
      },
    ]);
  });

  it("does not let a note cross an empty line", () => {
    expect(parse("A [[note\n\nnever closed]] here.")).toEqual([
      {
        type: "action",
        lines: [1, 1],
        content: [{ text: "A [[note" }],
        forced: false,
      },
      {
        type: "action",
        lines: [3, 3],
        content: [{ text: "never closed]] here." }],
        forced: false,
      },
    ]);
  });

  it("keeps a cue and its speech together across a note on its own line", () => {
    const elements = parse("STEEL\n[[louder?]]\nGet down!");
    expect(elements.map((e) => e.type)).toEqual([
      "character",
      "note",
      "dialogue",
    ]);
  });

  it("keeps extra empty lines only between printed elements", () => {
    const types = (source: string): string[] =>
      parse(source).map((e) => e.type);
    expect(types("\n\n\nStart.\n\n\n\n")).toEqual(["action"]);
    expect(parse("A.\n\n\nB.")[1]).toEqual({
      type: "action",
      lines: [3, 3],
      content: [],
      forced: false,
    });
  });

  it("closes up the empty lines around a note on its own line", () => {
    expect(parse("A.\n\n\n[[note]]\n\n\nB.").map((e) => e.type)).toEqual([
      "action",
      "note",
      "action",
    ]);
  });

  it("ends a speech at a boneyard line, as it would at an empty line", () => {
    expect(
      parse("STEEL\nHello.\n/* cut */\nGoodbye.").map((e) => e.type),
    ).toEqual(["character", "dialogue", "boneyard", "action"]);
  });

  it("treats a cue with nothing after it as action", () => {
    expect(parse("STEEL")).toEqual([
      {
        type: "action",
        lines: [1, 1],
        content: [{ text: "STEEL" }],
        forced: false,
      },
    ]);
  });
});

describe("parseInline", () => {
  it("leaves unmatched markers as text", () => {
    expect(parseInline("**not bold* and _ alone")).toEqual([
      { text: "**not bold* and _ alone" },
    ]);
  });

  it("treats empty emphasis as text", () => {
    expect(parseInline("a ** b __ c")).toEqual([{ text: "a ** b __ c" }]);
  });

  it("unescapes a backslash before a backslash", () => {
    expect(parseInline("a\\\\b")).toEqual([{ text: "a\\b" }]);
  });
});
