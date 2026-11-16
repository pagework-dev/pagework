/**
 * Advance width of every character, as a fraction of the font size. Layout
 * only supports monospaced fonts: wrapping counts characters. Courier Prime's
 * value is checked against the font file in packages/pdf.
 */
const ADVANCE: Record<string, number> = {
  "Courier Prime": 0.6,
};

export function characterWidth(family: string, size: number): number {
  const advance = ADVANCE[family];
  if (advance === undefined)
    throw new Error(`No metrics for the font "${family}"`);
  return advance * size;
}
