/**
 * Splits source text into logical lines with notes and boneyard removed.
 *
 * Notes and boneyard can span line breaks, so a logical line may cover several
 * source lines: the text before `[[` and after `]]` joins into one line, which
 * is what the writer sees once the note is hidden.
 */

export interface HiddenRegion {
  kind: "note" | "boneyard";
  text: string;
}

export interface LogicalLine {
  /** Text with notes and boneyard removed. */
  text: string;
  first: number;
  last: number;
  regions: HiddenRegion[];
}

/**
 * Fountain treats an empty line as the end of a paragraph, but a line of two
 * or more spaces as a deliberate empty line inside one.
 */
export function isKeptEmptyLine(text: string): boolean {
  return /^ {2,}$/.test(text);
}

function isEmptyLine(text: string): boolean {
  return text.trim() === "" && !isKeptEmptyLine(text);
}

/** A note may not contain an empty line; that ends the paragraph it is in. */
function noteSpansEmptyLine(inner: string): boolean {
  const parts = inner.split("\n");
  return parts.slice(1, -1).some(isEmptyLine);
}

function countNewlines(text: string): number {
  let n = 0;
  for (const ch of text) if (ch === "\n") n++;
  return n;
}

export function normaliseNewlines(source: string): string {
  return source.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
}

/** `firstLine` numbers the lines of a fragment by their place in the script. */
export function logicalLines(source: string, firstLine = 1): LogicalLine[] {
  const src = normaliseNewlines(source);
  const out: LogicalLine[] = [];
  let line = firstLine;
  let current: LogicalLine = {
    text: "",
    first: firstLine,
    last: firstLine,
    regions: [],
  };
  let i = 0;
  for (;;) {
    if (i >= src.length || src[i] === "\n") {
      current.last = line;
      out.push(current);
      if (i >= src.length) break;
      i++;
      line++;
      current = { text: "", first: line, last: line, regions: [] };
      continue;
    }
    if (src.startsWith("/*", i)) {
      const close = src.indexOf("*/", i + 2);
      if (close !== -1) {
        const inner = src.slice(i + 2, close);
        current.regions.push({ kind: "boneyard", text: inner });
        line += countNewlines(inner);
        i = close + 2;
        continue;
      }
    }
    if (src.startsWith("[[", i)) {
      const close = src.indexOf("]]", i + 2);
      if (close !== -1) {
        const inner = src.slice(i + 2, close);
        if (!noteSpansEmptyLine(inner)) {
          current.regions.push({ kind: "note", text: inner });
          line += countNewlines(inner);
          i = close + 2;
          continue;
        }
      }
    }
    current.text += src.charAt(i);
    i++;
  }
  // A final newline ends the last line; it does not start an empty one.
  const last = out.at(-1);
  if (src.endsWith("\n") && last?.text === "" && last.regions.length === 0)
    out.pop();
  return out;
}
