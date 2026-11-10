import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: ["packages/*"],
    // Packages are empty until the first feature lands.
    passWithNoTests: true,
  },
});
