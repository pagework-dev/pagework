import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { generateScript } from "../../../packages/fountain/test/generate.ts";

// ARCHITECTURE.md, Performance budgets: measured with Chromium's CPU
// throttled 4×, a stand-in for a low-end Chromebook, on a 120-page script
// (packages/fountain/test/generate.ts: 119 script pages and a title page on
// US Letter). Run with `pnpm perf`; CI runs it as its own job.

const script = generateScript(120);
const THROTTLE = 4;

async function throttle(page: Page): Promise<void> {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: THROTTLE });
}

/** Opens the script through File › Open… and returns the time until its first page shows. */
async function openScript(page: Page): Promise<number> {
  await page.addInitScript(() => {
    const w = window as unknown as Record<string, unknown>;
    delete w.showOpenFilePicker;
    delete w.showSaveFilePicker;
  });
  await page.goto("/");
  await throttle(page);
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "File" }).click();
  await page.getByRole("menuitem", { name: "Open…" }).click();
  const start = Date.now();
  await (
    await chooser
  ).setFiles({
    name: "long-tide.fountain",
    mimeType: "text/plain",
    buffer: Buffer.from(script),
  });
  await expect(page.locator(".cm-content")).toContainText("The Long Tide");
  return Date.now() - start;
}

test("opens a 120-page script and shows the first page in under 1 s", async ({
  page,
}) => {
  const elapsed = await openScript(page);
  console.log(`open: ${String(elapsed)} ms`);
  expect(elapsed).toBeLessThan(1000);
});

test("re-paginates 120 pages in under 150 ms, after typing pauses", async ({
  page,
}) => {
  await openScript(page);
  await expect
    .poll(() =>
      page.evaluate(
        () => performance.getEntriesByName("pagework:paginate").length,
      ),
    )
    .toBeGreaterThan(1);
  const durations = await page.evaluate(() =>
    performance.getEntriesByName("pagework:paginate").map((e) => e.duration),
  );
  console.log(`paginate: ${durations.map((d) => d.toFixed(1)).join(", ")} ms`);
  expect(Math.max(...durations)).toBeLessThan(150);
});

// Work the main thread does for a keystroke: event handlers, the editor's
// update, then style, layout and paint. Read from a Chromium trace as the
// outermost of these events between one keydown and the next. Time spent
// waiting for the next frame isn't work and isn't counted; neither is the
// test's own input injection.
const WORK = new Set([
  "EventDispatch",
  "FireAnimationFrame",
  "FunctionCall",
  "TimerFire",
  "UpdateLayoutTree",
  "Layout",
  "PrePaint",
  "Paint",
  "Layerize",
  "Commit",
  "MinorGC",
  "MajorGC",
  "HitTest",
]);

interface TraceEvent {
  name: string;
  ph: string;
  ts: number;
  dur?: number;
  pid: number;
  tid: number;
  args?: { name?: string; data?: { type?: string } };
}

function keystrokeWork(events: TraceEvent[]): number[] {
  const main = events.find(
    (e) => e.name === "thread_name" && e.args?.name === "CrRendererMain",
  );
  if (main === undefined) throw new Error("no renderer main thread in trace");
  const onMain = (e: TraceEvent): boolean =>
    e.pid === main.pid && e.tid === main.tid;
  const work = events
    .filter((e) => e.ph === "X" && WORK.has(e.name) && onMain(e))
    .sort((a, b) => a.ts - b.ts);
  const outer: TraceEvent[] = [];
  let end = -1;
  for (const e of work) {
    if (e.ts >= end) {
      outer.push(e);
      end = e.ts + (e.dur ?? 0);
    }
  }
  const keydowns = events
    .filter(
      (e) =>
        e.name === "EventDispatch" &&
        e.args?.data?.type === "keydown" &&
        onMain(e),
    )
    .map((e) => e.ts)
    .sort((a, b) => a - b);
  return keydowns.map((ts, i) => {
    const stop = keydowns[i + 1] ?? Infinity;
    const micros = outer
      .filter((e) => e.ts >= ts && e.ts < stop)
      .reduce((n, e) => n + (e.dur ?? 0), 0);
    return micros / 1000;
  });
}

test("does under 16 ms of work per keystroke in the middle of the script", async ({
  page,
  browser,
}, testInfo) => {
  await openScript(page);
  await page.waitForTimeout(800);
  await page.locator("main").evaluate((m) => {
    m.scrollTo(0, m.scrollHeight / 2);
  });
  await page.locator(".pw-dialogue").first().click();
  await page.keyboard.press("End");
  // Warm up, so the measurement isn't of the JIT compiling the editor.
  await page.keyboard.type("and", { delay: 100 });
  await page.waitForTimeout(500);
  const path = testInfo.outputPath("keystrokes.json");
  await browser.startTracing(page, { path, categories: ["devtools.timeline"] });
  for (const ch of " the tide came in, slowly") {
    await page.keyboard.type(ch);
    await page.waitForTimeout(120);
  }
  await browser.stopTracing();
  const trace = JSON.parse(readFileSync(path, "utf8")) as {
    traceEvents: TraceEvent[];
  };
  const work = keystrokeWork(trace.traceEvents).sort((a, b) => a - b);
  const median = work[Math.floor(work.length / 2)] ?? Infinity;
  console.log(
    `keystroke work (ms, sorted): ${work.map((w) => w.toFixed(1)).join(" ")}; median ${median.toFixed(1)}`,
  );
  expect(work.length).toBeGreaterThan(20);
  expect(median).toBeLessThan(16);
});
