import { existsSync, readFileSync, statSync } from "node:fs";
import { extname, join, normalize, sep } from "node:path";

/**
 * Serves the built web app (apps/web/dist) with the same response headers
 * the standalone deployment sends. Those headers are written by the web
 * build into dist/_headers (apps/web/build/headers.ts); reading that file
 * keeps one source for the content security policy.
 */

export interface HeaderRule {
  /** A path, or a prefix ending in "*". */
  pattern: string;
  headers: Record<string, string>;
}

/** Parses the _headers format: a path line, then indented "Name: value" lines. */
export function parseHeadersFile(text: string): HeaderRule[] {
  const rules: HeaderRule[] = [];
  let current: HeaderRule | null = null;
  for (const raw of text.split("\n")) {
    if (raw.trim() === "" || raw.trimStart().startsWith("#")) continue;
    if (!/^\s/.test(raw)) {
      current = { pattern: raw.trim(), headers: {} };
      rules.push(current);
      continue;
    }
    const colon = raw.indexOf(":");
    if (current === null || colon === -1) continue;
    current.headers[raw.slice(0, colon).trim()] = raw.slice(colon + 1).trim();
  }
  return rules;
}

function matches(pattern: string, path: string): boolean {
  return pattern.endsWith("*")
    ? path.startsWith(pattern.slice(0, -1))
    : pattern === path;
}

export function headersFor(
  rules: readonly HeaderRule[],
  path: string,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const rule of rules)
    if (matches(rule.pattern, path)) Object.assign(out, rule.headers);
  return out;
}

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".ttf": "font/ttf",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
  ".webmanifest": "application/manifest+json",
};

export interface WebFile {
  status: 200 | 404;
  body: Uint8Array;
  headers: Record<string, string>;
}

export interface WebApp {
  available: boolean;
  /** The security headers every response carries, API included. */
  securityHeaders: Record<string, string>;
  file(path: string): WebFile;
}

export function webApp(dir: string): WebApp {
  const headersPath = join(dir, "_headers");
  const indexPath = join(dir, "index.html");
  const available = existsSync(indexPath);
  const rules = existsSync(headersPath)
    ? parseHeadersFile(readFileSync(headersPath, "utf8"))
    : [];
  const securityHeaders = headersFor(rules, "/");
  const root = normalize(dir + sep);

  const read = (path: string, file: string): WebFile => ({
    status: 200,
    body: readFileSync(file),
    headers: {
      ...headersFor(rules, path),
      "Content-Type": TYPES[extname(file)] ?? "application/octet-stream",
    },
  });

  return {
    available,
    securityHeaders,
    file(path) {
      const missing: WebFile = {
        status: 404,
        body: new TextEncoder().encode("Not found"),
        headers: { ...securityHeaders, "Content-Type": "text/plain" },
      };
      if (!available) return missing;
      let decoded: string;
      try {
        decoded = decodeURIComponent(path);
      } catch {
        return missing;
      }
      const file = normalize(join(dir, decoded));
      // Nothing outside the web folder, and never the headers file itself.
      if (!file.startsWith(root) || file === headersPath) return missing;
      if (existsSync(file) && statSync(file).isFile()) return read(path, file);
      // Addresses inside the app (no file extension) get the app itself.
      if (extname(decoded) === "") return read("/index.html", indexPath);
      return missing;
    },
  };
}
