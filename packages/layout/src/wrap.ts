import type { Span } from "@pagework/fountain";

export interface WrappedLine {
  start: number;
  end: number;
  /** Spaces to print before the text: an indented line keeps its indent when it wraps. */
  indent: number;
}

/** Splits text into lines of at most `max` characters, at spaces where it can. */
export function wrapText(text: string, max: number): WrappedLine[] {
  const lines: WrappedLine[] = [];
  let offset = 0;
  for (const hardLine of text.split("\n")) {
    const leading = /^ */.exec(hardLine)?.[0].length ?? 0;
    // Continuation lines line up under the indent, if that leaves room.
    const hanging = leading < max / 2 ? leading : 0;
    let start = 0;
    let indent = 0;
    for (;;) {
      const room = max - indent;
      if (hardLine.length - start <= room) break;
      // Never break inside the line's own leading indent.
      const from = start === 0 ? leading : start;
      const space = hardLine.lastIndexOf(" ", start + room);
      const end = space > from ? space : start + room;
      lines.push({ start: offset + start, end: offset + end, indent });
      start = end;
      while (hardLine[start] === " ") start++;
      indent = hanging;
    }
    lines.push({
      start: offset + start,
      end: offset + hardLine.length,
      indent,
    });
    offset += hardLine.length + 1;
  }
  return lines;
}

/** Cuts spans to the plain-text range [start, end). */
export function sliceSpans(
  spans: readonly Span[],
  start: number,
  end: number,
): Span[] {
  const out: Span[] = [];
  let pos = 0;
  for (const span of spans) {
    const from = Math.max(start, pos);
    const to = Math.min(end, pos + span.text.length);
    if (from < to)
      out.push({ ...span, text: span.text.slice(from - pos, to - pos) });
    pos += span.text.length;
  }
  return out;
}

export function wrapSpans(spans: readonly Span[], max: number): Span[][] {
  const text = spans.map((s) => s.text).join("");
  return wrapText(text, Math.max(1, max)).map(({ start, end, indent }) => {
    const sliced = sliceSpans(spans, start, end);
    return indent > 0 ? [{ text: " ".repeat(indent) }, ...sliced] : sliced;
  });
}

export function spanLength(spans: readonly Span[]): number {
  return spans.reduce((n, s) => n + s.text.length, 0);
}
