import type { Element } from "@pagework/fountain";
import { paginate } from "@pagework/layout";
import type { Template } from "@pagework/templates";
import boldUrl from "@pagework/pdf/fonts/CourierPrime-Bold.ttf?url";
import boldItalicUrl from "@pagework/pdf/fonts/CourierPrime-BoldItalic.ttf?url";
import italicUrl from "@pagework/pdf/fonts/CourierPrime-Italic.ttf?url";
import regularUrl from "@pagework/pdf/fonts/CourierPrime-Regular.ttf?url";

export interface ExportedPdf {
  bytes: Uint8Array;
  pages: number;
  unencodable: string[];
}

async function fetchFont(url: string): Promise<Uint8Array> {
  const response = await fetch(url);
  if (!response.ok)
    throw new Error(`Couldn't load ${url}: ${String(response.status)}`);
  return new Uint8Array(await response.arrayBuffer());
}

/**
 * The PDF of a script, made in the browser from the same page model the
 * editor shows. The PDF renderer (pdf-lib, about 190 KB compressed) and the
 * fonts load only when the writer exports or prints, so they stay out of the
 * editor's bundle.
 */
export async function makePdf(
  elements: readonly Element[],
  template: Template,
  title: string | null,
): Promise<ExportedPdf> {
  const [{ renderPdf }, regular, bold, italic, boldItalic] = await Promise.all([
    import("@pagework/pdf"),
    fetchFont(regularUrl),
    fetchFont(boldUrl),
    fetchFont(italicUrl),
    fetchFont(boldItalicUrl),
  ]);
  const model = paginate(elements, template);
  const pdf = await renderPdf(model, {
    fonts: { regular, bold, italic, boldItalic },
    ...(title === null ? {} : { title }),
  });
  return {
    bytes: pdf.bytes,
    pages: model.pages.filter((p) => p.kind === "script").length,
    unencodable: pdf.unencodable,
  };
}

/**
 * Prints the PDF, so printed pages always match exported ones (ARCHITECTURE.md,
 * Export and import): the browser's print dialog opens on the PDF in a hidden
 * frame. Where a browser can't print a PDF from a frame, it opens in a new tab.
 */
export function printPdf(bytes: Uint8Array): void {
  const url = URL.createObjectURL(
    new Blob([bytes as BlobPart], { type: "application/pdf" }),
  );
  const frame = document.createElement("iframe");
  frame.style.position = "fixed";
  frame.style.width = "0";
  frame.style.height = "0";
  frame.style.border = "0";
  frame.src = url;
  frame.addEventListener("load", () => {
    try {
      frame.contentWindow?.focus();
      frame.contentWindow?.print();
    } catch {
      window.open(url, "_blank", "noopener");
    }
  });
  document.body.append(frame);
  setTimeout(() => {
    frame.remove();
    URL.revokeObjectURL(url);
  }, 10 * 60_000);
}
