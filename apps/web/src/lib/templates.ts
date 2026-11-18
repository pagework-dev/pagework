import type { Template } from "@pagework/templates";
import templates from "virtual:pagework-templates";

export { templates };

/**
 * US Letter where it is the usual paper size (the United States, Canada,
 * Mexico and the Philippines); A4 everywhere else.
 */
export function defaultTemplateId(locale: string): string {
  const region = /[-_]([A-Z]{2})\b/i.exec(locale)?.[1]?.toUpperCase();
  const letter = ["US", "CA", "MX", "PH"].includes(region ?? "");
  return letter ? "screenplay-us" : "screenplay-a4";
}

export function templateById(id: string): Template {
  const found = templates.find((t) => t.id === id) ?? templates[0];
  if (found === undefined) throw new Error("No templates were built");
  return found;
}
