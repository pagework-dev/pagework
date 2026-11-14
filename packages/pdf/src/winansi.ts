/**
 * WinAnsiEncoding (PDF 32000-1, Annex D.2): Latin-1, plus typographic
 * punctuation in 0x80–0x9F. Viewers map these codes to glyphs through the
 * font's Unicode cmap, which Courier Prime has.
 */
const HIGH: [number, number][] = [
  [0x80, 0x20ac],
  [0x82, 0x201a],
  [0x83, 0x0192],
  [0x84, 0x201e],
  [0x85, 0x2026],
  [0x86, 0x2020],
  [0x87, 0x2021],
  [0x88, 0x02c6],
  [0x89, 0x2030],
  [0x8a, 0x0160],
  [0x8b, 0x2039],
  [0x8c, 0x0152],
  [0x8e, 0x017d],
  [0x91, 0x2018],
  [0x92, 0x2019],
  [0x93, 0x201c],
  [0x94, 0x201d],
  [0x95, 0x2022],
  [0x96, 0x2013],
  [0x97, 0x2014],
  [0x98, 0x02dc],
  [0x99, 0x2122],
  [0x9a, 0x0161],
  [0x9b, 0x203a],
  [0x9c, 0x0153],
  [0x9e, 0x017e],
  [0x9f, 0x0178],
];

export const WIN_ANSI_TO_UNICODE = new Map<number, number>([
  ...Array.from({ length: 0x7f - 0x20 }, (_, i): [number, number] => [
    0x20 + i,
    0x20 + i,
  ]),
  ...HIGH,
  ...Array.from({ length: 0x100 - 0xa0 }, (_, i): [number, number] => [
    0xa0 + i,
    0xa0 + i,
  ]),
]);

const UNICODE_TO_WIN_ANSI = new Map(
  [...WIN_ANSI_TO_UNICODE].map(([code, unicode]) => [unicode, code]),
);

/** Encodes text for a WinAnsi font. Characters it can't encode become "?". */
export function encodeWinAnsi(text: string): {
  bytes: number[];
  unencodable: string[];
} {
  const bytes: number[] = [];
  const unencodable: string[] = [];
  for (const ch of text) {
    // Tabs never reach the renderer from layout, but a stray one prints as a space.
    const codePoint = ch === "\t" ? 0x20 : (ch.codePointAt(0) ?? 0x3f);
    const code = UNICODE_TO_WIN_ANSI.get(codePoint);
    if (code === undefined) {
      bytes.push(0x3f);
      if (!unencodable.includes(ch)) unencodable.push(ch);
    } else {
      bytes.push(code);
    }
  }
  return { bytes, unencodable };
}
