import type { Element } from "./elements.ts";
import { normaliseNewlines } from "./lines.ts";
import { parse } from "./parse.ts";

export interface LineType {
  line: number;
  /** Element type, with "blank" for lines that belong to no element. */
  type: string;
  text: string;
}

function label(element: Element): string {
  const flags: string[] = [];
  if ("forced" in element && element.forced) flags.push("forced");
  if (element.type === "character" && element.dual !== null)
    flags.push(`dual ${element.dual}`);
  if (element.type === "section") flags.push(`depth ${String(element.depth)}`);
  if (element.type === "scene_heading" && element.sceneNumber !== null) {
    flags.push(`#${element.sceneNumber}`);
  }
  return flags.length > 0
    ? `${element.type} (${flags.join(", ")})`
    : element.type;
}

/**
 * Pairs every source line with the type of the element it was read as, for
 * checking the parser by eye.
 */
export function lineTypes(source: string): LineType[] {
  const text = normaliseNewlines(source);
  const lines = text.split("\n");
  if (text.endsWith("\n")) lines.pop();
  const types: (string | undefined)[] = [];
  for (const element of parse(source)) {
    const [first, last] = element.lines;
    for (let n = first; n <= last; n++) types[n - 1] ??= label(element);
  }
  return lines.map((lineText, i) => ({
    line: i + 1,
    type: types[i] ?? "blank",
    text: lineText,
  }));
}

export function formatLineTypes(rows: LineType[]): string {
  const typeWidth = Math.max(5, ...rows.map((r) => r.type.length));
  const numberWidth = String(rows.length).length;
  return rows
    .map(
      (r) =>
        `${String(r.line).padStart(numberWidth)}  ${r.type.padEnd(typeWidth)}  | ${r.text}`,
    )
    .join("\n");
}
