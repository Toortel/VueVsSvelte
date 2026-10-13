/**
 * build-metrics.spec.ts – Measures build time and bundle size for each framework.
 *
 * For each framework:
 *   1. Runs `npm run build` and measures wall-clock build time.
 *   2. Scans the production output directory for JS / CSS / other assets.
 *   3. Reports per-file and total sizes (raw + gzipped estimate).
 *
 * Tagged @build so you can run: npx playwright test --grep @build
 *
 * Results are written to benchmark-results/build-metrics-<runId>.json
 * and an HTML summary at benchmark-results/build-metrics.html
 */
import { test, expect } from "@playwright/test";
import { FRAMEWORKS, type FrameworkConfig } from "../helpers/frameworks";
import * as fs from "node:fs";
import * as path from "node:path";
import { execSync } from "node:child_process";
import { gzipSync } from "node:zlib";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RESULTS_DIR = path.resolve(__dirname, "..", "benchmark-results");

/* ────────────────────────────────────────────────────────
   Types
   ──────────────────────────────────────────────────────── */
interface FileSize {
  file: string;
  rawBytes: number;
  gzipBytes: number;
}

interface FrameworkBuildMetrics {
  framework: string;
  buildTimeMs: number;
  totalRawBytes: number;
  totalGzipBytes: number;
  jsRawBytes: number;
  jsGzipBytes: number;
  cssRawBytes: number;
  cssGzipBytes: number;
  otherRawBytes: number;
  fileCount: number;
  files: FileSize[];
}

interface BuildMetricsReport {
  runId: string;
  timestamp: string;
  results: FrameworkBuildMetrics[];
}

/* ────────────────────────────────────────────────────────
   Helpers
   ──────────────────────────────────────────────────────── */

/** Recursively collect all files from a directory */
function walkDir(dir: string, base = dir): FileSize[] {
  const entries: FileSize[] = [];
  if (!fs.existsSync(dir)) return entries;

  for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, item.name);
    if (item.isDirectory()) {
      entries.push(...walkDir(fullPath, base));
    } else {
      const content = fs.readFileSync(fullPath);
      entries.push({
        file: path.relative(base, fullPath).replace(/\\/g, "/"),
        rawBytes: content.length,
        gzipBytes: gzipSync(content, { level: 9 }).length,
      });
    }
  }
  return entries;
}

