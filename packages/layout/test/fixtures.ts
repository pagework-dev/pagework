/// <reference types="vite/client" />
import { templateIdFromPath, templateStore } from "@pagework/templates";

// Vite needs the glob options written out at each call.
const builtIn = import.meta.glob<string>("../../../templates/**/*.yaml", {
  query: "?raw",
  import: "default",
  eager: true,
});
const testTemplates = import.meta.glob<string>(
  "../../../fixtures/layout/templates/*.yaml",
  { query: "?raw", import: "default", eager: true },
);
export const inputs = import.meta.glob<string>(
  "../../../fixtures/layout/*/*.fountain",
  { query: "?raw", import: "default", eager: true },
);
export const pictures = import.meta.glob<string>(
  "../../../fixtures/layout/*/*.txt",
  {
    query: "?raw",
    import: "default",
    eager: true,
  },
);

const sources: Record<string, string> = {};
for (const [path, source] of Object.entries(builtIn)) {
  sources[
    templateIdFromPath(
      path.slice(path.indexOf("/templates/") + "/templates/".length),
    )
  ] = source;
}
for (const [path, source] of Object.entries(testTemplates)) {
  sources[templateIdFromPath(path.slice(path.lastIndexOf("/") + 1))] = source;
}
export const load = templateStore(sources);
