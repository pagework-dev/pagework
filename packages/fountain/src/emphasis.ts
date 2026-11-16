import type { Span } from "./elements.ts";

type Style = Omit<Span, "text">;

interface Token {
  ch: string;
  /** An unescaped `*` or `_` that may open or close emphasis. */
  marker: boolean;
}

function isSpace(token: Token | undefined): boolean {
  return token === undefined || /\s/.test(token.ch);
}

function isWordCharacter(token: Token | undefined): boolean {
  return token !== undefined && /[\p{L}\p{N}]/u.test(token.ch);
}

/**
 * Markdown's flanking rules, which Fountain 1.1 follows: a marker opens only
 * if text follows it, and closes only if text precedes it, so "*69 and then
 * *23" stays plain. Underscores also can't open or close inside a word, so
 * file_name_here stays plain.
 */
function canOpen(tokens: Token[], at: number, length: number): boolean {
  if (isSpace(tokens[at + length])) return false;
  return tokens[at]?.ch !== "_" || !isWordCharacter(tokens[at - 1]);
}

function canClose(tokens: Token[], at: number, length: number): boolean {
  if (isSpace(tokens[at - 1])) return false;
  return tokens[at]?.ch !== "_" || !isWordCharacter(tokens[at + length]);
}

function tokenise(line: string): Token[] {
  const tokens: Token[] = [];
  for (let i = 0; i < line.length; i++) {
    const ch = line.charAt(i);
    const next = line.charAt(i + 1);
    if (ch === "\\" && (next === "*" || next === "_" || next === "\\")) {
      tokens.push({ ch: next, marker: false });
      i++;
    } else {
      tokens.push({ ch, marker: ch === "*" || ch === "_" });
    }
  }
  return tokens;
}

function starRun(tokens: Token[], from: number, end: number): number {
  let n = 0;
  while (
    from + n < end &&
    tokens[from + n]?.marker === true &&
    tokens[from + n]?.ch === "*"
  )
    n++;
  return n;
}

/** Index of the next `*` run of exactly `length` in [from, end), or -1. */
function findStarCloser(
  tokens: Token[],
  from: number,
  end: number,
  length: number,
): number {
  let j = from;
  while (j < end) {
    const run = starRun(tokens, j, end);
    if (run === 0) {
      j++;
    } else if (run === length && canClose(tokens, j, run)) {
      return j;
    } else {
      j += run;
    }
  }
  return -1;
}

function findUnderscoreCloser(
  tokens: Token[],
  from: number,
  end: number,
): number {
  for (let j = from; j < end; j++) {
    const t = tokens[j];
    if (t?.marker === true && t.ch === "_" && canClose(tokens, j, 1)) return j;
  }
  return -1;
}

function withStyle(style: Style, add: Style): Style {
  return { ...style, ...add };
}

function parseRange(
  tokens: Token[],
  start: number,
  end: number,
  style: Style,
  out: Span[],
): void {
  let text = "";
  const flush = (): void => {
    if (text !== "") out.push({ text, ...style });
    text = "";
  };
  let i = start;
  while (i < end) {
    const t = tokens[i];
    if (t === undefined) break;
    if (t.marker && t.ch === "*") {
      const run = starRun(tokens, i, end);
      if (run <= 3 && canOpen(tokens, i, run)) {
        const closer = findStarCloser(tokens, i + run, end, run);
        if (closer > i + run) {
          flush();
          const add: Style =
            run === 1
              ? { italic: true }
              : run === 2
                ? { bold: true }
                : { bold: true, italic: true };
          parseRange(tokens, i + run, closer, withStyle(style, add), out);
          i = closer + run;
          continue;
        }
      }
      text += "*".repeat(run);
      i += run;
    } else if (t.marker && t.ch === "_") {
      const closer = canOpen(tokens, i, 1)
        ? findUnderscoreCloser(tokens, i + 1, end)
        : -1;
      if (closer > i + 1) {
        flush();
        parseRange(
          tokens,
          i + 1,
          closer,
          withStyle(style, { underline: true }),
          out,
        );
        i = closer + 1;
        continue;
      }
      text += "_";
      i++;
    } else {
      text += t.ch;
      i++;
    }
  }
  flush();
}

function sameStyle(a: Span, b: Span): boolean {
  return (
    a.bold === b.bold && a.italic === b.italic && a.underline === b.underline
  );
}

/** Joins adjacent spans with the same emphasis. */
export function mergeSpans(spans: Span[]): Span[] {
  const out: Span[] = [];
  for (const span of spans) {
    const last = out.at(-1);
    if (last !== undefined && sameStyle(last, span)) {
      last.text += span.text;
    } else {
      out.push({ ...span });
    }
  }
  return out;
}

/**
 * Parses emphasis on one line. Emphasis never crosses a line break (Fountain
 * 1.1), so callers parse line by line and join with {@link joinLines}.
 */
export function parseInline(line: string): Span[] {
  const tokens = tokenise(line);
  const out: Span[] = [];
  parseRange(tokens, 0, tokens.length, {}, out);
  return mergeSpans(out);
}

export function joinLines(lines: string[]): Span[] {
  const spans: Span[] = [];
  lines.forEach((line, index) => {
    if (index > 0) spans.push({ text: "\n" });
    spans.push(...parseInline(line));
  });
  return mergeSpans(spans);
}

export function plainText(spans: readonly Span[]): string {
  return spans.map((s) => s.text).join("");
}
