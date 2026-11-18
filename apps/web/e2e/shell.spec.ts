import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  // CLAUDE.md: no third-party requests. Fail on any request to another origin.
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.protocol !== "data:" && url.hostname !== "localhost")
      throw new Error(`Request to another origin: ${request.url()}`);
  });
  await page.goto("/");
});

test("opens on an empty page with the cursor on it", async ({ page }) => {
  await expect(page.getByRole("textbox", { name: "Script" })).toBeFocused();
  await expect(page.getByRole("contentinfo", { name: "Status" })).toContainText(
    "Page 1 of 1",
  );
});

test("lists scene headings in the navigator as they are written", async ({
  page,
}) => {
  // Enter after action, then Enter on the empty line, gives a scene heading.
  await page.keyboard.type(
    "INT. HARBOUR OFFICE - NIGHT\nRain.\n\nEXT. SEA WALL - DAY\nWind.",
  );
  const width = page.viewportSize()?.width ?? 0;
  if (width < 900) await page.getByRole("button", { name: "Scenes" }).click();
  const navigator = page.getByRole("navigation", { name: "Scenes" });
  await expect(navigator.getByRole("button")).toContainText([
    "INT. HARBOUR OFFICE - NIGHT",
    "EXT. SEA WALL - DAY",
  ]);
  await navigator.getByRole("button", { name: /HARBOUR/ }).click();
  await expect(page.getByRole("contentinfo", { name: "Status" })).toContainText(
    "Scene 1",
  );
});

test("shows the empty navigator in words", async ({ page }) => {
  const width = page.viewportSize()?.width ?? 0;
  if (width < 900) await page.getByRole("button", { name: "Scenes" }).click();
  await expect(page.getByRole("navigation", { name: "Scenes" })).toContainText(
    "No scenes yet.",
  );
});
