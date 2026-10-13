/**
 * cell-types.spec.ts – E2E benchmarks measuring how CELL CONTENT TYPE
 * affects table rendering speed.
 *
 * Every grid shape is rendered three times – once per cell type:
 *   a) integer – random integers
 *   b) text    – random word triples (baseline, same as @benchmark)
 *   c) image   – one shared inline data: URI image whose unique #_N fragment
 *                keeps every cell's src distinct (zero network requests, so
 *                measurements reflect framework rendering, not HTTP drain)
 *
 * Three shape sets are covered, each crossed with every cell type:
 *   1. Constant 12,500-cell budget shapes (as in @cellmatrix) – isolates shape
 *   2. Row scaling – 100/500/2,500/12,500 rows (as in @benchmark)
 *   3. Column scaling – static rows, add C columns (matrix as in @colscale;
 *      shapes over MAX_CELLS are skipped, override via BENCH_MAX_CELLS)
 *
 * Tagged @celltypes: npx playwright test --grep @celltypes
 */
import { test, expect, type Page } from "@playwright/test";
import { FRAMEWORKS } from "../helpers/frameworks";
import {
  getCellTypeOrder,
  getGridShapeOrder,
  getRowCountOrder,
  getColumnShapeOrder,
  CELL_BUDGET,
  MAX_CELLS,
  type GridShape,
  type CellType,
} from "../helpers/rowCounts";
import {
  measureDispatchClick,
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
const runId = `celltypes-${new Date().toISOString().replace(/[:.]/g, "-")}`;
let userAgent = "";

const CELL_TYPE_ORDER = getCellTypeOrder("celltypes");
const GRID_SHAPES = getGridShapeOrder("celltypes");
const ROW_COUNTS = getRowCountOrder("celltypes");
const COLUMN_SHAPES = getColumnShapeOrder("celltypes");

function shapeLabel(s: GridShape): string {
  return `${s.rows.toLocaleString()}×${s.cols}`;
}

/** Sanity-check the cell content type on the first typed cell (label column) */
async function expectCellType(page: Page, cellType: CellType): Promise<void> {
  const firstCell = page.locator('[data-testid="bench-table"] tbody tr:first-child td:nth-child(2)');
  if (cellType === "image-png") {
    await expect(firstCell.locator("img.bench-cell-img")).toHaveAttribute("src", /^data:image\/png;base64,.*#_\d+$/);
  } else if (cellType === "integer") {
    await expect(firstCell).toHaveText(/^\d+$/);
  } else if (cellType === "float") {
    await expect(firstCell).toHaveText(/^\d+\.\d+$/);
  }
}

/** First-cell snapshot via innerHTML – image cells have NO text, so toHaveText
 *  can never detect a replace (img src carries the unique ?_N index instead) */
async function readFirstCell(page: Page): Promise<string> {
  return page.evaluate(() => {
    const cell = document.querySelector('[data-testid="bench-table"] tbody tr:first-child td:first-child');
    return cell?.innerHTML ?? "";
  });
}

async function waitForFirstCellChange(page: Page, previous: string, timeout: number): Promise<void> {
  await page.waitForFunction(
    (prev) => {
      const cell = document.querySelector('[data-testid="bench-table"] tbody tr:first-child td:first-child');
      return (cell?.innerHTML ?? "") !== prev;
    },
    previous,
    { timeout },
  );
}

for (const fw of FRAMEWORKS) {
  test.describe(`${fw.name} Cell-Types @celltypes`, () => {
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
      appendSpill("celltypes", entry); // survives worker restarts after a failed test
    }

    for (const cellType of CELL_TYPE_ORDER) {
      for (const shape of GRID_SHAPES) {
        const label = `${shapeLabel(shape)} [${cellType}]`;

        // ── Create rows × cols grid with typed cells ──
        test(`Create ${label} grid`, async () => {
          // Image cells render slowly – use colscale-style timeouts
          test.setTimeout(3_600_000);

          if ((await getRowCount(page)) > 0) {
            await page.getByTestId("bench-clear").dispatchEvent("click");
            await waitForRowCount(page, 0, 300_000);
          }

          // Configure shape + cell type (not part of the measured operation)
          await page.getByTestId("bench-celltype-select").selectOption(cellType);
          await page.getByTestId("bench-rows-input").fill(String(shape.rows));
          await page.getByTestId("bench-cols-input").fill(String(shape.cols));

          const e2e = await measureDispatchClick(page, "bench-create-grid", async (p) => {
            await waitForRowCount(p, shape.rows, 1_800_000);
          });
          const inApp = await readLatestInAppTiming(page);
          await forceGC(page);
          const heap = await getJSHeap(page);
          record(`Create ${label} grid`, e2e, inApp, heap);
          expect(await getRowCount(page)).toBe(shape.rows);
          await expect(page.getByTestId("bench-col-count")).toHaveText(String(shape.cols));
          await expectCellType(page, cellType);
          console.log(`  [${fw.name}] Create ${label}: ${e2e.toFixed(1)}ms (E2E), ${inApp?.toFixed(1) ?? "–"}ms (in-app), ${heap.usedMB}MB heap`);
        });

        // ── Replace all rows (same shape + type, new data) ──
        test(`Replace all rows (${label})`, async () => {
          test.setTimeout(3_600_000);

          expect(await getRowCount(page)).toBeGreaterThan(0); // fail fast if Create failed
          const firstRowBefore = await readFirstCell(page);

          const e2e = await measureDispatchClick(page, "bench-replace", async (p) => {
            await waitForFirstCellChange(p, firstRowBefore, 1_800_000);
          });
          const inApp = await readLatestInAppTiming(page);
          await forceGC(page);
          const heap = await getJSHeap(page);
          record(`Replace all rows (${label})`, e2e, inApp, heap);
          expect(await getRowCount(page)).toBe(shape.rows);
          console.log(`  [${fw.name}] Replace ${label}: ${e2e.toFixed(1)}ms (E2E), ${inApp?.toFixed(1) ?? "–"}ms (in-app), ${heap.usedMB}MB heap`);
        });

        // ── Clear the grid ──
        test(`Clear ${label} grid`, async () => {
          test.setTimeout(3_600_000);

          const e2e = await measureDispatchClick(page, "bench-clear", async (p) => {
            await waitForRowCount(p, 0, 300_000);
          });
          const inApp = await readLatestInAppTiming(page);
          await forceGC(page);
          const heap = await getJSHeap(page);
          record(`Clear ${label} grid`, e2e, inApp, heap);
          expect(await getRowCount(page)).toBe(0);
          console.log(`  [${fw.name}] Clear ${label}: ${e2e.toFixed(1)}ms (E2E), ${inApp?.toFixed(1) ?? "–"}ms (in-app), ${heap.usedMB}MB heap`);
        });
      }
    }

    /* ── Row scaling per cell type (mirrors @benchmark row counts) ── */
    for (const cellType of CELL_TYPE_ORDER) {
      for (const N of ROW_COUNTS) {
        const label = `${N.toLocaleString()} rows [${cellType}]`;

        test(`Create ${label}`, async () => {
          test.setTimeout(3_600_000);

          if ((await getRowCount(page)) > 0) {
            await page.getByTestId("bench-clear").dispatchEvent("click");
            await waitForRowCount(page, 0, 300_000);
          }

          // Cell-type selection is not part of the measured operation
          await page.getByTestId("bench-celltype-select").selectOption(cellType);

          const e2e = await measureDispatchClick(page, `bench-create-${N}`, async (p) => {
            await waitForRowCount(p, N, 1_800_000);
          });
          const inApp = await readLatestInAppTiming(page);
          await forceGC(page);
          const heap = await getJSHeap(page);
          record(`Create ${label}`, e2e, inApp, heap);
          expect(await getRowCount(page)).toBe(N);
          await expectCellType(page, cellType);
          console.log(`  [${fw.name}] Create ${label}: ${e2e.toFixed(1)}ms (E2E), ${inApp?.toFixed(1) ?? "–"}ms (in-app), ${heap.usedMB}MB heap`);
        });

        test(`Replace all rows (${label})`, async () => {
          test.setTimeout(3_600_000);

          expect(await getRowCount(page)).toBeGreaterThan(0); // fail fast if Create failed
          const firstRowBefore = await readFirstCell(page);

          const e2e = await measureDispatchClick(page, "bench-replace", async (p) => {
            await waitForFirstCellChange(p, firstRowBefore, 1_800_000);
          });
          const inApp = await readLatestInAppTiming(page);
          await forceGC(page);
          const heap = await getJSHeap(page);
          record(`Replace all rows (${label})`, e2e, inApp, heap);
          expect(await getRowCount(page)).toBe(N);
          console.log(`  [${fw.name}] Replace ${label}: ${e2e.toFixed(1)}ms (E2E), ${inApp?.toFixed(1) ?? "–"}ms (in-app), ${heap.usedMB}MB heap`);
        });

        test(`Clear ${label}`, async () => {
          test.setTimeout(3_600_000);

          const e2e = await measureDispatchClick(page, "bench-clear", async (p) => {
            await waitForRowCount(p, 0, 300_000);
          });
          const inApp = await readLatestInAppTiming(page);
          await forceGC(page);
          const heap = await getJSHeap(page);
          record(`Clear ${label}`, e2e, inApp, heap);
          expect(await getRowCount(page)).toBe(0);
          console.log(`  [${fw.name}] Clear ${label}: ${e2e.toFixed(1)}ms (E2E), ${inApp?.toFixed(1) ?? "–"}ms (in-app), ${heap.usedMB}MB heap`);
        });
      }
    }

    /* ── Column scaling per cell type (mirrors @colscale matrix) ── */
    for (const cellType of CELL_TYPE_ORDER) {
      for (const shape of COLUMN_SHAPES) {
        const label = `${shape.cols.toLocaleString()} cols to ${shape.rows.toLocaleString()} rows [${cellType}]`;
        // total cells after adding: rows × (1 label col + added cols)
        const totalCells = shape.rows * (1 + shape.cols);
        const skipMsg = `${totalCells.toLocaleString()} cells exceeds MAX_CELLS (${MAX_CELLS.toLocaleString()})`;

        test(`Add ${label}`, async () => {
          test.skip(totalCells > MAX_CELLS, skipMsg);
          // Huge grids render synchronously – Svelte blocks >10 min on 1.25M cells
          test.setTimeout(5_400_000);

          // ── Setup (not measured): R typed rows with a single label column ──
          if ((await getRowCount(page)) > 0) {
            await page.getByTestId("bench-clear").dispatchEvent("click");
            await waitForRowCount(page, 0, 300_000);
          }
          await page.getByTestId("bench-celltype-select").selectOption(cellType);
          await page.getByTestId("bench-rows-input").fill(String(shape.rows));
          await page.getByTestId("bench-cols-input").fill("1");
          await page.getByTestId("bench-create-grid").dispatchEvent("click");
          await waitForRowCount(page, shape.rows, 300_000);
          await expect(page.getByTestId("bench-col-count")).toHaveText("1");

          // ── Measured: add C typed columns to every row ──
          await page.getByTestId("bench-add-cols-input").fill(String(shape.cols));
          const e2e = await measureDispatchClick(page, "bench-add-cols", async (p) => {
            await expect(p.getByTestId("bench-col-count")).toHaveText(
              String(1 + shape.cols),
              { timeout: 3_600_000 }
            );
          });
          const inApp = await readLatestInAppTiming(page);
          await forceGC(page);
          const heap = await getJSHeap(page);
          record(`Add ${label}`, e2e, inApp, heap);
          expect(await getRowCount(page)).toBe(shape.rows);
          await expectCellType(page, cellType);
          console.log(`  [${fw.name}] Add ${label}: ${e2e.toFixed(1)}ms (E2E), ${inApp?.toFixed(1) ?? "–"}ms (in-app), ${heap.usedMB}MB heap`);
        });

        test(`Replace all rows (${label})`, async () => {
          test.skip(totalCells > MAX_CELLS, skipMsg);
          // Replace ≈ 2× Add work (unmount + remount 1.25M keyed cells)
          test.setTimeout(5_400_000);

          expect(await getRowCount(page)).toBeGreaterThan(0); // fail fast if Add failed
          const firstRowBefore = await readFirstCell(page);

          const e2e = await measureDispatchClick(page, "bench-replace", async (p) => {
            await waitForFirstCellChange(p, firstRowBefore, 3_600_000);
          });
          const inApp = await readLatestInAppTiming(page);
          await forceGC(page);
          const heap = await getJSHeap(page);
          record(`Replace all rows (${label})`, e2e, inApp, heap);
          expect(await getRowCount(page)).toBe(shape.rows);
          console.log(`  [${fw.name}] Replace ${label}: ${e2e.toFixed(1)}ms (E2E), ${inApp?.toFixed(1) ?? "–"}ms (in-app), ${heap.usedMB}MB heap`);
        });

        test(`Clear ${label}`, async () => {
          test.skip(totalCells > MAX_CELLS, skipMsg);
          test.setTimeout(3_600_000);

          const e2e = await measureDispatchClick(page, "bench-clear", async (p) => {
            await waitForRowCount(p, 0, 300_000);
          });
          const inApp = await readLatestInAppTiming(page);
          await forceGC(page);
          const heap = await getJSHeap(page);
          record(`Clear ${label}`, e2e, inApp, heap);
          expect(await getRowCount(page)).toBe(0);
          console.log(`  [${fw.name}] Clear ${label}: ${e2e.toFixed(1)}ms (E2E), ${inApp?.toFixed(1) ?? "–"}ms (in-app), ${heap.usedMB}MB heap`);
        });
      }
    }
  });
}

/* ── Generate report ── */
test.describe("Generate cell-types report @celltypes", () => {
  test("Save JSON report", async () => {
    // Spill file has ALL results, even those lost to worker restarts
    const spilled = collectSpill("celltypes");
    const results = spilled.length > 0 ? spilled : allResults;
    const report: BenchmarkReport = {
      runId,
      timestamp: new Date().toISOString(),
      userAgent,
      results,
    };

    // updateLatest=false: don't overwrite the @benchmark baseline in latest.json
    const jsonPath = saveReport(report, false);

    console.log(`\n✅ Cell-types report saved (budget: ${CELL_BUDGET.toLocaleString()} cells):`);
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
