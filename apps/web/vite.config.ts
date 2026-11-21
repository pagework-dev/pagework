import { svelte } from "@sveltejs/vite-plugin-svelte";
import { defineConfig } from "vitest/config";
import { headersPlugin, SECURITY_HEADERS } from "./build/headers.ts";
import { templatesPlugin } from "./build/templates.ts";

export default defineConfig({
  plugins: [svelte(), templatesPlugin(), headersPlugin()],
  // The browser tests run against the preview server, so they run under the
  // same security headers as the deployed app.
  preview: { headers: SECURITY_HEADERS },
  // `PAGEWORK_API=http://localhost:3000 pnpm dev` works against a running
  // server; without it, the dev app works without an account.
  ...(process.env.PAGEWORK_API === undefined
    ? {}
    : { server: { proxy: { "/api": process.env.PAGEWORK_API } } }),
  build: {
    // Static files only; the app runs from any web server or file host.
    outDir: "dist",
    target: "es2022",
    assetsInlineLimit: 0,
  },
  test: {
    name: "@pagework/web",
    include: ["test/**/*.test.ts"],
    // Tests read stylesheets as text (contrast and token checks).
    css: true,
  },
});
