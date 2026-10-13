/**
 * page-load.spec.ts – Measures page-load performance & Core Web Vitals.
 *
 * For each framework, navigates to the benchmark page and captures:
 *   - Initial load time (navigation → load event)
 *   - FCP  (First Contentful Paint)
 *   - LCP  (Largest Contentful Paint)
 *   - TTI  (Time to Interactive – proxy: first button clickable)
 *   - DCL  (DOMContentLoaded)
 *   - Speed Index (approximated via FCP + LCP timing)
 *   - CLS  (Cumulative Layout Shift)
 *   - TBT  (Total Blocking Time – sum of blocking portions of long tasks)
 *   - Bundle size (JS + CSS transfer bytes)
 *   - Heap usage (JS heap after load)
 *   - CPU usage  (scripting time during load via CDP)
 *
 * Uses a fresh browser context per measurement (cold load, no cache).
 *
 * Tagged @pageload so you can run: npx playwright test --grep @pageload
 */
import { test, expect, type Page, type BrowserContext } from "@playwright/test";
import { FRAMEWORKS } from "../helpers/frameworks";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RESULTS_DIR = path.resolve(__dirname, "..", "benchmark-results");

/* ── Types ── */
interface PageLoadMetrics {
  framework: string;
  initialLoadMs: number;
  ttfb: number;
  fcp: number | null;
  lcp: number | null;
  tti: number;
  dcl: number;
  speedIndex: number | null;
  cls: number;
  tbt: number;
  jsTransferBytes: number;
  cssTransferBytes: number;
  totalTransferBytes: number;
  heapUsedMB: number;
  cpuScriptingMs: number;
}

interface PageLoadReport {
  runId: string;
  timestamp: string;
  userAgent: string;
  results: PageLoadMetrics[];
}

/* ── Helpers ── */
function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function ensureDir(): void {
  if (!fs.existsSync(RESULTS_DIR)) fs.mkdirSync(RESULTS_DIR, { recursive: true });
}

async function injectWebVitalObservers(page: Page): Promise<void> {
  await page.addInitScript(() => {
    (window as any).__lcpValue = null;
    try {
      const lcpObs = new PerformanceObserver((list) => {
        const entries = list.getEntries();
        if (entries.length > 0) {
          (window as any).__lcpValue = entries[entries.length - 1].startTime;
        }
      });
      lcpObs.observe({ type: "largest-contentful-paint", buffered: true });
    } catch {}

    (window as any).__clsValue = 0;
    try {
      const clsObs = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (!(entry as any).hadRecentInput) {
            (window as any).__clsValue += (entry as any).value ?? 0;
          }
        }
      });
      clsObs.observe({ type: "layout-shift", buffered: true });
    } catch {}

    (window as any).__longTasks = [];
    try {
      const ltObs = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          (window as any).__longTasks.push(entry.duration);
        }
      });
      ltObs.observe({ type: "longtask", buffered: true });
    } catch {}
  });
}

/* ── Shared state ── */
const allMetrics: PageLoadMetrics[] = [];
const runId = `pageload-${new Date().toISOString().replace(/[:.]/g, "-")}`;
let userAgent = "";

