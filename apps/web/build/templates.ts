import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  resolveTemplate,
  templateIdFromPath,
  templateStore,
  type Template,
} from "@pagework/templates";
import type { Plugin } from "vite";

const TEMPLATES_DIR = fileURLToPath(
  new URL("../../../templates/", import.meta.url),
);
const MODULE_ID = "virtual:pagework-templates";
const RESOLVED_ID = `\0${MODULE_ID}`;

/** Every template a script can use, resolved, in id order. */
export function builtInTemplates(dir = TEMPLATES_DIR): Template[] {
  const sources: Record<string, string> = {};
  for (const entry of readdirSync(dir, { recursive: true, encoding: "utf8" })) {
    if (/\.ya?ml$/.test(entry))
      sources[templateIdFromPath(entry)] = readFileSync(
        join(dir, entry),
        "utf8",
      );
  }
  const store = templateStore(sources);
  // Base templates exist to be extended and are incomplete on their own.
  return Object.keys(sources)
    .filter((id) => !id.startsWith("base/"))
    .sort()
    .map((id) => resolveTemplate(id, store));
}

/**
 * Serves the built-in templates to the app as pre-resolved JSON, so the
 * browser never loads the YAML parser or the schema validator. Templates are
 * read and validated when Vite builds, and again when a file changes in dev.
 */
export function templatesPlugin(): Plugin {
  return {
    name: "pagework-templates",
    resolveId(id) {
      return id === MODULE_ID ? RESOLVED_ID : null;
    },
    load(id) {
      if (id !== RESOLVED_ID) return null;
      for (const entry of readdirSync(TEMPLATES_DIR, { recursive: true }))
        this.addWatchFile(join(TEMPLATES_DIR, String(entry)));
      return `export default ${JSON.stringify(builtInTemplates())};`;
    },
  };
}
