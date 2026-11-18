import { parse } from "@pagework/fountain";
import { describe, expect, it } from "vitest";
import { sameScenes, sceneAt, scenesOf } from "../src/lib/scenes.ts";
import { defaultTemplateId, templates } from "../src/lib/templates.ts";

describe("scenesOf", () => {
  const scenes = scenesOf(
    parse(
      "Title: X\n\nint. house - day\n\nRain.\n\nEXT. ROAD - NIGHT #7A#\n\nWind.\n",
    ),
  );
  it("lists headings with printed numbers, in capitals", () => {
    expect(scenes).toEqual([
      { line: 3, number: "1", heading: "INT. HOUSE - DAY" },
      { line: 7, number: "7A", heading: "EXT. ROAD - NIGHT" },
    ]);
  });
  it("finds the scene a line is in", () => {
    expect(sceneAt(scenes, 1)).toBeNull();
    expect(sceneAt(scenes, 5)?.number).toBe("1");
    expect(sceneAt(scenes, 9)?.number).toBe("7A");
  });
  it("compares scene lists", () => {
    expect(sameScenes(scenes, [...scenes])).toBe(true);
    expect(sameScenes(scenes, scenes.slice(1))).toBe(false);
  });
});

describe("templates", () => {
  it("ships the built-in templates resolved, without base templates", () => {
    expect(templates.map((t) => t.id)).toEqual([
      "screenplay-a4",
      "screenplay-us",
    ]);
    expect(templates.every((t) => !t.abstract)).toBe(true);
  });
  it("defaults to US Letter where Letter is the usual paper", () => {
    expect(defaultTemplateId("en-US")).toBe("screenplay-us");
    expect(defaultTemplateId("fr-CA")).toBe("screenplay-us");
    expect(defaultTemplateId("en-AU")).toBe("screenplay-a4");
    expect(defaultTemplateId("en-GB")).toBe("screenplay-a4");
    expect(defaultTemplateId("en")).toBe("screenplay-a4");
  });
});
