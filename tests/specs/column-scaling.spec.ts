/**
 * column-scaling.spec.ts – E2E benchmarks for ADDING COLUMNS.
 *
 * Inverse of the row benchmarks: the row count is static
 * (1, 100, 500, 2,500, 12,500) and for each row count we measure adding
 * 1, 100, 500, 2,500 and 12,500 columns to the existing table.
 *
 * Combinations whose total cell count (rows × cols) exceeds MAX_CELLS are
 * skipped – a 12,500×12,500 table (156M cells) cannot be rendered in a DOM.
 * Override the cap with the BENCH_MAX_CELLS env variable.
 *
 * Tagged @colscale: npx playwright test --grep @colscale
 */
import { test, expect, type Page } from "@playwright/test";
import { FRAMEWORKS } from "../helpers/frameworks";
import { getColumnShapeOrder, MAX_CELLS, type GridShape } from "../helpers/rowCounts";
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
  appendSpill,
  collectSpill,
  type BenchmarkResult,
  type BenchmarkReport,
} from "../helpers/results";

const allResults: BenchmarkResult[] = [];
const runId = `colscale-${new Date().toISOString().replace(/[:.]/g, "-")}`;
let userAgent = "";

const COLUMN_SHAPES = getColumnShapeOrder("colscale");

/** "2,500 rows + 500 cols" – used in operation labels */
function shapeLabel(s: GridShape): string {
  return `${s.cols.toLocaleString()} cols to ${s.rows.toLocaleString()} rows`;
}

for (const fw of FRAMEWORKS) {
  test.describe(`${fw.name} Column-Scaling @colscale`, () => {
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

    function record(operation: string, e2eMs: number, inAppMs: number | null, heap?: { usedMB: number; totalMB: number }) {
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
      appendSpill("colscale", entry); // survives worker restarts after a failed test
    }

    for (const shape of COLUMN_SHAPES) {
      const label = shapeLabel(shape);
      // total cells after adding: rows × (1 label col + added cols)
      const totalCells = shape.rows * (1 + shape.cols);

      test(`Add ${label}`, async () => {
        test.skip(
          totalCells > MAX_CELLS,
          `${totalCells.toLocaleString()} cells exceeds MAX_CELLS (${MAX_CELLS.toLocaleString()})`
        );
        // Huge grids render synchronously – Svelte blocks >10 min on 1.25M cells
        test.setTimeout(3_600_000);

        // ── Setup (not measured): R rows with a single label column ──
        if ((await getRowCount(page)) > 0) {
          await page.getByTestId("bench-clear").click({ timeout: 300_000 });
          await waitForRowCount(page, 0);
        }
        await page.getByTestId("bench-rows-input").fill(String(shape.rows));
        await page.getByTestId("bench-cols-input").fill("1");
        await page.getByTestId("bench-create-grid").click();
        await waitForRowCount(page, shape.rows);
        await expect(page.getByTestId("bench-col-count")).toHaveText("1");

        // ── Measured: add C columns to every row ──
        await page.getByTestId("bench-add-cols-input").fill(String(shape.cols));
        const e2e = await measureClick(
          page,
          "bench-add-cols",
          async (p) => {
            await expect(p.getByTestId("bench-col-count")).toHaveText(
              String(1 + shape.cols),
              { timeout: 1_800_000 }
            );
          },
          1_800_000
        );
        const inApp = await readLatestInAppTiming(page);
        await forceGC(page);
        const heap = await getJSHeap(page);
        record(`Add ${label}`, e2e, inApp, heap);
        expect(await getRowCount(page)).toBe(shape.rows);
        console.log(`  [${fw.name}] Add ${label}: ${e2e.toFixed(1)}ms (E2E), ${inApp?.toFixed(1) ?? "–"}ms (in-app), ${heap.usedMB}MB heap`);

        // Cleanup so the next shape starts light
        await page.getByTestId("bench-clear").click({ timeout: 300_000 });
        await waitForRowCount(page, 0);
      });
    }
  });
}

/* ── Generate report ── */
test.describe("Generate column-scaling report @colscale", () => {
  test("Save JSON report", async () => {
    // Spill file has ALL results, even those lost to worker restarts
    const spilled = collectSpill("colscale");
    const results = spilled.length > 0 ? spilled : allResults;
    const report: BenchmarkReport = {
      runId,
      timestamp: new Date().toISOString(),
      userAgent,
      results,
    };

    // updateLatest=false: don't overwrite the @benchmark baseline in latest.json
    const jsonPath = saveReport(report, false);

    console.log(`\n✅ Column-scaling report saved (cap: ${MAX_CELLS.toLocaleString()} cells):`);
    console.log(`   JSON: ${jsonPath}`);

    const operations = [...new Set(results.map((r) => r.operation))];
    for (const op of operations) {
      const line = FRAMEWORKS.map((fw) => {
        const entry = results.find(
          (r) => r.framework === fw.name && r.operation === op
        );
        return `${fw.name}: ${entry ? entry.e2eMs.toFixed(1) : "–"}ms`;
      }).join("  |  ");
      console.log(`   ${op.padEnd(40)} ${line}`);
    }
  });
});
