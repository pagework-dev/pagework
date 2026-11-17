import { defineConfig, devices } from "@playwright/test";

// ARCHITECTURE.md, Testing: Playwright at 375, 768 and 1280 px wide. Runs
// against the production build, served statically.
const PORT = 4173;

export default defineConfig({
  testDir: "e2e",
  fullyParallel: true,
  forbidOnly: process.env.CI !== undefined,
  reporter: process.env.CI === undefined ? "list" : "github",
  use: {
    baseURL: `http://localhost:${String(PORT)}`,
    trace: "off",
  },
  projects: [
    {
      name: "desktop",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1280, height: 800 },
      },
    },
    {
      name: "tablet",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 768, height: 1024 },
        hasTouch: true,
      },
    },
    {
      name: "phone",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 375, height: 740 },
        hasTouch: true,
      },
    },
  ],
  webServer: {
    command: `vite build && vite preview --port ${String(PORT)} --strictPort`,
    port: PORT,
    reuseExistingServer: process.env.CI === undefined,
  },
});
