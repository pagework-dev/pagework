import { characterWidth } from "./fonts.ts";
import type { PageModel } from "./model.ts";

/**
 * Draws pages as plain text: one column per character, one row per line,
 * rows numbered from the top edge of the page. Used by the layout golden
 * files and for checking page breaks by eye.
 */
export function renderText(model: PageModel): string {
  const cw = characterWidth(model.font.family, model.font.size);
  const out: string[] = [];
  for (const page of model.pages) {
    out.push(
      page.kind === "title"
        ? "=== title page ==="
        : `=== page ${String(page.number)} ===`,
    );
    const rows = new Map<number, { col: number; text: string }[]>();
    for (const line of page.lines) {
      const row = Math.round(line.y / model.font.lineHeight);
      const items = rows.get(row) ?? [];
      items.push({
        col: Math.round(line.x / cw),
        text: line.spans.map((s) => s.text).join(""),
      });
      rows.set(row, items);
    }
    for (const row of [...rows.keys()].sort((a, b) => a - b)) {
      let text = "";
      for (const item of (rows.get(row) ?? []).sort((a, b) => a.col - b.col)) {
        text +=
          " ".repeat(
            Math.max(item.col - text.length, text === "" ? item.col : 1),
          ) + item.text;
      }
      out.push(`${String(row).padStart(2, "0")}|${text}`);
    }
  }
  return `${out.join("\n")}\n`;
}
