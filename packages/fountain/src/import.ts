import { normaliseNewlines } from "./lines.ts";
import {
  CUE_MARKER,
  isMoreLine,
  isSceneContinuedLine,
  type RemovedMarker,
} from "./markers.ts";
import { parse } from "./parse.ts";

/**
 * Removes typed continuation markers from Fountain text, for importers
 * (ADR 0011). Markers in cues are cut out of the line; "(MORE)" and
 * "CONTINUED:" lines are deleted, along with the blank line their removal
 * would double up. Content extensions such as (V.O.) are kept.
 */
export function removeContinuationMarkers(source: string): {
  text: string;
  removed: RemovedMarker[];
} {
  const text = normaliseNewlines(source);
  const lines = text.split("\n");
  const owner: (string | undefined)[] = [];
  for (const element of parse(text)) {
    for (let n = element.lines[0]; n <= element.lines[1]; n++)
      owner[n - 1] ??= element.type;
  }

  const removed: RemovedMarker[] = [];
  const kept: string[] = [];
  const isBlank = (line: string | undefined): boolean => line?.trim() === "";
  let changed = false;

  for (const [i, line] of lines.entries()) {
    const type = owner[i];
    if (type === "character") {
      const stripped = line.replace(CUE_MARKER, (match) => {
        removed.push({ line: i + 1, marker: match.trim() });
        return "";
      });
      changed ||= stripped !== line;
      kept.push(stripped);
      continue;
    }
    // The parser leaves typed markers out of the element list, so a marker
    // line is one that belongs to no element.
    if (
      type === undefined &&
      (isMoreLine(line) || isSceneContinuedLine(line)) &&
      line.trim() !== ""
    ) {
      removed.push({ line: i + 1, marker: line.trim() });
      changed = true;
      if (isBlank(kept.at(-1)) && isBlank(lines[i + 1])) kept.pop();
      continue;
    }
    kept.push(line);
  }

  return { text: changed ? kept.join("\n") : source, removed };
}
