/**
 * cell-matrix.spec.ts – E2E benchmarks measuring how table operation speed
 * depends on COLUMN COUNT at a constant total cell budget.
 *
 * Every shape renders exactly CELL_BUDGET (12,500) cells, but distributed
 * differently: 12,500×1, 2,500×5, 1,250×10, 500×25, 250×50 (rows × cols).
 * Since the cell count is constant, timing differences between shapes
 * isolate the cost of wide rows vs. many rows.
 *
 * Tagged @cellmatrix so it runs separately from the existing @benchmark
 * suite: npx playwright test --grep @cellmatrix
 */
import { test, expect, type Page } from "@playwright/test";
import { FRAMEWORKS } from "../helpers/frameworks";
import { getGridShapeOrder, CELL_BUDGET, type GridShape } from "../helpers/rowCounts";
import {
  measureClick,
  readLatestInAppTiming,
  getRowCount,
  waitForRowCount,
} from "../helpers/timing";
import {
  saveReport,
  type BenchmarkResult,
  type BenchmarkReport,
} from "../helpers/results";

const allResults: BenchmarkResult[] = [];
const runId = `cellmatrix-${new Date().toISOString().replace(/[:.]/g, "-")}`;
let userAgent = "";

const GRID_SHAPES = getGridShapeOrder("cellmatrix");

/** "2,500×5" – used in operation labels */
function shapeLabel(s: GridShape): string {
  return `${s.rows.toLocaleString()}×${s.cols}`;
}

for (const fw of FRAMEWORKS) {
  test.describe(`${fw.name} Cell-Matrix @cellmatrix`, () => {
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

    function record(operation: string, e2eMs: number, inAppMs: number | null) {
      allResults.push({
        framework: fw.name,
        operation,
        e2eMs,
        inAppMs,
        timestamp: new Date().toISOString(),
      });
    }

    for (const shape of GRID_SHAPES) {
      const label = shapeLabel(shape);

      // ── Create rows × cols grid (constant cell budget) ──
      test(`Create ${label} grid`, async () => {
        if ((await getRowCount(page)) > 0) {
          await page.getByTestId("bench-clear").click();
          await waitForRowCount(page, 0);
        }

        // Configure the shape (not part of the measured operation)
        await page.getByTestId("bench-rows-input").fill(String(shape.rows));
        await page.getByTestId("bench-cols-input").fill(String(shape.cols));

        const e2e = await measureClick(page, "bench-create-grid", async (p) => {
          await waitForRowCount(p, shape.rows);
        });
        const inApp = await readLatestInAppTiming(page);
        record(`Create ${label} grid`, e2e, inApp);
        expect(await getRowCount(page)).toBe(shape.rows);
        await expect(page.getByTestId("bench-col-count")).toHaveText(String(shape.cols));
        console.log(`  [${fw.name}] Create ${label}: ${e2e.toFixed(1)}ms (E2E), ${inApp?.toFixed(1) ?? "–"}ms (in-app)`);
      });

      // ── Update every 10th row (all cells in the row change) ──
      test(`Update every 10th row (${label})`, async () => {
        const firstRowBefore = await page.evaluate(() => {
          const row = document.querySelector('[data-testid="bench-table"] tbody tr td:nth-child(2)');
          return row?.textContent ?? "";
        });

        const e2e = await measureClick(page, "bench-update-10th", async (p) => {
          await expect(
            p.locator('[data-testid="bench-table"] tbody tr:first-child td:nth-child(2)')
          ).not.toHaveText(firstRowBefore, { timeout: 30_000 });
        });
        const inApp = await readLatestInAppTiming(page);
        record(`Update every 10th row (${label})`, e2e, inApp);
        console.log(`  [${fw.name}] Update 10th ${label}: ${e2e.toFixed(1)}ms (E2E), ${inApp?.toFixed(1) ?? "–"}ms (in-app)`);
      });

      // ── Replace all rows (same shape, new data) ──
      test(`Replace all rows (${label})`, async () => {
        const firstRowBefore = await page.evaluate(() => {
          const row = document.querySelector('[data-testid="bench-table"] tbody tr td:first-child');
          return row?.textContent ?? "";
        });

        const e2e = await measureClick(page, "bench-replace", async (p) => {
          await expect(
            p.locator('[data-testid="bench-table"] tbody tr:first-child td:first-child')
          ).not.toHaveText(firstRowBefore, { timeout: 30_000 });
        });
        const inApp = await readLatestInAppTiming(page);
        record(`Replace all rows (${label})`, e2e, inApp);
        expect(await getRowCount(page)).toBe(shape.rows);
        console.log(`  [${fw.name}] Replace ${label}: ${e2e.toFixed(1)}ms (E2E), ${inApp?.toFixed(1) ?? "–"}ms (in-app)`);
      });

      // ── Clear the grid ──
      test(`Clear ${label} grid`, async () => {
        const e2e = await measureClick(page, "bench-clear", async (p) => {
          await waitForRowCount(p, 0);
        });
        const inApp = await readLatestInAppTiming(page);
        record(`Clear ${label} grid`, e2e, inApp);
        expect(await getRowCount(page)).toBe(0);
        console.log(`  [${fw.name}] Clear ${label}: ${e2e.toFixed(1)}ms (E2E), ${inApp?.toFixed(1) ?? "–"}ms (in-app)`);
      });
    }
  });
}

/* ── Generate report ── */
test.describe("Generate cell-matrix report @cellmatrix", () => {
  test("Save JSON report", async () => {
    const report: BenchmarkReport = {
      runId,
      timestamp: new Date().toISOString(),
      userAgent,
      results: allResults,
    };

    // updateLatest=false: don't overwrite the @benchmark baseline in latest.json
    const jsonPath = saveReport(report, false);

    console.log(`\n✅ Cell-matrix report saved (budget: ${CELL_BUDGET.toLocaleString()} cells):`);
    console.log(`   JSON: ${jsonPath}`);

    const operations = [...new Set(allResults.map((r) => r.operation))];
    for (const op of operations) {
      const line = FRAMEWORKS.map((fw) => {
        const entry = allResults.find(
          (r) => r.framework === fw.name && r.operation === op
        );
        return `${fw.name}: ${entry ? entry.e2eMs.toFixed(1) : "–"}ms`;
      }).join("  |  ");
      console.log(`   ${op.padEnd(35)} ${line}`);
    }
  });
});
