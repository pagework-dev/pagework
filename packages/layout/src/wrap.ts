import type { Span } from "@pagework/fountain";

/** Splits text into lines of at most `max` characters, at spaces where it can. */
export function wrapText(
  text: string,
  max: number,
): [start: number, end: number][] {
  const ranges: [number, number][] = [];
  let offset = 0;
  for (const hardLine of text.split("\n")) {
    let start = 0;
    const indent = /^\s*/.exec(hardLine)?.[0].length ?? 0;
    while (hardLine.length - start > max) {
      // Never break inside a line's own leading indent.
      const from = start === 0 ? indent : start;
      const space = hardLine.lastIndexOf(" ", start + max);
      if (space > from) {
        ranges.push([offset + start, offset + space]);
        start = space + 1;
      } else {
        ranges.push([offset + start, offset + start + max]);
        start += max;
      }
      while (hardLine[start] === " ") start++;
    }
    ranges.push([offset + start, offset + hardLine.length]);
    offset += hardLine.length + 1;
  }
  return ranges;
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
  return wrapText(text, Math.max(1, max)).map(([start, end]) =>
    sliceSpans(spans, start, end),
  );
}

export function spanLength(spans: readonly Span[]): number {
  return spans.reduce((n, s) => n + s.text.length, 0);
}
