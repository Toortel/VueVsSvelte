/**
 * benchmark.spec.ts – E2E performance benchmarks for Vue / Svelte.
 *
 * Measures add, delete, and update operations at four row scales:
 *
 * , 2,500, and 12,500.
 *
 * Tagged @benchmark so you can run: npx playwright test --grep @benchmark
 */
import { test, expect, type Page } from "@playwright/test";
import { FRAMEWORKS } from "../helpers/frameworks";
import { getRowCountOrder } from "../helpers/rowCounts";
import {
  measureClick,
  readLatestInAppTiming,
  getRowCount,
  waitForRowCount,
  getJSHeap,
  forceGC,
} from "../helpers/timing";
import {
  saveReport,
  generateHtmlReport,
  generateExcelReport,
  appendSpill,
  collectSpill,
  type BenchmarkResult,
  type BenchmarkReport,
} from "../helpers/results";

const allResults: BenchmarkResult[] = [];
const runId = `bench-${new Date().toISOString().replace(/[:.]/g, "-")}`;
let userAgent = "";

const ROW_COUNTS = getRowCountOrder("benchmark");

for (const fw of FRAMEWORKS) {
  test.describe(`${fw.name} Benchmark @benchmark`, () => {
    let page: Page;

    test.beforeAll(async ({ browser }) => {
      page = await browser.newPage();
      userAgent = await page.evaluate(() => navigator.userAgent);
      await page.goto(`${fw.baseUrl}${fw.benchmarkPath}`, {
        waitUntil: "networkidle",
      });
      await expect(page.getByTestId("bench-controls")).toBeVisible();
    });

    test.afterAll(async () => {
      await page.close();
    });

    function record(
      operation: string,
      e2eMs: number,
      inAppMs: number | null,
      heap?: { usedMB: number; totalMB: number },
    ) {
      const entry: BenchmarkResult = {
        framework: fw.name,
        operation,
        e2eMs,
        inAppMs,
        usedJSHeapMB: heap?.usedMB ?? null,
        totalJSHeapMB: heap?.totalMB ?? null,
        timestamp: new Date().toISOString(),
      };
      allResults.push(entry);
      appendSpill("benchmark", entry); // survives worker restarts after a failed test
    }

    for (const N of ROW_COUNTS) {
      const label = N.toLocaleString();
      const btnId = `bench-create-${N}`;

      // ── Add N rows ──
      test(`Add ${label} rows`, async () => {
        // Ensure we start from a clean state
        if ((await getRowCount(page)) > 0) {
          await page.getByTestId("bench-clear").click();
          await waitForRowCount(page, 0);
        }

        const e2e = await measureClick(page, btnId, async (p) => {
          await waitForRowCount(p, N);
        });
        const inApp = await readLatestInAppTiming(page);
        await forceGC(page);
        const heap = await getJSHeap(page);
        record(`Add ${label} rows`, e2e, inApp, heap);
        expect(await getRowCount(page)).toBe(N);
        console.log(
          `  [${fw.name}] Add ${label}: ${e2e.toFixed(1)}ms (E2E), ${inApp?.toFixed(1) ?? "–"}ms (in-app), ${heap.usedMB}MB heap`,
        );
      });

      // ── Update N rows (every 10th) ──
      test(`Update ${label} rows`, async () => {
        const firstRowBefore = await page.evaluate(() => {
          const row = document.querySelector(
            '[data-testid="bench-table"] tbody tr td:nth-child(2)',
          );
          return row?.textContent ?? "";
        });

        const e2e = await measureClick(page, "bench-update-10th", async (p) => {
          await expect(
            p.locator(
              '[data-testid="bench-table"] tbody tr:first-child td:nth-child(2)',
            ),
          ).not.toHaveText(firstRowBefore, { timeout: 30_000 });
        });
        const inApp = await readLatestInAppTiming(page);
        await forceGC(page);
        const heap = await getJSHeap(page);
        record(`Update ${label} rows`, e2e, inApp, heap);
        console.log(
          `  [${fw.name}] Update ${label}: ${e2e.toFixed(1)}ms (E2E), ${inApp?.toFixed(1) ?? "–"}ms (in-app), ${heap.usedMB}MB heap`,
        );
      });

      // ── Update all N rows (every row) ──
      test(`Update all ${label} rows`, async () => {
        const firstRowBefore = await page.evaluate(() => {
          const row = document.querySelector(
            '[data-testid="bench-table"] tbody tr td:nth-child(2)',
          );
          return row?.textContent ?? "";
        });

        const e2e = await measureClick(page, "bench-update-all", async (p) => {
          await expect(
            p.locator(
              '[data-testid="bench-table"] tbody tr:first-child td:nth-child(2)',
            ),
          ).not.toHaveText(firstRowBefore, { timeout: 30_000 });
        });
        const inApp = await readLatestInAppTiming(page);
        await forceGC(page);
        const heap = await getJSHeap(page);
        record(`Update all ${label} rows`, e2e, inApp, heap);
        console.log(
          `  [${fw.name}] Update all ${label}: ${e2e.toFixed(1)}ms (E2E), ${inApp?.toFixed(1) ?? "–"}ms (in-app), ${heap.usedMB}MB heap`,
        );
      });

      // ── Edit 1 row in N ──
      test(`Edit 1 row in ${label}`, async () => {
        const firstRowBefore = await page.evaluate(() => {
          const row = document.querySelector(
            '[data-testid="bench-table"] tbody tr td:nth-child(2)',
          );
          return row?.textContent ?? "";
        });

        const e2e = await measureClick(
          page,
          "bench-update-first",
          async (p) => {
            await expect(
              p.locator(
                '[data-testid="bench-table"] tbody tr:first-child td:nth-child(2)',
              ),
            ).not.toHaveText(firstRowBefore, { timeout: 30_000 });
          },
        );
        const inApp = await readLatestInAppTiming(page);
        await forceGC(page);
        const heap = await getJSHeap(page);
        record(`Edit 1 row in ${label}`, e2e, inApp, heap);
        console.log(
          `  [${fw.name}] Edit 1 in ${label}: ${e2e.toFixed(1)}ms (E2E), ${inApp?.toFixed(1) ?? "–"}ms (in-app), ${heap.usedMB}MB heap`,
        );
      });

      // ── Delete 1 row from N ──
      test(`Delete 1 row from ${label}`, async () => {
        const countBefore = await getRowCount(page);
        const e2e = await measureClick(
          page,
          "bench-delete-first",
          async (p) => {
            await waitForRowCount(p, countBefore - 1);
          },
        );
        const inApp = await readLatestInAppTiming(page);
        await forceGC(page);
        const heap = await getJSHeap(page);
        record(`Delete 1 row from ${label}`, e2e, inApp, heap);
        expect(await getRowCount(page)).toBe(countBefore - 1);
        console.log(
          `  [${fw.name}] Delete 1 from ${label}: ${e2e.toFixed(1)}ms (E2E), ${inApp?.toFixed(1) ?? "–"}ms (in-app), ${heap.usedMB}MB heap`,
        );
      });

      // ── Add 1 row to N (restores N-1 → N) ──
      test(`Add 1 row to ${label}`, async () => {
        const countBefore = await getRowCount(page);
        const e2e = await measureClick(page, "bench-append-1", async (p) => {
          await waitForRowCount(p, countBefore + 1);
        });
        const inApp = await readLatestInAppTiming(page);
        await forceGC(page);
        const heap = await getJSHeap(page);
        record(`Add 1 row to ${label}`, e2e, inApp, heap);
        expect(await getRowCount(page)).toBe(countBefore + 1);
        console.log(
          `  [${fw.name}] Add 1 to ${label}: ${e2e.toFixed(1)}ms (E2E), ${inApp?.toFixed(1) ?? "–"}ms (in-app), ${heap.usedMB}MB heap`,
        );
      });

      // ── Delete N rows (clear) ──
      test(`Delete ${label} rows`, async () => {
        const e2e = await measureClick(page, "bench-clear", async (p) => {
          await waitForRowCount(p, 0);
        });
        const inApp = await readLatestInAppTiming(page);
        await forceGC(page);
        const heap = await getJSHeap(page);
        record(`Delete ${label} rows`, e2e, inApp, heap);
        expect(await getRowCount(page)).toBe(0);
        console.log(
          `  [${fw.name}] Delete ${label}: ${e2e.toFixed(1)}ms (E2E), ${inApp?.toFixed(1) ?? "–"}ms (in-app), ${heap.usedMB}MB heap`,
        );
      });
    }
  });
}

/* ── Generate report ── */
test.describe("Generate comparison report @benchmark", () => {
  test("Save JSON + HTML report", async () => {
    // Spill file has ALL results, even those lost to worker restarts
    const spilled = collectSpill("benchmark");
    const results = spilled.length > 0 ? spilled : allResults;
    const report: BenchmarkReport = {
      runId,
      timestamp: new Date().toISOString(),
      userAgent,
      results,
    };

    const jsonPath = saveReport(report);
    const htmlPath = generateHtmlReport(report);
    const xlsxPath = await generateExcelReport(report);

    console.log(`\n✅ Benchmark report saved:`);
    console.log(`   JSON:  ${jsonPath}`);
    console.log(`   HTML:  ${htmlPath}`);
    console.log(`   Excel: ${xlsxPath}`);

    const operations = [...new Set(results.map((r) => r.operation))];
    for (const op of operations) {
      const line = FRAMEWORKS.map((fw) => {
        const entry = results.find(
          (r) => r.framework === fw.name && r.operation === op,
        );
        return `${fw.name}: ${entry ? entry.e2eMs.toFixed(1) : "–"}ms`;
      }).join("  |  ");
      console.log(`   ${op.padEnd(30)} ${line}`);
    }
  });
});