/* ── Tests ── */
for (const fw of FRAMEWORKS) {
  test.describe(`${fw.name} Page Load @pageload`, () => {

    test("Cold-load performance metrics", async ({ browser }) => {
      const context: BrowserContext = await browser.newContext({
        viewport: { width: 1280, height: 720 },
      });
      const page = await context.newPage();

      if (!userAgent) {
        userAgent = await page.evaluate(() => navigator.userAgent);
      }

      await injectWebVitalObservers(page);

      // Start CDP session for CPU metrics
      const cdp = await context.newCDPSession(page);
      await cdp.send("Performance.enable");

      const navStart = performance.now();
      await page.goto(`${fw.baseUrl}${fw.benchmarkPath}`, { waitUntil: "load" });

      // Wait for interactive
      await expect(page.getByTestId("bench-controls")).toBeVisible({ timeout: 30_000 });
      await expect(page.getByTestId("bench-create-100")).toBeEnabled({ timeout: 10_000 });
      const ttiWall = performance.now() - navStart;

      // Let observers settle
      await page.waitForTimeout(500);

      // Navigation timing
      const navTiming = await page.evaluate(() => {
        const [nav] = performance.getEntriesByType("navigation") as PerformanceNavigationTiming[];
        if (!nav) return null;
        return {
          loadEvent: nav.loadEventEnd - nav.startTime,
          dcl: nav.domContentLoadedEventEnd - nav.startTime,
          ttfb: nav.responseStart - nav.requestStart,
        };
      });

      // FCP
      const fcp = await page.evaluate(() => {
        const entries = performance.getEntriesByType("paint");
        const e = entries.find((e) => e.name === "first-contentful-paint");
        return e ? e.startTime : null;
      });

      // LCP
      const lcp = await page.evaluate(() => (window as any).__lcpValue ?? null);

      // CLS
      const cls = await page.evaluate(() => (window as any).__clsValue ?? 0);

      // TBT – sum of blocking portions (>50ms) of all long tasks between FCP and TTI
      const tbt = await page.evaluate(() => {
        const tasks: number[] = (window as any).__longTasks ?? [];
        return tasks.reduce((sum: number, duration: number) => sum + Math.max(0, duration - 50), 0);
      });

      // Speed Index approximation: weighted average of FCP and LCP
      const speedIndex = fcp != null && lcp != null ? (fcp + lcp) / 2 : null;

      // Resource sizes
      const resources = await page.evaluate(() => {
        const entries = performance.getEntriesByType("resource") as PerformanceResourceTiming[];
        let js = 0, css = 0, total = 0;
        for (const e of entries) {
          total += e.transferSize;
          if (e.initiatorType === "script" || /\.(js|mjs)(\?|$)/.test(e.name)) js += e.transferSize;
          else if (e.initiatorType === "css" || /\.css(\?|$)/.test(e.name)) css += e.transferSize;
        }
        return { js, css, total };
      });

      // Heap usage
      const heapUsedMB = await page.evaluate(() => {
        const mem = (performance as any).memory;
        if (!mem) return 0;
        return Math.round(mem.usedJSHeapSize / 1024 / 1024 * 100) / 100;
      });

      // CPU scripting time via CDP Performance metrics
      const perfMetrics = await cdp.send("Performance.getMetrics");
      const scriptDuration = perfMetrics.metrics.find((m: any) => m.name === "ScriptDuration");
      const cpuScriptingMs = (scriptDuration?.value ?? 0) * 1000;

      const metrics: PageLoadMetrics = {
        framework: fw.name,
        initialLoadMs: navTiming?.loadEvent ?? 0,
        ttfb: navTiming?.ttfb ?? 0,
        fcp,
        lcp,
        tti: ttiWall,
        dcl: navTiming?.dcl ?? 0,
        speedIndex,
        cls,
        tbt,
        jsTransferBytes: resources.js,
        cssTransferBytes: resources.css,
        totalTransferBytes: resources.total,
        heapUsedMB,
        cpuScriptingMs,
      };

      allMetrics.push(metrics);

      console.log(`\n📄 [${fw.name}] Page Load Metrics:`);
      console.log(`   Initial Load:     ${metrics.initialLoadMs.toFixed(1)}ms`);
      console.log(`   TTFB:             ${metrics.ttfb.toFixed(1)}ms`);
      console.log(`   FCP:              ${fcp?.toFixed(1) ?? "–"}ms`);
      console.log(`   LCP:              ${lcp?.toFixed(1) ?? "–"}ms`);
      console.log(`   TTI:              ${ttiWall.toFixed(1)}ms`);
      console.log(`   DCL:              ${metrics.dcl.toFixed(1)}ms`);
      console.log(`   Speed Index:      ${speedIndex?.toFixed(1) ?? "–"}ms`);
      console.log(`   CLS:              ${cls.toFixed(4)}`);
      console.log(`   TBT:              ${tbt.toFixed(1)}ms`);
      console.log(`   JS Transfer:      ${formatBytes(resources.js)}`);
      console.log(`   CSS Transfer:     ${formatBytes(resources.css)}`);
      console.log(`   Total Transfer:   ${formatBytes(resources.total)}`);
      console.log(`   Heap Used:        ${heapUsedMB} MB`);
      console.log(`   CPU Scripting:    ${cpuScriptingMs.toFixed(1)}ms`);

      expect(metrics.initialLoadMs).toBeGreaterThan(0);

      await cdp.detach();
      await context.close();
    });
  });
}

/* ── Generate report ── */
test.describe("Generate page load report @pageload", () => {
  test("Save JSON report", async () => {
    expect(allMetrics.length).toBe(FRAMEWORKS.length);
    ensureDir();

    const report: PageLoadReport = {
      runId,
      timestamp: new Date().toISOString(),
      userAgent,
      results: allMetrics,
    };

    const jsonPath = path.join(RESULTS_DIR, `page-load-${runId}.json`);
    fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2));
    console.log(`\n✅ Page load report saved: ${jsonPath}`);
  });
});
