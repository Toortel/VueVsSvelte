/**
 * timing.ts – Playwright helpers for measuring operations.
 *
 * Two measurement strategies (both taken for every operation):
 *
 * 1. **E2E timing** (e2e_ms) – measured by the TEST, wall-clock from click →
 *    DOM completion signal. t0/t1 are performance.now() taken INSIDE the
 *    browser (page.evaluate) so the start/end edges use the browser clock.
 *    Includes event dispatch, framework work, DOM patching AND the detection
 *    overhead of the waitFor (polling + evaluate round-trips). This is the
 *    user-perceived latency.
 *
 * 2. **In-app timing** (in_app_ms) – measured by the APP itself: its timed()
 *    helper does t0 → state mutation → await nextTick()/tick() → t1, i.e.
 *    pure framework reactivity + DOM patch, no Playwright, no paint. The app
 *    renders it into the bench-timings table and readLatestInAppTiming()
 *    scrapes the last row.
 *
 * Invariant: e2e_ms ≥ in_app_ms; the gap is harness + detection + paint.
 */
import { type Page, expect } from "@playwright/test";

/* ────────────────────────────────────────────────────────
   E2E timing: click a button → wait for DOM condition
   ──────────────────────────────────────────────────────── */

export interface TimingEntry {
  framework: string;
  operation: string;
  e2eMs: number;         // Playwright wall-clock
  inAppMs: number | null; // in-app measurement (from the UI)
}

/**
 * Click a benchmark button and measure how long until a DOM condition is met.
 *
 * @param page        Playwright Page
 * @param buttonTestId  data-testid of the button to click
 * @param waitFor     async fn that resolves when the operation is "done"
 *                    (e.g. row count changes, table appears/disappears)
 * @param clickTimeout  optional click timeout (ms) – heavy synchronous renders
 *                    block the main thread, so the click can't be confirmed
 *                    until the render finishes; raise this above actionTimeout
 */
export async function measureClick(
  page: Page,
  buttonTestId: string,
  waitFor: (page: Page) => Promise<void>,
  clickTimeout?: number,
): Promise<number> {
  const t0 = await page.evaluate(() => performance.now());
  await page.getByTestId(buttonTestId).click({ timeout: clickTimeout });
  await waitFor(page);
  const t1 = await page.evaluate(() => performance.now());
  return t1 - t0;
}

/**
 * Like measureClick, but dispatches the click event directly instead of using
 * Playwright's click() machinery. Required when the measured operation spawns
 * thousands of subresource requests (e.g. image cells): click() wedges on its
 * post-action "waiting for scheduled navigations" barrier until every request
 * settles, which can take longer than any sane timeout.
 */
export async function measureDispatchClick(
  page: Page,
  buttonTestId: string,
  waitFor: (page: Page) => Promise<void>,
  dispatchTimeout?: number, // main thread may be wedged decoding images from setup
): Promise<number> {
  const t0 = await page.evaluate(() => performance.now());
  await page.getByTestId(buttonTestId).dispatchEvent("click", undefined, { timeout: dispatchTimeout });
  await waitFor(page);
  const t1 = await page.evaluate(() => performance.now());
  return t1 - t0;
}

/* ────────────────────────────────────────────────────────
   Read the in-app timing table
   ──────────────────────────────────────────────────────── */

/**
 * Read the latest timing entry from the in-app bench-timings table.
 * Returns the durationMs number, or null if not available.
 */
export async function readLatestInAppTiming(page: Page): Promise<number | null> {
  try {
    // Wait a moment for the timing to be rendered
    await page.waitForSelector('[data-testid="bench-timings"] tbody tr', {
      timeout: 5_000,
    });
    // Get the last row's timing value
    const value = await page.evaluate(() => {
      const rows = document.querySelectorAll(
        '[data-testid="bench-timings"] tbody tr'
      );
      if (rows.length === 0) return null;
      const lastRow = rows[rows.length - 1];
      const cell = lastRow.querySelector(".timing-value");
      if (!cell) return null;
      return parseFloat(cell.textContent || "0");
    });
    return value;
  } catch {
    return null;
  }
}

/* ────────────────────────────────────────────────────────
   Row-count helpers
   ──────────────────────────────────────────────────────── */

export async function getRowCount(page: Page): Promise<number> {
  const text = await page.getByTestId("bench-row-count").textContent();
  return parseInt(text || "0", 10);
}

