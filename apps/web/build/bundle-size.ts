import { readFileSync } from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";

// ARCHITECTURE.md, Performance budgets: JavaScript for the editor screen,
// compressed, under 150 KB. Counts every script index.html loads or
// preloads; chunks loaded on demand (the PDF renderer) aren't counted.

const BUDGET_KB = 150;
const dist = join(import.meta.dirname, "../dist");
const html = readFileSync(join(dist, "index.html"), "utf8");
const scripts = [
  ...html.matchAll(/<script[^>]+src="\/([^"]+\.js)"/g),
  ...html.matchAll(/<link[^>]+rel="modulepreload"[^>]+href="\/([^"]+\.js)"/g),
].map((m) => m[1] ?? "");
let total = 0;
for (const file of new Set(scripts)) {
  const size = gzipSync(readFileSync(join(dist, file)), { level: 9 }).length;
  total += size;
  console.log(`${file}: ${(size / 1024).toFixed(1)} KB gzipped`);
}
console.log(
  `editor screen: ${(total / 1024).toFixed(1)} KB of ${String(BUDGET_KB)} KB`,
);
if (scripts.length === 0)
  throw new Error("No scripts found in dist/index.html");
if (total > BUDGET_KB * 1024) {
  console.error("Over the JavaScript budget for the editor screen.");
  process.exit(1);
}