/** Find the actual output directory for a framework build */
function findDistDir(fw: FrameworkConfig): string {
  // Primary: configured distDir
  const primary = path.join(fw.projectDir, fw.distDir);
  return primary;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function ensureDir(): void {
  if (!fs.existsSync(RESULTS_DIR)) {
    fs.mkdirSync(RESULTS_DIR, { recursive: true });
  }
}

function removeDirIfExists(dir: string): void {
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function cleanupBuildArtifacts(fw: FrameworkConfig): void {
  // Reset framework-local output/cache so cold builds are comparable.
  removeDirIfExists(path.join(fw.projectDir, fw.distDir));
  removeDirIfExists(path.join(fw.projectDir, "node_modules", ".vite"));
  removeDirIfExists(path.join(fw.projectDir, ".vite"));
  removeDirIfExists(path.join(fw.projectDir, ".svelte-kit"));
}

function getFrameworksForCurrentIteration(): FrameworkConfig[] {
  const iteration = Number.parseInt(process.env.BENCH_ITERATION ?? "1", 10);
  if (!Number.isFinite(iteration) || iteration < 1) {
    return [...FRAMEWORKS];
  }
  return iteration % 2 === 0 ? [...FRAMEWORKS].reverse() : [...FRAMEWORKS];
}

function runBuildAndMeasure(fw: FrameworkConfig): number {
  const t0 = performance.now();
  execSync(fw.buildCommand, {
    cwd: fw.projectDir,
    stdio: "pipe",
    timeout: 120_000,
    env: { ...process.env, NODE_ENV: "production" },
  });
  return performance.now() - t0;
}

/* ────────────────────────────────────────────────────────
   Shared state for the test run
   ──────────────────────────────────────────────────────── */
const allMetrics: FrameworkBuildMetrics[] = [];
const runId = `build-${new Date().toISOString().replace(/[:.]/g, "-")}`;

/* ────────────────────────────────────────────────────────
   Tests – build each framework and measure
   ──────────────────────────────────────────────────────── */
for (const fw of getFrameworksForCurrentIteration()) {
  test.describe(`${fw.name} Build Metrics @build`, () => {
    test(`Build and measure bundle size`, async () => {
      // ── 1. Run a cold production build, measure time ──
      console.log(`\n🔨 Building ${fw.name}...`);
      cleanupBuildArtifacts(fw);

      let buildTimeMs = 0;

      try {
        buildTimeMs = runBuildAndMeasure(fw);
      } catch (err: any) {
        console.error(`  ❌ Build failed for ${fw.name}:`, err.stderr?.toString() ?? err.message);
        throw err;
      }

      console.log(`  ✅ Build completed in ${buildTimeMs.toFixed(0)}ms`);

      // ── 2. Scan the output directory ──
      const distDir = findDistDir(fw);
      expect(
        fs.existsSync(distDir),
        `Build output directory not found: ${distDir}`,
      ).toBe(true);

      const files = walkDir(distDir);
      expect(files.length, "Build should produce at least one output file").toBeGreaterThan(0);

      // ── 3. Categorise files ──
      const jsFiles = files.filter((f) => /\.(js|mjs)$/.test(f.file));
      const cssFiles = files.filter((f) => /\.css$/.test(f.file));
      const otherFiles = files.filter(
        (f) => !/\.(js|mjs|css)$/.test(f.file),
      );

      const sum = (arr: FileSize[], key: "rawBytes" | "gzipBytes") =>
        arr.reduce((s, f) => s + f[key], 0);

      const metrics: FrameworkBuildMetrics = {
        framework: fw.name,
        buildTimeMs,
        totalRawBytes: sum(files, "rawBytes"),
        totalGzipBytes: sum(files, "gzipBytes"),
        jsRawBytes: sum(jsFiles, "rawBytes"),
        jsGzipBytes: sum(jsFiles, "gzipBytes"),
        cssRawBytes: sum(cssFiles, "rawBytes"),
        cssGzipBytes: sum(cssFiles, "gzipBytes"),
        otherRawBytes: sum(otherFiles, "rawBytes"),
        fileCount: files.length,
        files,
      };

      allMetrics.push(metrics);

      // ── 4. Console output ──
      console.log(`  📦 ${fw.name} Bundle Summary:`);
      console.log(`     Build time:  ${buildTimeMs.toFixed(0)}ms`);
      console.log(`     Total files: ${files.length}`);
      console.log(`     JS:          ${formatBytes(metrics.jsRawBytes)} (${formatBytes(metrics.jsGzipBytes)} gzip)`);
      console.log(`     CSS:         ${formatBytes(metrics.cssRawBytes)} (${formatBytes(metrics.cssGzipBytes)} gzip)`);
      console.log(`     Other:       ${formatBytes(metrics.otherRawBytes)}`);
      console.log(`     Total:       ${formatBytes(metrics.totalRawBytes)} (${formatBytes(metrics.totalGzipBytes)} gzip)`);

      // Top 5 largest JS files
      const topJs = [...jsFiles].sort((a, b) => b.rawBytes - a.rawBytes).slice(0, 5);
      if (topJs.length > 0) {
        console.log(`     Top JS files:`);
        for (const f of topJs) {
          console.log(`       ${f.file}: ${formatBytes(f.rawBytes)} (${formatBytes(f.gzipBytes)} gzip)`);
        }
      }
    });
  });
}

/* ────────────────────────────────────────────────────────
   After all builds: generate comparison report
   ──────────────────────────────────────────────────────── */
test.describe("Generate build metrics report @build", () => {
  test("Save JSON + HTML report", async () => {
    expect(allMetrics.length, "Should have metrics for all frameworks").toBe(
      FRAMEWORKS.length,
    );

    ensureDir();

    const report: BuildMetricsReport = {
      runId,
      timestamp: new Date().toISOString(),
      results: allMetrics,
    };

    // ── JSON ──
    const jsonPath = path.join(RESULTS_DIR, `build-metrics-${runId}.json`);
    fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2));

    // ── HTML ──
    const htmlPath = generateBuildHtml(report);

    console.log(`\n✅ Build metrics report saved:`);
    console.log(`   JSON: ${jsonPath}`);
    console.log(`   HTML: ${htmlPath}`);

    // ── Console comparison table ──
    console.log(`\n📊 Build Metrics Comparison:\n`);
    console.log(
      `${"Framework".padEnd(12)} ${"Build (ms)".padStart(12)} ${"JS (gzip)".padStart(14)} ${"CSS (gzip)".padStart(14)} ${"Total (gzip)".padStart(14)} ${"Files".padStart(6)}`,
    );
    console.log("─".repeat(76));
    for (const m of allMetrics) {
      console.log(
        `${m.framework.padEnd(12)} ${m.buildTimeMs.toFixed(0).padStart(12)} ${formatBytes(m.jsGzipBytes).padStart(14)} ${formatBytes(m.cssGzipBytes).padStart(14)} ${formatBytes(m.totalGzipBytes).padStart(14)} ${String(m.fileCount).padStart(6)}`,
      );
    }
  });
});

