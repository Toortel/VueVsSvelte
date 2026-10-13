/**
 * chart-benchmark.spec.ts – E2E chart rendering benchmarks for Vue / Svelte.
 *
 * Measures bar, scatter, and line chart rendering at four data scales:
 * 100, 500, 2,500, and 12,500 data points.
 *
 * Tagged @chart-benchmark so you can run:
 *   npx playwright test --grep @chart-benchmark
 */
import { test, expect, type Page } from "@playwright/test";
import { FRAMEWORKS } from "../helpers/frameworks";
import {
  measureClick,
  readLatestChartTiming,
  getChartBarCount,
  getChartScatterCount,
  getChartLineCount,
  waitForChartBarCount,
  waitForChartScatterCount,
  waitForChartLineCount,
} from "../helpers/timing";
import {
  saveReport,
  type BenchmarkResult,
  type BenchmarkReport,
} from "../helpers/results";

const allResults: BenchmarkResult[] = [];
const runId = `chart-benchmark-${new Date().toISOString().replace(/[:.]/g, "-")}`;
let userAgent = "";

const CHART_COUNTS = [100, 500, 2_500, 12_500] as const;

for (const fw of FRAMEWORKS) {
  test.describe(`${fw.name} Chart Benchmark @chart-benchmark`, () => {
    let page: Page;

    test.beforeAll(async ({ browser }) => {
      page = await browser.newPage();
      userAgent = await page.evaluate(() => navigator.userAgent);
      await page.goto(`${fw.baseUrl}${fw.chartsPath}`, {
        waitUntil: "networkidle",
      });
      await expect(page.getByTestId("chart-controls")).toBeVisible();
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

    // ── Bar chart at each scale ──
    for (const N of CHART_COUNTS) {
      const label = N.toLocaleString();

      test(`Render ${label} bars`, async () => {
        const e2e = await measureClick(page, `chart-bars-${N}`, async (p) => {
          await waitForChartBarCount(p, N);
        });
        const inApp = await readLatestChartTiming(page);
        record(`Render ${label} bars`, e2e, inApp);
        expect(await getChartBarCount(page)).toBe(N);
        console.log(`  [${fw.name}] Bars ${label}: ${e2e.toFixed(1)}ms (E2E), ${inApp?.toFixed(1) ?? "–"}ms (in-app)`);

        // Clear after measuring so the next render starts clean
        await page.getByTestId("chart-clear").click();
        await waitForChartBarCount(page, 0);
      });
    }

    // ── Scatter chart at each scale ──
    for (const N of CHART_COUNTS) {
      const label = N.toLocaleString();

      test(`Render scatter ${label} points`, async () => {
        const e2e = await measureClick(page, `chart-scatter-${N}`, async (p) => {
          await waitForChartScatterCount(p, N);
        });
        const inApp = await readLatestChartTiming(page);
        record(`Render scatter ${label} pts`, e2e, inApp);
        expect(await getChartScatterCount(page)).toBe(N);
        console.log(`  [${fw.name}] Scatter ${label}: ${e2e.toFixed(1)}ms (E2E), ${inApp?.toFixed(1) ?? "–"}ms (in-app)`);

        // Clear after measuring so the next render starts clean
        await page.getByTestId("chart-clear").click();
        await waitForChartScatterCount(page, 0);
      });
    }

    // ── Line chart at each scale ──
    for (const N of CHART_COUNTS) {
      const label = N.toLocaleString();

      test(`Render line ${label} points`, async () => {
        const e2e = await measureClick(page, `chart-line-${N}`, async (p) => {
          await waitForChartLineCount(p, N);
        });
        const inApp = await readLatestChartTiming(page);
        record(`Render line ${label} pts`, e2e, inApp);
        expect(await getChartLineCount(page)).toBe(N);
        console.log(`  [${fw.name}] Line ${label}: ${e2e.toFixed(1)}ms (E2E), ${inApp?.toFixed(1) ?? "–"}ms (in-app)`);

        // Clear after measuring so the next render starts clean
        await page.getByTestId("chart-clear").click();
        await waitForChartLineCount(page, 0);
      });
    }

    // ── Update all data (at max scale) ──
    test("Update all chart data at max scale", async () => {
      // Ensure all charts have data at max scale
      const maxN = CHART_COUNTS[CHART_COUNTS.length - 1];
      if ((await getChartBarCount(page)) !== maxN) {
        await page.getByTestId(`chart-bars-${maxN}`).click();
        await waitForChartBarCount(page, maxN);
      }
      if ((await getChartScatterCount(page)) !== maxN) {
        await page.getByTestId(`chart-scatter-${maxN}`).click();
        await waitForChartScatterCount(page, maxN);
      }
      if ((await getChartLineCount(page)) !== maxN) {
        await page.getByTestId(`chart-line-${maxN}`).click();
        await waitForChartLineCount(page, maxN);
      }

      const e2e = await measureClick(page, "chart-update-all", async (p) => {
        // Wait for a short delay for the DOM to re-render
        await p.waitForTimeout(100);
      });
      const inApp = await readLatestChartTiming(page);
      record(`Update all charts (${maxN.toLocaleString()} each)`, e2e, inApp);
      console.log(`  [${fw.name}] Update all: ${e2e.toFixed(1)}ms (E2E), ${inApp?.toFixed(1) ?? "–"}ms (in-app)`);
    });

    // ── Clear all charts ──
    test("Clear all charts", async () => {
      // Ensure there is data to clear
      if ((await getChartBarCount(page)) === 0) {
        await page.getByTestId("chart-bars-100").click();
        await waitForChartBarCount(page, 100);
      }

      const e2e = await measureClick(page, "chart-clear", async (p) => {
        await Promise.all([
          waitForChartBarCount(p, 0),
          waitForChartScatterCount(p, 0),
          waitForChartLineCount(p, 0),
        ]);
      });
      const inApp = await readLatestChartTiming(page);
      record("Clear all charts", e2e, inApp);

      expect(await getChartBarCount(page)).toBe(0);
      expect(await getChartScatterCount(page)).toBe(0);
      expect(await getChartLineCount(page)).toBe(0);
      console.log(`  [${fw.name}] Clear all: ${e2e.toFixed(1)}ms (E2E), ${inApp?.toFixed(1) ?? "–"}ms (in-app)`);
    });
  });
}

test.describe("Generate chart benchmark report @chart-benchmark", () => {
  test("Save JSON report", async () => {
    const report: BenchmarkReport = {
      runId,
      timestamp: new Date().toISOString(),
      userAgent,
      results: allResults,
    };

    const jsonPath = saveReport(report, false);

    console.log("\n✅ Chart benchmark report saved:");
    console.log(`   JSON: ${jsonPath}`);
  });
});
