import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";

const sample = readFileSync(
  new URL("../../../fixtures/sample-script.fountain", import.meta.url),
  "utf8",
);

async function paste(page: Page, text: string): Promise<void> {
  await page.evaluate((t) => {
    const data = new DataTransfer();
    data.setData("text/plain", t);
    document.querySelector(".cm-content")?.dispatchEvent(
      new ClipboardEvent("paste", {
        clipboardData: data,
        bubbles: true,
        cancelable: true,
      }),
    );
  }, text);
}

/** Each line's element, as the page view styles it. */
async function lineElements(page: Page): Promise<string[]> {
  return page
    .locator(".cm-line")
    .evaluateAll((lines) =>
      lines.map(
        (l) =>
          /pw-([a-z_]+)/.exec(l.getAttribute("class") ?? "")?.[1] ?? "none",
      ),
    );
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
});

test("writes a scene with Enter and Tab only", async ({ page }) => {
  const k = page.keyboard;
  await k.type("int. harbour office - night");
  await k.press("Enter");
  await k.type("Rain needles the window.");
  await k.press("Enter");
  await k.press("Tab");
  await k.type("marguerite");
  await k.press("Enter");
  await k.type("You said six.");
  await expect
    .poll(() => lineElements(page))
    .toEqual(["scene_heading", "action", "character", "dialogue"]);
  // The cue was capitalised as typed; no Fountain markers are visible.
  await expect(page.locator(".cm-content")).toContainText("MARGUERITE");
  await expect(page.locator(".cm-content")).not.toContainText("@");
  await expect(page.getByRole("combobox", { name: "Element" })).toHaveValue(
    "dialogue",
  );
});

test("changes the element with the picker and the keyboard", async ({
  page,
}) => {
  await page.keyboard.type("Rain.");
  await page
    .getByRole("combobox", { name: "Element" })
    .selectOption("transition");
  await expect.poll(() => lineElements(page)).toEqual(["transition"]);
  await page.keyboard.press("Control+Alt+2");
  await expect.poll(() => lineElements(page)).toEqual(["action"]);
});

test("completes a character's name from its initial", async ({ page }) => {
  const k = page.keyboard;
  await k.type("Rain.");
  await k.press("Enter");
  await k.press("Tab");
  await k.type("marguerite");
  await k.press("Enter");
  await k.type("Hi.");
  await k.press("Enter");
  await k.type("m");
  await expect(page.locator(".pw-suggestion")).toHaveText("ARGUERITE");
  await k.press("Enter");
  await expect(page.locator(".cm-line").last()).toHaveText("MARGUERITE");
});

test("shows pages, page numbers and continuation markers like the PDF", async ({
  page,
}) => {
  await paste(page, sample);
  // Phones open in reflow view; pages are drawn in page view.
  await page.getByRole("button", { name: "View" }).click();
  await page.getByRole("menuitemradio", { name: "Page view" }).click();
  const status = page.getByRole("contentinfo", { name: "Status" });
  // The committed sample PDF has four script pages on US Letter, and A4.
  await expect(status).toContainText("of 4");
  // Only pages near the viewport are drawn: scroll through, collecting them.
  const main = page.locator("main");
  const headers = new Set<string>();
  const continued = new Set<string>();
  const height = await main.evaluate((m) => m.scrollHeight);
  for (let y = 0; y <= height; y += 300) {
    await main.evaluate((m, top) => {
      m.scrollTo(0, top);
    }, y);
    await page.waitForTimeout(100);
    for (const text of await page
      .locator(".pw-edge-top .pw-drawn")
      .allTextContents())
      headers.add(text);
    for (const text of await page.locator(".pw-continued").allTextContents())
      continued.add(text);
  }
  expect([...headers].sort()).toEqual(["2.", "3.", "4."]);
  expect([...continued]).toEqual([" (CONT'D)"]);
  const overflow = await page
    .locator("main")
    .evaluate((m) => m.scrollWidth - m.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});