export async function waitForRowCount(
  page: Page,
  expected: number,
  timeout = 30_000,
): Promise<void> {
  await expect(page.getByTestId("bench-row-count"))
    .toHaveText(String(expected), { timeout });
}

export async function waitForRowCountToChange(
  page: Page,
  previousCount: number,
  timeout = 30_000,
): Promise<void> {
  await expect(page.getByTestId("bench-row-count"))
    .not.toHaveText(String(previousCount), { timeout });
}

/* ────────────────────────────────────────────────────────
   In-app timing-log row count – completion signal for ops
   that change neither the row nor the column count (edits)
   ──────────────────────────────────────────────────────── */

export async function getTimingCount(page: Page): Promise<number> {
  return page.evaluate(
    () => document.querySelectorAll('[data-testid="bench-timings"] tbody tr').length
  );
}

/** Timing entries are appended after the op's render tick, so a new entry means the op is done. */
export async function waitForTimingCount(
  page: Page,
  expected: number,
  timeout = 30_000,
): Promise<void> {
  await page.waitForFunction(
    (exp) => document.querySelectorAll('[data-testid="bench-timings"] tbody tr').length >= exp,
    expected,
    { timeout },
  );
}

/* ────────────────────────────────────────────────────────
   JS heap memory (same approach as the @memory suite)
   ──────────────────────────────────────────────────────── */

export interface HeapSnapshot {
  usedMB: number;
  totalMB: number;
}

/** Read the current JS heap usage (requires --enable-precise-memory-info). */
export async function getJSHeap(page: Page): Promise<HeapSnapshot> {
  return page.evaluate(() => {
    const mem = (performance as any).memory;
    if (!mem) return { usedMB: 0, totalMB: 0 };
    return {
      usedMB: Math.round(mem.usedJSHeapSize / 1024 / 1024 * 100) / 100,
      totalMB: Math.round(mem.totalJSHeapSize / 1024 / 1024 * 100) / 100,
    };
  });
}

/** Force GC (requires --js-flags=--expose-gc) so heap snapshots exclude garbage from previous ops. */
export async function forceGC(page: Page): Promise<void> {
  await page.evaluate(() => {
    if (typeof (globalThis as any).gc === "function") {
      (globalThis as any).gc();
      (globalThis as any).gc();
      (globalThis as any).gc();
    }
  });
  await page.waitForTimeout(300);
}

/* ────────────────────────────────────────────────────────
   Chart benchmark helpers
   ──────────────────────────────────────────────────────── */

export async function getChartBarCount(page: Page): Promise<number> {
  const text = await page.getByTestId("chart-bar-count").textContent();
  return parseInt(text || "0", 10);
}

export async function getChartScatterCount(page: Page): Promise<number> {
  const text = await page.getByTestId("chart-scatter-count").textContent();
  return parseInt(text || "0", 10);
}

export async function getChartLineCount(page: Page): Promise<number> {
  const text = await page.getByTestId("chart-line-count").textContent();
  return parseInt(text || "0", 10);
}

export async function waitForChartBarCount(
  page: Page,
  expected: number,
  timeout = 30_000,
): Promise<void> {
  await expect(page.getByTestId("chart-bar-count"))
    .toHaveText(String(expected), { timeout });
}

export async function waitForChartScatterCount(
  page: Page,
  expected: number,
  timeout = 30_000,
): Promise<void> {
  await expect(page.getByTestId("chart-scatter-count"))
    .toHaveText(String(expected), { timeout });
}

export async function waitForChartLineCount(
  page: Page,
  expected: number,
  timeout = 30_000,
): Promise<void> {
  await expect(page.getByTestId("chart-line-count"))
    .toHaveText(String(expected), { timeout });
}

/** Read the latest chart timing entry from the in-app chart-timings table */
export async function readLatestChartTiming(page: Page): Promise<number | null> {
  try {
    await page.waitForSelector('[data-testid="chart-timings"] tbody tr', {
      timeout: 5_000,
    });
    const value = await page.evaluate(() => {
      const rows = document.querySelectorAll(
        '[data-testid="chart-timings"] tbody tr'
      );
      if (rows.length === 0) return null;
      const lastRow = rows[rows.length - 1];
      const cell = lastRow.querySelector(".timing-value");
      if (!cell) return null;
      return parseFloat(cell.textContent || "0");
    });
    return value;
  } catch {
    return null;
  }
}
