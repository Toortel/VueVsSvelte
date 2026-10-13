/**
 * grid-ops.spec.ts – E2E benchmarks for POSITIONAL GRID OPERATIONS.
 *
 * On a set of base grids (GRIDOPS_SHAPES) and for every cell type, measures:
 *   - Add N rows / N cols at start | middle | end  (N ∈ GRIDOPS_BATCHES)
 *   - Delete N rows / N cols at start | middle | end
 *   - Edit one whole row / one whole column at start | middle | end
 *   - Update / read a single cell at (pos, pos) for pos ∈ {start, middle, end}
 *   - Sequential edit col (H3 decomposition probe: r single-cell updates,
 *     one render each) vs the batched "Edit col" – small shapes only
 *
 * Feasibility filters:
 *   - adds are skipped when the resulting grid would exceed MAX_CELLS
 *   - row deletes require N < rows; col deletes require N ≤ cols − 2
 *     (the label column plus at least one data column must remain)
 *
 * Tagged @gridops: npx playwright test --grep @gridops
 */
import { test, expect, type Page } from "@playwright/test";
import { FRAMEWORKS } from "../helpers/frameworks";
import {
  GRIDOPS_BATCHES,
  GRIDOPS_IMAGE_BATCHES,
  GRIDOPS_POSITIONS,
  GRIDOPS_EDIT_POSITIONS,
  MAX_CELLS,
  getGridOpsShapeOrder,
  getCellTypeOrder,
  type GridShape,
  type GridOpsPosition,
} from "../helpers/rowCounts";
import {
  measureDispatchClick,
  readLatestInAppTiming,
  getRowCount,
  waitForRowCount,
  getJSHeap,
  forceGC,
  getTimingCount,
  waitForTimingCount,
} from "../helpers/timing";
import {
  saveReport,
  appendSpill,
  collectSpill,
  type BenchmarkResult,
  type BenchmarkReport,
} from "../helpers/results";

const allResults: BenchmarkResult[] = [];
const runId = `gridops-${new Date().toISOString().replace(/[:.]/g, "-")}`;
let userAgent = "";

const CELL_TYPE_ORDER = getCellTypeOrder("gridops");
const SHAPE_ORDER = getGridOpsShapeOrder("gridops");

type OpKind =
  | "add-rows"
  | "del-rows"
  | "add-cols"
  | "del-cols"
  | "edit-row"
  | "edit-col"
  | "update-cell"
  | "read-cell"
  | "edit-col-seq";

interface Op {
  kind: OpKind;
  batch: number | null; // null for edits / cell access
  pos: GridOpsPosition;
}

/** All feasible ops for a base shape (rows × total cols incl. label column). */
function opsFor(shape: GridShape, cellType: string): Op[] {
  const ops: Op[] = [];
  const batches =
    cellType === "image-png" ? GRIDOPS_IMAGE_BATCHES : GRIDOPS_BATCHES;
  for (const pos of GRIDOPS_POSITIONS) {
    for (const n of batches) {
      if ((shape.rows + n) * shape.cols <= MAX_CELLS)
        ops.push({ kind: "add-rows", batch: n, pos });
      if (shape.rows * (shape.cols + n) <= MAX_CELLS)
        ops.push({ kind: "add-cols", batch: n, pos });
      if (n < shape.rows) ops.push({ kind: "del-rows", batch: n, pos });
      if (n <= shape.cols - 2) ops.push({ kind: "del-cols", batch: n, pos });
    }
  }
  for (const pos of GRIDOPS_EDIT_POSITIONS) {
    ops.push({ kind: "edit-row", batch: null, pos });
    ops.push({ kind: "edit-col", batch: null, pos });
    ops.push({ kind: "update-cell", batch: null, pos });
    ops.push({ kind: "read-cell", batch: null, pos });
  }
  // H3 probe is r sequential renders – keep it to the small shapes
  if (shape.rows <= 500 && shape.cols <= 500) {
    ops.push({ kind: "edit-col-seq", batch: null, pos: "middle" });
  }
  return ops;
}

function opLabel(op: Op, shape: GridShape, cellType: string): string {
  const base = `${shape.rows.toLocaleString()}×${shape.cols.toLocaleString()} [${cellType}]`;
  const n = op.batch?.toLocaleString();
  switch (op.kind) {
    case "add-rows":
      return `Add ${n} rows at ${op.pos} (${base})`;
    case "del-rows":
      return `Delete ${n} rows at ${op.pos} (${base})`;
    case "add-cols":
      return `Add ${n} cols at ${op.pos} (${base})`;
    case "del-cols":
      return `Delete ${n} cols at ${op.pos} (${base})`;
    case "edit-row":
      return `Edit row at ${op.pos} (${base})`;
    case "edit-col":
      return `Edit col at ${op.pos} (${base})`;
    case "update-cell":
      return `Update cell at ${op.pos} (${base})`;
    case "read-cell":
      return `Read cell at ${op.pos} (${base})`;
    case "edit-col-seq":
      return `Sequential edit col (${base})`;
  }
}

