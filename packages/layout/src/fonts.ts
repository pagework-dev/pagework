/**
 * Advance width of every character, as a fraction of the font size. Layout
 * only supports monospaced fonts: wrapping counts characters. Courier Prime's
 * value is checked against the font file in packages/pdf.
 */
const ADVANCE: Record<string, number> = {
  // 1228 of 2048 font units for every glyph (hmtx table of all four styles).
  "Courier Prime": 1228 / 2048,
};

export function characterWidth(family: string, size: number): number {
  const advance = ADVANCE[family];
  if (advance === undefined)
    throw new Error(`No metrics for the font "${family}"`);
  return advance * size;
}
