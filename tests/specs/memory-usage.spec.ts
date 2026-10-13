/**
 * memory-usage.spec.ts – Measures JS heap memory for each framework.
 *
 * Snapshots at four row scales: 100, 500, 2,500, and 12,500
 * plus a baseline and post-clear leak check for each.
 *
 * Tagged @memory so you can run: npx playwright test --grep @memory
 */
import { test, expect, type Page } from "@playwright/test";
import { FRAMEWORKS } from "../helpers/frameworks";
import { waitForRowCount } from "../helpers/timing";
import { getRowCountOrder } from "../helpers/rowCounts";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RESULTS_DIR = path.resolve(__dirname, "..", "benchmark-results");

const ROW_COUNTS = getRowCountOrder("memory");

interface MemorySnapshot {
  stage: string;
  usedJSHeapMB: number;
  totalJSHeapMB: number;
}

interface FrameworkMemoryMetrics {
  framework: string;
  snapshots: MemorySnapshot[];
}

interface MemoryReport {
  runId: string;
  timestamp: string;
  results: FrameworkMemoryMetrics[];
}

async function getMemory(page: Page): Promise<{ usedMB: number; totalMB: number }> {
  return page.evaluate(() => {
    const mem = (performance as any).memory;
    if (!mem) return { usedMB: 0, totalMB: 0 };
    return {
      usedMB: Math.round(mem.usedJSHeapSize / 1024 / 1024 * 100) / 100,
      totalMB: Math.round(mem.totalJSHeapSize / 1024 / 1024 * 100) / 100,
    };
  });
}

async function forceGC(page: Page): Promise<void> {
  await page.evaluate(() => {
    if (typeof (globalThis as any).gc === "function") {
      (globalThis as any).gc();
      (globalThis as any).gc();
      (globalThis as any).gc();
    }
  });
  await page.waitForTimeout(300);
}

function ensureDir(): void {
  if (!fs.existsSync(RESULTS_DIR)) fs.mkdirSync(RESULTS_DIR, { recursive: true });
}

const allMetrics: FrameworkMemoryMetrics[] = [];
const runId = `memory-${new Date().toISOString().replace(/[:.]/g, "-")}`;

for (const fw of FRAMEWORKS) {
  test.describe(`${fw.name} Memory Usage @memory`, () => {
    let page: Page;
    const snapshots: MemorySnapshot[] = [];

    test.beforeAll(async ({ browser }) => {
      page = await browser.newPage();
      await page.goto(`${fw.baseUrl}${fw.benchmarkPath}`, { waitUntil: "networkidle" });
      await expect(page.getByTestId("bench-controls")).toBeVisible();
    });

    test.afterAll(async () => {
      allMetrics.push({ framework: fw.name, snapshots });
      await page.close();
    });

    function snap(stage: string, mem: { usedMB: number; totalMB: number }) {
      snapshots.push({ stage, usedJSHeapMB: mem.usedMB, totalJSHeapMB: mem.totalMB });
      console.log(`  [${fw.name}] ${stage}: ${mem.usedMB} MB used / ${mem.totalMB} MB total`);
    }

    test("Baseline (at rest)", async () => {
      await forceGC(page);
      snap("Baseline", await getMemory(page));
    });

    for (const N of ROW_COUNTS) {
      const label = N.toLocaleString();
      const btnId = `bench-create-${N}`;

      test(`After creating ${label} rows`, async () => {
        await page.getByTestId(btnId).click();
        await waitForRowCount(page, N);
        snap(`After ${label} rows`, await getMemory(page));
      });

      test(`After clearing ${label} rows`, async () => {
        await page.getByTestId("bench-clear").click();
        await waitForRowCount(page, 0);
        await forceGC(page);
        snap(`After clear ${label}`, await getMemory(page));
      });
    }
  });
}

test.describe("Generate memory report @memory", () => {
  test("Save JSON report", async () => {
    expect(allMetrics.length).toBe(FRAMEWORKS.length);
    ensureDir();

    const report: MemoryReport = {
      runId,
      timestamp: new Date().toISOString(),
      results: allMetrics,
    };

    const jsonPath = path.join(RESULTS_DIR, `memory-${runId}.json`);
    fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2));
    console.log(`\n✅ Memory report saved: ${jsonPath}`);

    for (const m of allMetrics) {
      console.log(`\n📊 ${m.framework}:`);
      for (const s of m.snapshots) {
        console.log(`   ${s.stage.padEnd(20)} ${s.usedJSHeapMB} MB`);
      }
    }
  });
});
