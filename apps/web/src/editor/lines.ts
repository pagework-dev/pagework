import type { Element } from "@pagework/fountain";

/** What a source line is, for the editor: an element type, or an empty line. */
export type LineKind = Element["type"] | "blank";

/** Index of the first element whose last line is at or after `line` (1-based). */
export function elementIndexAt(
  elements: readonly Element[],
  line: number,
): number {
  let lo = 0;
  let hi = elements.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    const el = elements[mid];
    if (el !== undefined && el.lines[1] < line) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** The element a 1-based source line belongs to, if any. */
export function elementAt(
  elements: readonly Element[],
  line: number,
): Element | null {
  const el = elements[elementIndexAt(elements, line)];
  return el !== undefined && el.lines[0] <= line ? el : null;
}

export function lineKind(elements: readonly Element[], line: number): LineKind {
  return elementAt(elements, line)?.type ?? "blank";
}
