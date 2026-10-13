/**
 * lighthouse.spec.ts – Google Lighthouse audits for each framework.
 *
 * Runs a full Lighthouse performance audit against each framework's
 * benchmark page and collects:
 *   - Performance score (0–100)
 *   - FCP  (First Contentful Paint)
 *   - LCP  (Largest Contentful Paint)
 *   - TBT  (Total Blocking Time)
 *   - SI   (Speed Index)
 *   - CLS  (Cumulative Layout Shift)
 *
 * Lighthouse runs in its own Chromium instance with default throttling
 * (simulated slow 4G + 4× CPU slowdown) for realistic user-experience
 * scores.
 *
 * Tagged @lighthouse so you can run: npx playwright test --grep @lighthouse
 */
import { test, expect } from "@playwright/test";
import { FRAMEWORKS } from "../helpers/frameworks";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RESULTS_DIR = path.resolve(__dirname, "..", "benchmark-results");

/* ── Types ── */
interface LighthouseMetrics {
  framework: string;
  performanceScore: number;
  fcp: number;
  lcp: number;
  tbt: number;
  speedIndex: number;
  cls: number;
  tti: number;
  dcl: number;
  fcpScore: number;
  lcpScore: number;
  tbtScore: number;
  siScore: number;
  clsScore: number;
}

interface LighthouseReport {
  runId: string;
  timestamp: string;
  throttling: string;
  results: LighthouseMetrics[];
}

/* ── Helpers ── */
function ensureDir(): void {
  if (!fs.existsSync(RESULTS_DIR)) fs.mkdirSync(RESULTS_DIR, { recursive: true });
}

/* ── Shared state ── */
const allMetrics: LighthouseMetrics[] = [];
const runId = `lighthouse-${new Date().toISOString().replace(/[:.]/g, "-")}`;

/* ── Tests ── */
for (const fw of FRAMEWORKS) {
  test.describe(`${fw.name} Lighthouse Audit @lighthouse`, () => {

    test("Lighthouse performance audit", async () => {
      // Dynamic import – Lighthouse is ESM
      const lighthouse = (await import("lighthouse")).default;
      const { launch } = await import("chrome-launcher");

      // Launch a dedicated Chrome instance for Lighthouse
      const chrome = await launch({
        chromeFlags: ["--headless", "--no-sandbox", "--disable-gpu"],
      });

      try {
        const url = `${fw.baseUrl}${fw.benchmarkPath}`;

        const result = await lighthouse(url, {
          port: chrome.port,
          output: "json",
          logLevel: "error",
          onlyCategories: ["performance"],
        });

        expect(result).toBeTruthy();
        const { lhr } = result!;

        const perfScore = Math.round((lhr.categories.performance?.score ?? 0) * 100);
        const audits = lhr.audits;

        const metrics: LighthouseMetrics = {
          framework: fw.name,
          performanceScore: perfScore,
          fcp: audits["first-contentful-paint"]?.numericValue ?? 0,
          lcp: audits["largest-contentful-paint"]?.numericValue ?? 0,
          tbt: audits["total-blocking-time"]?.numericValue ?? 0,
          speedIndex: audits["speed-index"]?.numericValue ?? 0,
          cls: audits["cumulative-layout-shift"]?.numericValue ?? 0,
          tti: audits["interactive"]?.numericValue ?? 0,
          dcl: audits["diagnostics"]?.details?.items?.[0]?.mainDocumentTransferSize != null
            ? (lhr.audits["diagnostics"]?.details as any)?.items?.[0]?.maxServerLatency ?? 0
            : 0,
          fcpScore: Math.round((audits["first-contentful-paint"]?.score ?? 0) * 100),
          lcpScore: Math.round((audits["largest-contentful-paint"]?.score ?? 0) * 100),
          tbtScore: Math.round((audits["total-blocking-time"]?.score ?? 0) * 100),
          siScore: Math.round((audits["speed-index"]?.score ?? 0) * 100),
          clsScore: Math.round((audits["cumulative-layout-shift"]?.score ?? 0) * 100),
        };

        allMetrics.push(metrics);

        console.log(`\n🔦 [${fw.name}] Lighthouse Performance Audit:`);
        console.log(`   Performance Score: ${perfScore}/100`);
        console.log(`   FCP:          ${metrics.fcp.toFixed(1)}ms  (score: ${metrics.fcpScore})`);
        console.log(`   LCP:          ${metrics.lcp.toFixed(1)}ms  (score: ${metrics.lcpScore})`);
        console.log(`   TBT:          ${metrics.tbt.toFixed(1)}ms  (score: ${metrics.tbtScore})`);
        console.log(`   Speed Index:  ${metrics.speedIndex.toFixed(1)}ms  (score: ${metrics.siScore})`);
        console.log(`   CLS:          ${metrics.cls.toFixed(4)}   (score: ${metrics.clsScore})`);
        console.log(`   TTI:          ${metrics.tti.toFixed(1)}ms`);

        // Save individual Lighthouse HTML report
        ensureDir();
        const htmlResult = await lighthouse(url, {
          port: chrome.port,
          output: "html",
          logLevel: "error",
          onlyCategories: ["performance"],
        });
        if (htmlResult) {
          const htmlPath = path.join(RESULTS_DIR, `lighthouse-${fw.name.toLowerCase()}-${runId}.html`);
          fs.writeFileSync(htmlPath, htmlResult.report as string);
          console.log(`   HTML report:  ${htmlPath}`);
        }

        expect(perfScore).toBeGreaterThan(0);
      } finally {
        await chrome.kill();
      }
    });
  });
}

/* ── Generate combined report ── */
test.describe("Generate Lighthouse report @lighthouse", () => {
  test("Save JSON report", async () => {
    expect(allMetrics.length).toBe(FRAMEWORKS.length);
    ensureDir();

    const report: LighthouseReport = {
      runId,
      timestamp: new Date().toISOString(),
      throttling: "Lighthouse default (simulated slow 4G + 4× CPU slowdown)",
      results: allMetrics,
    };

    const jsonPath = path.join(RESULTS_DIR, `lighthouse-${runId}.json`);
    fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2));
    console.log(`\n✅ Lighthouse report saved: ${jsonPath}`);

    // CSV export
    const csvHeader = "Framework,PerfScore,FCP(ms),LCP(ms),TBT(ms),SI(ms),CLS,TTI(ms),FCP Score,LCP Score,TBT Score,SI Score,CLS Score";
    const csvRows = allMetrics.map((m) =>
      `${m.framework},${m.performanceScore},${m.fcp.toFixed(1)},${m.lcp.toFixed(1)},${m.tbt.toFixed(1)},${m.speedIndex.toFixed(1)},${m.cls.toFixed(4)},${m.tti.toFixed(1)},${m.fcpScore},${m.lcpScore},${m.tbtScore},${m.siScore},${m.clsScore}`
    );
    const csvPath = path.join(RESULTS_DIR, `lighthouse-${runId}.csv`);
    fs.writeFileSync(csvPath, [csvHeader, ...csvRows].join("\n"));
    console.log(`✅ Lighthouse CSV saved: ${csvPath}`);
  });
});
