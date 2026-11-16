/**
 * Reads the few TrueType tables a PDF font descriptor needs. Courier Prime is
 * embedded whole as a simple TrueType font, so there is no subsetting and no
 * glyph data to touch: only names, metrics and the Unicode character map.
 */

export interface FontInfo {
  postScriptName: string;
  unitsPerEm: number;
  bbox: [number, number, number, number];
  ascender: number;
  descender: number;
  capHeight: number;
  italicAngle: number;
  isFixedPitch: boolean;
  underlinePosition: number;
  underlineThickness: number;
  weightClass: number;
  /** Advance width in font units for a Unicode code point, or null if the font has no glyph. */
  advanceOf: (codePoint: number) => number | null;
}

interface Table {
  offset: number;
  length: number;
}

function tables(view: DataView): Map<string, Table> {
  const count = view.getUint16(4);
  const map = new Map<string, Table>();
  for (let i = 0; i < count; i++) {
    const record = 12 + i * 16;
    const tag = String.fromCharCode(
      view.getUint8(record),
      view.getUint8(record + 1),
      view.getUint8(record + 2),
      view.getUint8(record + 3),
    );
    map.set(tag, {
      offset: view.getUint32(record + 8),
      length: view.getUint32(record + 12),
    });
  }
  return map;
}

function need(map: Map<string, Table>, tag: string): Table {
  const table = map.get(tag);
  if (table === undefined) throw new Error(`Font has no ${tag} table`);
  return table;
}

function fixed(view: DataView, at: number): number {
  return view.getInt16(at) + view.getUint16(at + 2) / 65536;
}

function postScriptName(view: DataView, name: Table): string {
  const count = view.getUint16(name.offset + 2);
  const strings = name.offset + view.getUint16(name.offset + 4);
  for (let i = 0; i < count; i++) {
    const r = name.offset + 6 + i * 12;
    const platform = view.getUint16(r);
    const nameId = view.getUint16(r + 6);
    if (nameId !== 6) continue;
    const length = view.getUint16(r + 8);
    const start = strings + view.getUint16(r + 10);
    let text = "";
    if (platform === 3 || platform === 0) {
      for (let j = 0; j < length; j += 2)
        text += String.fromCharCode(view.getUint16(start + j));
    } else {
      for (let j = 0; j < length; j++)
        text += String.fromCharCode(view.getUint8(start + j));
    }
    if (text !== "") return text;
  }
  throw new Error("Font has no PostScript name");
}

/** Glyph ids for code points, from a format 4 (BMP) Unicode subtable. */
function cmapFormat4(
  view: DataView,
  cmap: Table,
): (codePoint: number) => number {
  const count = view.getUint16(cmap.offset + 2);
  let sub = -1;
  for (let i = 0; i < count; i++) {
    const r = cmap.offset + 4 + i * 8;
    const platform = view.getUint16(r);
    const encoding = view.getUint16(r + 2);
    const at = cmap.offset + view.getUint32(r + 4);
    if (
      ((platform === 3 && encoding === 1) || platform === 0) &&
      view.getUint16(at) === 4
    ) {
      sub = at;
      break;
    }
  }
  if (sub === -1) throw new Error("Font has no format 4 Unicode cmap");
  const segments = view.getUint16(sub + 6) / 2;
  const ends = sub + 14;
  const starts = ends + segments * 2 + 2;
  const deltas = starts + segments * 2;
  const rangeOffsets = deltas + segments * 2;
  return (codePoint) => {
    if (codePoint > 0xffff) return 0;
    for (let s = 0; s < segments; s++) {
      if (codePoint > view.getUint16(ends + s * 2)) continue;
      const start = view.getUint16(starts + s * 2);
      if (codePoint < start) return 0;
      const delta = view.getInt16(deltas + s * 2);
      const rangeAt = rangeOffsets + s * 2;
      const rangeOffset = view.getUint16(rangeAt);
      if (rangeOffset === 0) return (codePoint + delta) & 0xffff;
      const glyph = view.getUint16(
        rangeAt + rangeOffset + (codePoint - start) * 2,
      );
      return glyph === 0 ? 0 : (glyph + delta) & 0xffff;
    }
    return 0;
  };
}

export function readFont(bytes: Uint8Array): FontInfo {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const map = tables(view);
  const head = need(map, "head").offset;
  const hhea = need(map, "hhea").offset;
  const hmtx = need(map, "hmtx").offset;
  const post = need(map, "post").offset;
  const os2 = need(map, "OS/2").offset;
  const glyphOf = cmapFormat4(view, need(map, "cmap"));
  const metrics = view.getUint16(hhea + 34);
  const os2Version = view.getUint16(os2);

  return {
    postScriptName: postScriptName(view, need(map, "name")),
    unitsPerEm: view.getUint16(head + 18),
    bbox: [
      view.getInt16(head + 36),
      view.getInt16(head + 38),
      view.getInt16(head + 40),
      view.getInt16(head + 42),
    ],
    ascender: view.getInt16(hhea + 4),
    descender: view.getInt16(hhea + 6),
    capHeight:
      os2Version >= 2 ? view.getInt16(os2 + 88) : view.getInt16(hhea + 4),
    italicAngle: fixed(view, post + 4),
    underlinePosition: view.getInt16(post + 8),
    underlineThickness: view.getInt16(post + 10),
    isFixedPitch: view.getUint32(post + 12) !== 0,
    weightClass: view.getUint16(os2 + 4),
    advanceOf: (codePoint) => {
      const glyph = glyphOf(codePoint);
      if (glyph === 0) return null;
      const index = Math.min(glyph, metrics - 1);
      return view.getUint16(hmtx + index * 4);
    },
  };
}
