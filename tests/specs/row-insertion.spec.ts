/**
 * row-insertion.spec.ts – E2E benchmarks measuring how the INSERTION
 * POSITION affects the cost of adding rows to a table that already has rows.
 *
 * For every base row count (100, 500, 2,500, 12,500) the table is rebuilt,
 * then 1 row and 1,000 rows are inserted:
 *   - at the beginning (prepend)
 *   - somewhere in the middle (index = length / 2)
 *   - at the end (append)
 *
 * Keyed-list diffing makes these positions behave very differently, which is
 * exactly what this suite isolates.
 *
 * Tagged @rowinsert: npx playwright test --grep @rowinsert
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
  appendSpill,
  collectSpill,
  type BenchmarkResult,
  type BenchmarkReport,
} from "../helpers/results";

const allResults: BenchmarkResult[] = [];
const runId = `rowinsert-${new Date().toISOString().replace(/[:.]/g, "-")}`;
let userAgent = "";

const ROW_COUNTS = getRowCountOrder("rowinsert");

interface InsertScenario {
  position: string;
  /** data-testid of the button for a given batch size */
  btn: Record<number, string>;
}

const SCENARIOS: InsertScenario[] = [
  { position: "beginning", btn: { 1: "bench-prepend-1", 1000: "bench-prepend-1k" } },
  { position: "middle", btn: { 1: "bench-insert-mid-1", 1000: "bench-insert-mid-1k" } },
  { position: "end", btn: { 1: "bench-append-1", 1000: "bench-append-1k" } },
];

const BATCH_SIZES = [1, 1000];

for (const fw of FRAMEWORKS) {
  test.describe(`${fw.name} Row-Insertion @rowinsert`, () => {
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
      appendSpill("rowinsert", entry); // survives worker restarts after a failed test
    }

    /** Rebuild the table to exactly N rows (not measured) */
    async function resetToRows(n: number): Promise<void> {
      if ((await getRowCount(page)) > 0) {
        await page.getByTestId("bench-clear").click();
        await waitForRowCount(page, 0);
      }
      await page.getByTestId(`bench-create-${n}`).click();
      await waitForRowCount(page, n);
    }

    for (const N of ROW_COUNTS) {
      const label = N.toLocaleString();

      for (const scenario of SCENARIOS) {
        for (const batch of BATCH_SIZES) {
          const opLabel = `Insert ${batch.toLocaleString()} row${batch > 1 ? "s" : ""} at ${scenario.position} of ${label}`;

          test(opLabel, async () => {
            // Table must already contain exactly N rows before inserting
            await resetToRows(N);

            const e2e = await measureClick(page, scenario.btn[batch], async (p) => {
              await waitForRowCount(p, N + batch);
            });
            const inApp = await readLatestInAppTiming(page);
            await forceGC(page);
            const heap = await getJSHeap(page);
            record(opLabel, e2e, inApp, heap);
            expect(await getRowCount(page)).toBe(N + batch);
            console.log(`  [${fw.name}] ${opLabel}: ${e2e.toFixed(1)}ms (E2E), ${inApp?.toFixed(1) ?? "–"}ms (in-app), ${heap.usedMB}MB heap`);
          });
        }
      }
    }
  });
}

/* ── Generate report ── */
test.describe("Generate row-insertion report @rowinsert", () => {
  test("Save JSON report", async () => {
    // Spill file has ALL results, even those lost to worker restarts
    const spilled = collectSpill("rowinsert");
    const results = spilled.length > 0 ? spilled : allResults;
    const report: BenchmarkReport = {
      runId,
      timestamp: new Date().toISOString(),
      userAgent,
      results,
    };

    // updateLatest=false: don't overwrite the @benchmark baseline in latest.json
    const jsonPath = saveReport(report, false);

    console.log(`\n✅ Row-insertion report saved:`);
    console.log(`   JSON: ${jsonPath}`);

    const operations = [...new Set(results.map((r) => r.operation))];
    for (const op of operations) {
      const line = FRAMEWORKS.map((fw) => {
        const entry = results.find(
          (r) => r.framework === fw.name && r.operation === op
        );
        return `${fw.name}: ${entry ? entry.e2eMs.toFixed(1) : "–"}ms`;
      }).join("  |  ");
      console.log(`   ${op.padEnd(45)} ${line}`);
    }
  });
});
