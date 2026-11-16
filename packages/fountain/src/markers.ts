/**
 * Continuation markers (ADR 0011). The paginator adds them when rendering, so
 * any found in text are leftovers from another app or a PDF and are removed.
 * Covers the common spellings: CONT'D, CONT’D, CONTD, CONT., CONT, CONTINUED.
 */

const CONTINUED_WORD = String.raw`(?:cont(?:['’]?d|\.)?|continued)`;

/** A character extension that is a continuation marker, e.g. "CONT'D". */
export function isContinuedExtension(extension: string): boolean {
  return new RegExp(`^\\s*${CONTINUED_WORD}\\s*$`, "i").test(extension);
}

/** "(MORE)" at the foot of a split speech. */
export function isMoreLine(text: string): boolean {
  return /^\(\s*more\s*\)$/i.test(text.trim());
}

/** "CONTINUED:", "(CONTINUED)" or "CONTINUED: (2)" on a line of its own. */
export function isSceneContinuedLine(text: string): boolean {
  return /^\(?\s*continued\s*\)?\s*:?\s*(?:\(\d+\))?$/i.test(text.trim());
}

/** Matches a parenthesised continuation marker inside a character cue. */
export const CUE_MARKER = new RegExp(
  String.raw`\s*\(\s*${CONTINUED_WORD}\s*\)`,
  "gi",
);

export interface RemovedMarker {
  /** 1-based source line. */
  line: number;
  /** The marker as it was written. */
  marker: string;
}
