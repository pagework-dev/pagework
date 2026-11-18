import type { Plugin } from "vite";

/**
 * Response headers for the deployed app (docs/DEPLOYMENT.md). The content
 * security policy makes the browser itself enforce CLAUDE.md's "the app talks
 * to its own server only": scripts, styles, fonts and requests may come from
 * the app's own origin and nowhere else.
 *
 * - style 'unsafe-inline': CodeMirror injects its styles at run time, and
 *   Svelte sets element styles. No script runs inline.
 * - blob: frames and images: Print opens the PDF in a hidden frame.
 */
export const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "connect-src 'self'",
  "frame-src blob:",
  "worker-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
].join("; ");

export const SECURITY_HEADERS: Record<string, string> = {
  "Content-Security-Policy": CONTENT_SECURITY_POLICY,
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "X-Frame-Options": "DENY",
  "Permissions-Policy":
    "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()",
  "Cross-Origin-Opener-Policy": "same-origin",
};

/** Cloudflare Pages' _headers file (https://developers.cloudflare.com/pages/configuration/headers/). */
export function headersFile(): string {
  const all = Object.entries(SECURITY_HEADERS)
    .map(([name, value]) => `  ${name}: ${value}`)
    .join("\n");
  return [
    "# Written by apps/web/build/headers.ts when the app is built.",
    "/*",
    all,
    "",
    "# File names carry a hash of their content, so they never change.",
    "/assets/*",
    "  Cache-Control: public, max-age=31536000, immutable",
    "",
    "/index.html",
    "  Cache-Control: no-cache",
    "",
  ].join("\n");
}

/** Writes _headers into the build, and sends the same headers from `vite preview`, which the browser tests use. */
export function headersPlugin(): Plugin {
  return {
    name: "pagework-headers",
    apply: "build",
    generateBundle() {
      this.emitFile({
        type: "asset",
        fileName: "_headers",
        source: headersFile(),
      });
    },
  };
}
