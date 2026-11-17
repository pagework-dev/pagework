import {
  plainText,
  removeContinuationMarkers,
  type Element,
} from "@pagework/fountain";

/** File types Pagework opens and saves. */
export const FOUNTAIN_EXTENSIONS = [".fountain", ".spmd", ".txt"];

export interface ImportedScript {
  text: string;
  /** Continuation markers taken out (ADR 0011). */
  removedMarkers: number;
}

/**
 * Text from a file, ready for the editor: no byte-order mark, "\n" line
 * endings, and no typed (MORE)/(CONT'D)/CONTINUED, which the paginator adds.
 */
export function importScript(raw: string): ImportedScript {
  const normalised = raw.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  const { text, removed } = removeContinuationMarkers(normalised);
  return { text, removedMarkers: removed.length };
}

export function hasFountainExtension(name: string): boolean {
  const lower = name.toLowerCase();
  return FOUNTAIN_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

/** The title page's Title, as one line, if there is one. */
export function scriptTitle(elements: readonly Element[]): string | null {
  const field = elements
    .find((e) => e.type === "title_page")
    ?.fields.find((f) => f.key.toLowerCase() === "title");
  if (field === undefined) return null;
  const title = plainText(field.content).replace(/\s+/g, " ").trim();
  return title === "" ? null : title;
}

/** A file name from a title: letters, digits, spaces and a few safe marks. */
export function fileBaseName(
  fileName: string | null,
  title: string | null,
  fallback: string,
): string {
  if (fileName !== null) return fileName.replace(/\.[^.]+$/, "");
  const base = (title ?? fallback)
    .replace(/[\\/:*?"<>|]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
  return base === "" ? fallback : base;
}
