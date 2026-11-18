import { describe, expect, it } from "vitest";
import tokens from "../src/styles/tokens.css?raw";

// docs/DESIGN.md, Checks before merging UI work: text pairs at least 4.5:1,
// control borders and focus at least 3:1, in light and dark; tokens only, no
// raw colours in components.

const files = import.meta.glob<string>("../src/**/*.{ts,svelte,css}", {
  query: "?raw",
  import: "default",
  eager: true,
});

function variables(block: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of block.matchAll(/--([\w-]+):\s*(#[0-9a-f]{6})\s*;/gi))
    if (m[1] !== undefined && m[2] !== undefined) out[m[1]] = m[2];
  return out;
}

const light = variables(tokens.slice(0, tokens.indexOf("@media")));
const darkBlock =
  /prefers-color-scheme: dark\)\s*\{([\s\S]*?)\n\}/.exec(tokens)?.[1] ?? "";
const dark = { ...light, ...variables(darkBlock) };

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * (r ?? 0) + 0.7152 * (g ?? 0) + 0.0722 * (b ?? 0);
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return ((hi ?? 0) + 0.05) / ((lo ?? 0) + 0.05);
}

const TEXT_PAIRS: [string, string][] = [
  ["text", "surface"],
  ["text", "chrome"],
  ["text", "desk"],
  ["text", "selection"],
  ["text-muted", "surface"],
  ["text-muted", "chrome"],
  ["text-muted", "desk"],
  ["text-muted", "selection"],
  ["action", "surface"],
  ["action", "chrome"],
  ["on-action", "action"],
  ["state-error", "surface"],
  ["state-error", "chrome"],
  ["state-warning", "surface"],
  ["state-warning", "chrome"],
  ["page-text", "page"],
  ["page-muted", "page"],
  ["page-text", "page-selection"],
];

const NON_TEXT_PAIRS: [string, string][] = [
  ["border-control", "surface"],
  ["border-control", "chrome"],
  ["action", "desk"],
  ["action", "selection"],
];

describe.each([
  ["light", light],
  ["dark", dark],
])("%s theme", (_name, theme) => {
  it.each(TEXT_PAIRS)("%s on %s is at least 4.5:1", (fg, bg) => {
    expect(theme[fg], fg).toBeDefined();
    expect(theme[bg], bg).toBeDefined();
    expect(contrast(theme[fg] ?? "", theme[bg] ?? "")).toBeGreaterThanOrEqual(
      4.5,
    );
  });
  it.each(NON_TEXT_PAIRS)("%s on %s is at least 3:1", (fg, bg) => {
    expect(contrast(theme[fg] ?? "", theme[bg] ?? "")).toBeGreaterThanOrEqual(
      3,
    );
  });
});

describe("tokens only", () => {
  it.each(
    Object.entries(files).filter(([path]) => !path.endsWith("tokens.css")),
  )("%s has no raw colours", (_path, source) => {
    expect(source).not.toMatch(/#[0-9a-f]{3,8}\b|\brgba?\(|\bhsla?\(/i);
  });

  it("matches DESIGN.md's light palette", () => {
    expect(light).toMatchObject({
      text: "#1a1a1a",
      "text-muted": "#595959",
      page: "#ffffff",
      surface: "#ffffff",
      chrome: "#f2f2f2",
      desk: "#e6e6e6",
      border: "#d0d0d0",
      "border-control": "#8a8a8a",
      action: "#1f5fa8",
      selection: "#e3ecf7",
      "state-error": "#a4262c",
      "state-warning": "#7a4100",
    });
  });

  it("has no infinite animations", () => {
    for (const [path, source] of Object.entries(files))
      expect(source, path).not.toMatch(/\binfinite\b/);
  });
});