const OP_BUTTON: Record<OpKind, string> = {
  "add-rows": "bench-add-rows-at",
  "del-rows": "bench-delete-rows-at",
  "add-cols": "bench-add-cols-at",
  "del-cols": "bench-delete-cols-at",
  "edit-row": "bench-edit-row-at",
  "edit-col": "bench-edit-col-at",
  "update-cell": "bench-update-cell",
  "read-cell": "bench-read-cell",
  "edit-col-seq": "bench-edit-col-seq",
};

for (const fw of FRAMEWORKS) {
  test.describe(`${fw.name} Grid-Ops @gridops`, () => {
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
      appendSpill("gridops", entry); // survives worker restarts after a failed test
    }

    for (const cellType of CELL_TYPE_ORDER) {
      for (const shape of SHAPE_ORDER) {
        for (const op of opsFor(shape, cellType)) {
          const label = opLabel(op, shape, cellType);

          test(label, async () => {
            // Image cells render slowly – 30 min cap per test
            test.setTimeout(1_800_000);

            // ── Setup (not measured): base grid with typed cells ──
            // 300s action timeouts: main thread can stay wedged >60s tearing down a 250k-img grid
            if ((await getRowCount(page)) > 0) {
              await page
                .getByTestId("bench-clear")
                .dispatchEvent("click", undefined, { timeout: 300_000 });
              await waitForRowCount(page, 0, 300_000);
            }
            await page
              .getByTestId("bench-celltype-select")
              .selectOption(cellType, { timeout: 300_000 });
            await page
              .getByTestId("bench-rows-input")
              .fill(String(shape.rows), { timeout: 300_000 });
            await page
              .getByTestId("bench-cols-input")
              .fill(String(shape.cols), { timeout: 300_000 });
            await page
              .getByTestId("bench-create-grid")
              .dispatchEvent("click", undefined, { timeout: 300_000 });
            await waitForRowCount(page, shape.rows, 1_800_000);
            await expect(page.getByTestId("bench-col-count")).toHaveText(
              String(shape.cols),
              { timeout: 300_000 },
            );

            // Configure the op (not measured)
            if (op.batch != null) {
              await page
                .getByTestId("bench-ops-count-input")
                .fill(String(op.batch), { timeout: 300_000 });
            }
            await page
              .getByTestId("bench-ops-position")
              .selectOption(op.pos, { timeout: 300_000 });

            // ── Measured ──
            const n = op.batch ?? 0;
            const timingsBefore = await getTimingCount(page);
            const e2e = await measureDispatchClick(
              page,
              OP_BUTTON[op.kind],
              async (p) => {
                switch (op.kind) {
                  case "add-rows":
                    await waitForRowCount(p, shape.rows + n, 1_800_000);
                    break;
                  case "del-rows":
                    await waitForRowCount(p, shape.rows - n, 1_800_000);
                    break;
                  case "add-cols":
                    await expect(p.getByTestId("bench-col-count")).toHaveText(
                      String(shape.cols + n),
                      { timeout: 1_800_000 },
                    );
                    break;
                  case "del-cols":
                    await expect(p.getByTestId("bench-col-count")).toHaveText(
                      String(shape.cols - n),
                      { timeout: 1_800_000 },
                    );
                    break;
                  default:
                    // Edits / cell access / seq change no counts – a new timing entry means done
                    await waitForTimingCount(p, timingsBefore + 1, 1_800_000);
                }
              },
              300_000,
            );
            const inApp = await readLatestInAppTiming(page);
            await forceGC(page);
            const heap = await getJSHeap(page);
            record(label, e2e, inApp, heap);
            console.log(
              `  [${fw.name}] ${label}: ${e2e.toFixed(1)}ms (E2E), ${inApp?.toFixed(1) ?? "–"}ms (in-app), ${heap.usedMB}MB heap`,
            );

            // Cleanup so the next test starts light
            await page
              .getByTestId("bench-clear")
              .dispatchEvent("click", undefined, { timeout: 300_000 });
            await waitForRowCount(page, 0, 300_000);
          });
        }
      }
    }
  });
}

/* ── Generate report ── */
test.describe("Generate grid-ops report @gridops", () => {
  test("Save JSON report", async () => {
    // Spill file has ALL results, even those lost to worker restarts
    const spilled = collectSpill("gridops");
    const results = spilled.length > 0 ? spilled : allResults;
    const report: BenchmarkReport = {
      runId,
      timestamp: new Date().toISOString(),
      userAgent,
      results,
    };

    // updateLatest=false: don't overwrite the @benchmark baseline in latest.json
    const jsonPath = saveReport(report, false);

    console.log(`\n✅ Grid-ops report saved (${results.length} measurements):`);
    console.log(`   JSON: ${jsonPath}`);
  });
});
