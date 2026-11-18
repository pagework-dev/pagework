import { expect, test } from "@playwright/test";

// The deployed app sends a strict content security policy
// (build/headers.ts). The preview server these tests run against sends the
// same headers, so a feature that broke the policy would fail here first.

test("runs under its content security policy without violations", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const w = window as unknown as Record<string, unknown>;
    delete w.showOpenFilePicker;
    delete w.showSaveFilePicker;
    w.violations = [];
    document.addEventListener("securitypolicyviolation", (event) => {
      (w.violations as string[]).push(
        `${event.violatedDirective} ${event.blockedURI}`,
      );
    });
  });
  const response = await page.goto("/");
  expect(response?.headers()["content-security-policy"]).toContain(
    "default-src 'self'",
  );
  await page.keyboard.type("int. lighthouse - night");
  await page.keyboard.press("Enter");
  await page.keyboard.type("The lamp turns.");
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "File" }).click();
  await page.getByRole("menuitem", { name: "Export PDF" }).click();
  await download;
  await page.keyboard.press("Control+p");
  await expect(page.locator('iframe[src^="blob:"]')).toHaveCount(1);
  await page.waitForTimeout(500);
  expect(
    await page.evaluate(
      () => (window as unknown as { violations: string[] }).violations,
    ),
  ).toEqual([]);
});
