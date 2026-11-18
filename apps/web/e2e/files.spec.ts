import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";

const sample = readFileSync(
  new URL("../../../fixtures/sample-script.fountain", import.meta.url),
  "utf8",
);

test.beforeEach(async ({ page }) => {
  // Native file pickers can't be driven by a test; without the File System
  // Access API the app uses a file chooser and downloads, which can.
  await page.addInitScript(() => {
    const w = window as unknown as Record<string, unknown>;
    delete w.showOpenFilePicker;
    delete w.showSaveFilePicker;
  });
  await page.goto("/");
});

async function menu(page: Page, item: string): Promise<void> {
  await page.getByRole("button", { name: "File" }).click();
  await page.getByRole("menuitem", { name: item }).click();
}

async function openFile(page: Page, name: string, text: string): Promise<void> {
  const chooser = page.waitForEvent("filechooser");
  await menu(page, "Open…");
  await (
    await chooser
  ).setFiles({
    name,
    mimeType: "text/plain",
    buffer: Buffer.from(text),
  });
}

const status = (page: Page) =>
  page.getByRole("contentinfo", { name: "Status" });

test("opens a Fountain file, removing typed continuation markers", async ({
  page,
}) => {
  await openFile(
    page,
    "harbour.fountain",
    "INT. HARBOUR - NIGHT\n\nTOM\nI never said when.\n(MORE)\n\nTOM (CONT'D)\nOnly that it turns.\n",
  );
  await expect(page.getByRole("status")).toContainText(
    "Removed 2 continuation markers",
  );
  await expect(page.locator(".cm-content")).not.toContainText("MORE");
  await expect(page.getByRole("banner", { name: "Toolbar" })).toContainText(
    "harbour.fountain",
  );
  await expect(status(page)).toContainText("Changes kept in this browser");
});

test("refuses a file that isn't Fountain, saying what it opens", async ({
  page,
}) => {
  await openFile(page, "script.fdx", "<FinalDraft/>");
  await expect(page.getByRole("alert")).toContainText(
    "Pagework opens .fountain, .spmd and .txt files",
  );
});

test("saves the script as a .fountain download", async ({ page }) => {
  await openFile(page, "harbour.fountain", "INT. HARBOUR - NIGHT\n\nRain.");
  await page.locator(".cm-content").click();
  await page.keyboard.press("Control+End");
  await page.keyboard.type(" Wind.");
  const download = page.waitForEvent("download");
  await page.keyboard.press("Control+s");
  const file = await download;
  expect(file.suggestedFilename()).toBe("harbour.fountain");
  const text = readFileSync(await file.path(), "utf8");
  expect(text).toBe("INT. HARBOUR - NIGHT\n\nRain. Wind.");
  await expect(status(page)).toContainText("Saved");
});

test("exports a PDF, loading the PDF code only then", async ({ page }) => {
  const scripts: string[] = [];
  page.on("request", (r) => {
    if (r.resourceType() === "script") scripts.push(r.url());
  });
  await openFile(page, "low-tide.fountain", sample);
  const before = scripts.length;
  const download = page.waitForEvent("download");
  await menu(page, "Export PDF");
  const file = await download;
  expect(file.suggestedFilename()).toBe("low-tide.pdf");
  const bytes = readFileSync(await file.path());
  expect(bytes.subarray(0, 5).toString()).toBe("%PDF-");
  // The PDF renderer arrived as a separate chunk when exporting.
  expect(scripts.length).toBeGreaterThan(before);
});

test("keeps unsaved work when the tab closes and offers it back", async ({
  page,
}) => {
  await page.keyboard.type("int. lighthouse - night");
  await page.keyboard.press("Enter");
  await page.keyboard.type("The lamp turns.");
  await expect(status(page)).toContainText("Changes kept in this browser");
  await page.waitForTimeout(600);
  await page.reload();
  await expect(
    page.getByRole("region", { name: "Unsaved work" }),
  ).toContainText("wasn’t saved to a file");
  await page.getByRole("button", { name: "Restore script" }).click();
  await expect(page.locator(".cm-content")).toContainText("The lamp turns.");
});

test("keeps what was typed before the browser's storage was ready", async ({
  page,
}) => {
  // Hold back IndexedDB's "open succeeded" for 1.5 s, as a slow device might,
  // and type in the meantime.
  await page.addInitScript(() => {
    const open = indexedDB.open.bind(indexedDB);
    indexedDB.open = (name: string, version?: number) => {
      const request = open(name, version);
      Object.defineProperty(request, "onsuccess", {
        set(handler: (event: Event) => void) {
          request.addEventListener("success", (event) => {
            setTimeout(() => {
              handler(event);
            }, 1500);
          });
        },
      });
      return request;
    };
  });
  await page.reload();
  await page.keyboard.type("int. lighthouse - night");
  await page.waitForTimeout(2500);
  await page.reload();
  await expect(page.getByRole("region", { name: "Unsaved work" })).toBeVisible({
    timeout: 8000,
  });
  await page.getByRole("button", { name: "Restore script" }).click();
  await expect(page.locator(".cm-content")).toContainText("lighthouse");
});

test("asks before replacing unsaved changes with a new script", async ({
  page,
}) => {
  await page.keyboard.type("int. lighthouse - night");
  await menu(page, "New script");
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText(
    "Save the changes to “Untitled script” first?",
  );
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(page.locator(".cm-content")).toContainText("lighthouse");
  await menu(page, "New script");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Don’t save" })
    .click();
  await expect(page.locator(".cm-content")).not.toContainText("lighthouse");
});

test("prints the PDF rather than the screen", async ({ page }) => {
  await page.keyboard.type("int. lighthouse - night");
  await page.keyboard.press("Control+p");
  await expect(page.locator('iframe[src^="blob:"]')).toHaveCount(1);
  await expect(page.getByRole("alert")).toHaveCount(0);
});
