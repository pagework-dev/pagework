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

async function view(page: Page, item: string): Promise<void> {
  await page.getByRole("button", { name: "View" }).click();
  await page
    .getByRole("menuitemradio", { name: item })
    .or(page.getByRole("menuitemcheckbox", { name: item }))
    .click();
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
});

test("opens phones in reflow view and larger screens in page view", async ({
  page,
}) => {
  const width = page.viewportSize()?.width ?? 0;
  await expect(page.locator(".pw-page")).toHaveClass(
    width < 600 ? /pw-reflow/ : /^(?!.*pw-reflow)/,
  );
});

test("reflow view marks page breaks instead of drawing pages", async ({
  page,
}) => {
  await paste(page, sample);
  await view(page, "Reflow view");
  await expect(page.locator(".pw-page")).toHaveClass(/pw-reflow/);
  await expect(page.locator(".pw-edge-gap")).toHaveCount(0);
  // Only markers near the viewport are drawn. The sample has a title page,
  // so the first marker starts page 1 of the script.
  await page.locator("main").evaluate((m) => m.scrollTo(0, 0));
  await expect(page.locator(".pw-page-marker").first()).toHaveText("Page 1");
  const overflow = await page
    .locator("main")
    .evaluate((m) => m.scrollWidth - m.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  await view(page, "Page view");
  await expect(page.locator(".pw-page-marker")).toHaveCount(0);
});

test("Show Fountain shows the text as it is and edits it as plain text", async ({
  page,
}) => {
  const k = page.keyboard;
  await k.press("Enter");
  await k.press("Tab");
  await k.type("tom");
  await expect(page.locator(".cm-content")).not.toContainText("@");
  await view(page, "Show Fountain");
  await expect(page.locator(".cm-content")).toContainText("@TOM");
  // Plain text: Enter is a new line and markers are left as typed.
  await k.press("Enter");
  await k.type(".x");
  await expect(page.locator(".cm-content")).toContainText(".x");
  await view(page, "Show Fountain");
  await expect(page.locator(".cm-content")).not.toContainText("@TOM");
});

test("spellcheck leaves the script's names and places alone", async ({
  page,
}) => {
  await paste(
    page,
    "INT. KILMURRAY BOATSHED - NIGHT\n\nZEPHYRINE waits.\n\nZEPHYRINE\nHello.\n",
  );
  const content = page.locator(".cm-content");
  await expect(content).toHaveAttribute("spellcheck", "true");
  await expect(
    content.locator('[spellcheck="false"]', { hasText: "ZEPHYRINE" }).first(),
  ).toBeVisible();
  await expect(
    content.locator('[spellcheck="false"]', { hasText: "KILMURRAY" }).first(),
  ).toBeVisible();
});

test.describe("on a touch screen", () => {
  test.use({
    isMobile: true,
    hasTouch: true,
    viewport: { width: 390, height: 760 },
  });

  test("shows the element bar while writing and sets elements from it", async ({
    page,
  }) => {
    await page.locator(".cm-content").click();
    const bar = page.getByRole("toolbar", { name: "Elements" });
    await expect(bar).toBeVisible();
    await page.keyboard.type("Rain.");
    await bar.getByRole("button", { name: "Transition" }).click();
    await expect(
      page.getByRole("contentinfo", { name: "Status" }),
    ).toContainText("Transition");
    await expect(
      bar.getByRole("button", { name: "Transition" }),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator(".cm-content")).toBeFocused();
  });
});
