import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  resolveTemplate,
  templateIdFromPath,
  templateStore,
  type Template,
} from "@pagework/templates";

/**
 * The built-in script templates (ADR 0007), read once at start-up from the
 * repository's templates/ folder, which the Docker image copies too.
 */
export const TEMPLATES_DIR = fileURLToPath(
  new URL("../../../templates/", import.meta.url),
);

export interface Templates {
  ids: readonly string[];
  byId(id: string): Template | undefined;
}

export function loadTemplates(dir = TEMPLATES_DIR): Templates {
  const sources: Record<string, string> = {};
  for (const entry of readdirSync(dir, { recursive: true, encoding: "utf8" }))
    if (/\.ya?ml$/.test(entry))
      sources[templateIdFromPath(entry)] = readFileSync(
        join(dir, entry),
        "utf8",
      );
  const store = templateStore(sources);
  // Base templates exist only to be extended.
  const ids = Object.keys(sources)
    .filter((id) => !id.startsWith("base/"))
    .sort();
  const resolved = new Map(ids.map((id) => [id, resolveTemplate(id, store)]));
  return { ids, byId: (id) => resolved.get(id) };
}
