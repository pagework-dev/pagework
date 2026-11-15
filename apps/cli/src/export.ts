import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  parse,
  plainText,
  removeContinuationMarkers,
} from "@pagework/fountain";
import { paginate } from "@pagework/layout";
import { FONT_FILES, renderPdf, type CourierPrime } from "@pagework/pdf";
import {
  resolveTemplate,
  templateIdFromPath,
  templateStore,
} from "@pagework/templates";

export const TEMPLATES_DIR = fileURLToPath(
  new URL("../../../templates/", import.meta.url),
);
const FONTS_DIR = fileURLToPath(
  new URL("../fonts/", import.meta.resolve("@pagework/pdf")),
);

/** Every template file under a directory, keyed by id. */
export function readTemplates(dir: string): Record<string, string> {
  const sources: Record<string, string> = {};
  for (const entry of readdirSync(dir, { recursive: true, encoding: "utf8" })) {
    if (/\.ya?ml$/.test(entry))
      sources[templateIdFromPath(entry)] = readFileSync(
        join(dir, entry),
        "utf8",
      );
  }
  return sources;
}

function readFonts(): CourierPrime {
  const read = (file: string): Uint8Array =>
    new Uint8Array(readFileSync(join(FONTS_DIR, file)));
  return {
    regular: read(FONT_FILES.regular),
    bold: read(FONT_FILES.bold),
    italic: read(FONT_FILES.italic),
    boldItalic: read(FONT_FILES.boldItalic),
  };
}

export interface ExportResult {
  pages: number;
  /** Typed continuation markers removed on import (ADR 0011). */
  removedMarkers: number;
  unencodable: string[];
}

/** Fountain file in, PDF file out. */
export async function exportPdf(
  input: string,
  templateId: string,
  output: string,
  templatesDir = TEMPLATES_DIR,
): Promise<ExportResult> {
  const { text, removed } = removeContinuationMarkers(
    readFileSync(input, "utf8"),
  );
  const elements = parse(text);
  const sources = readTemplates(templatesDir);
  if (sources[templateId] === undefined) {
    const choices = Object.keys(sources)
      .filter((id) => !id.startsWith("base/"))
      .sort();
    throw new Error(
      `There is no template "${templateId}". Choose one of: ${choices.join(", ")}`,
    );
  }
  const template = resolveTemplate(templateId, templateStore(sources));
  const model = paginate(elements, template);
  const titleField = elements
    .find((e) => e.type === "title_page")
    ?.fields.find((f) => f.key.toLowerCase() === "title");
  const title =
    titleField === undefined
      ? undefined
      : plainText(titleField.content).replace(/\s+/g, " ").trim();
  const pdf = await renderPdf(model, {
    fonts: readFonts(),
    ...(title === undefined ? {} : { title }),
  });
  writeFileSync(output, pdf.bytes);
  return {
    pages: model.pages.filter((p) => p.kind === "script").length,
    removedMarkers: removed.length,
    unencodable: pdf.unencodable,
  };
}