/* ────────────────────────────────────────────────────────
   HTML report generator
   ──────────────────────────────────────────────────────── */
function generateBuildHtml(report: BuildMetricsReport): string {
  const fws = report.results;

  const rows = [
    { label: "Build Time", key: "buildTimeMs", unit: "ms", format: (v: number) => v.toFixed(0) },
    { label: "JS (raw)", key: "jsRawBytes", unit: "", format: formatBytes },
    { label: "JS (gzip)", key: "jsGzipBytes", unit: "", format: formatBytes },
    { label: "CSS (raw)", key: "cssRawBytes", unit: "", format: formatBytes },
    { label: "CSS (gzip)", key: "cssGzipBytes", unit: "", format: formatBytes },
    { label: "Other assets", key: "otherRawBytes", unit: "", format: formatBytes },
    { label: "Total (raw)", key: "totalRawBytes", unit: "", format: formatBytes },
    { label: "Total (gzip)", key: "totalGzipBytes", unit: "", format: formatBytes },
    { label: "File count", key: "fileCount", unit: "", format: (v: number) => String(v) },
  ] as const;

  let tableRows = "";
  for (const row of rows) {
    const values = fws.map((fw) => (fw as any)[row.key] as number);
    const best = Math.min(...values);
    const worst = Math.max(...values);

    const cells = fws
      .map((fw) => {
        const v = (fw as any)[row.key] as number;
        const cls = values.length > 1 && v === best ? ' class="best"' : v === worst && best !== worst ? ' class="worst"' : "";
        return `<td${cls}>${row.format(v)}</td>`;
      })
      .join("");

    tableRows += `<tr><td class="metric">${row.label}</td>${cells}</tr>\n`;
  }

  const fwHeaders = fws.map((fw) => `<th>${fw.framework}</th>`).join("");

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Build Metrics – ${report.timestamp}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; max-width: 960px; margin: 2rem auto; padding: 0 1rem; background: #f8fafc; color: #1a1a2e; }
    h1 { color: #1e40af; }
    .meta { color: #6b7280; margin-bottom: 1.5rem; font-size: .9rem; }
    table { width: 100%; border-collapse: collapse; background: #fff; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden; }
    th { background: #1e40af; color: #fff; padding: .75rem; font-size: .85rem; }
    td { padding: .6rem .75rem; border-bottom: 1px solid #e2e8f0; text-align: center; font-family: "Consolas", monospace; font-size: .85rem; }
    td.metric { text-align: left; font-weight: 600; font-family: inherit; }
    tr:hover { background: #f1f5f9; }
    .best { background: #d1fae5; font-weight: bold; }
    .worst { background: #fee2e2; }
    .legend { margin-top: 1rem; font-size: .8rem; color: #6b7280; }
  </style>
</head>
<body>
  <h1>📦 Build Metrics Comparison</h1>
  <div class="meta">
    <p>Run ID: ${report.runId}</p>
    <p>Timestamp: ${report.timestamp}</p>
  </div>
  <table>
    <thead><tr><th>Metric</th>${fwHeaders}</tr></thead>
    <tbody>${tableRows}</tbody>
  </table>
  <p class="legend">
    <span style="background:#d1fae5;padding:2px 8px;">Green</span> = best (lowest).
    <span style="background:#fee2e2;padding:2px 8px;">Red</span> = worst (highest).
    Gzip sizes use level 9 compression.
  </p>
</body>
</html>`;

  const htmlPath = path.join(RESULTS_DIR, "build-metrics.html");
  fs.writeFileSync(htmlPath, html);
  return htmlPath;
}
