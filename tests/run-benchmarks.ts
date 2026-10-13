/**
 * run-benchmarks.ts – Run Playwright benchmarks N times → per-suite CSV.
 *
 * Orchestration (one layer above Playwright, one below Docker):
 *   docker-bench-runner.sh (or the shell) → THIS SCRIPT → N × `npx playwright test`
 *
 * Per iteration:
 *   1. spawn `npx playwright test --grep <tag>` with BENCH_ITERATION=i
 *      (Playwright starts the prod servers itself via webServer config);
 *   2. the run writes ONE JSON report (helpers/results.ts saveReport);
 *   3. findNewestJson() locates it, extractRows() flattens it into CSV rows,
 *      then the JSON is deleted (consumed). If the run died before writing
 *      the JSON, the spill file (.spill-<suite>.jsonl) is salvaged instead.
 * The CSV is rewritten after every iteration, so a killed runner loses at
 * most the iteration that was in progress.
 *
 * Usage:
 *   npx tsx run-benchmarks.ts [suite] [iterations]
 *
 * Arguments:
 *   suite       One of: benchmark, chart, pageload, memory, build, enterprise, lighthouse,
 *               a comma-separated list (e.g. "benchmark,memory,build"), or "all" (default: "all")
 *   iterations  Number of repetitions                                 (default: 10)
 *
 * Output:
 *   benchmark-results/<suite>-<timestamp>.csv   (one CSV per suite)
 */
import { execSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RESULTS_DIR = path.resolve(__dirname, "benchmark-results");

/* ── Suite definitions ───────────────────────────────── */
interface SuiteDef {
  grepTag: string;    // Playwright --grep tag selecting the suite's spec(s)
  csvHeader: string;  // schema of the flattened CSV
  extractRows: (report: any, i: number) => string[]; // JSON report → CSV rows
  jsonPrefix: string; // filename prefix of the JSON report the suite writes
}

function q(v: any): string {
  const s = String(v ?? "");
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

const SUITES: Record<string, SuiteDef> = {
  benchmark: {
    grepTag: "@benchmark",
    jsonPrefix: "benchmark-bench-",
    csvHeader: "iteration,framework,operation,e2e_ms,in_app_ms,used_js_heap_mb,total_js_heap_mb",
    extractRows: (report, i) => {
      if (!report.results || !Array.isArray(report.results)) return [];
      return report.results.map((r: any) =>
        [i, q(r.framework), q(r.operation), r.e2eMs, r.inAppMs ?? "", r.usedJSHeapMB ?? "", r.totalJSHeapMB ?? ""].join(",")
      );
    },
  },
  cellmatrix: {
    grepTag: "@cellmatrix",
    jsonPrefix: "benchmark-cellmatrix-",
    csvHeader: "iteration,framework,operation,e2e_ms,in_app_ms",
    extractRows: (report, i) => {
      if (!report.results || !Array.isArray(report.results)) return [];
      return report.results.map((r: any) =>
        [i, q(r.framework), q(r.operation), r.e2eMs, r.inAppMs ?? ""].join(",")
      );
    },
  },
  colscale: {
    grepTag: "@colscale",
    jsonPrefix: "benchmark-colscale-",
    csvHeader: "iteration,framework,operation,e2e_ms,in_app_ms,used_js_heap_mb,total_js_heap_mb",
    extractRows: (report, i) => {
      if (!report.results || !Array.isArray(report.results)) return [];
      return report.results.map((r: any) =>
        [i, q(r.framework), q(r.operation), r.e2eMs, r.inAppMs ?? "", r.usedJSHeapMB ?? "", r.totalJSHeapMB ?? ""].join(",")
      );
    },
  },
  celltypes: {
    grepTag: "@celltypes",
    jsonPrefix: "benchmark-celltypes-",
    csvHeader: "iteration,framework,operation,e2e_ms,in_app_ms,used_js_heap_mb,total_js_heap_mb",
    extractRows: (report, i) => {
      if (!report.results || !Array.isArray(report.results)) return [];
      return report.results.map((r: any) =>
        [i, q(r.framework), q(r.operation), r.e2eMs, r.inAppMs ?? "", r.usedJSHeapMB ?? "", r.totalJSHeapMB ?? ""].join(",")
      );
    },
  },
  rowinsert: {
    grepTag: "@rowinsert",
    jsonPrefix: "benchmark-rowinsert-",
    csvHeader: "iteration,framework,operation,e2e_ms,in_app_ms,used_js_heap_mb,total_js_heap_mb",
    extractRows: (report, i) => {
      if (!report.results || !Array.isArray(report.results)) return [];
      return report.results.map((r: any) =>
        [i, q(r.framework), q(r.operation), r.e2eMs, r.inAppMs ?? "", r.usedJSHeapMB ?? "", r.totalJSHeapMB ?? ""].join(",")
      );
    },
  },
  gridops: {
    grepTag: "@gridops",
    jsonPrefix: "benchmark-gridops-",
    csvHeader: "iteration,framework,operation,e2e_ms,in_app_ms,used_js_heap_mb,total_js_heap_mb",
    extractRows: (report, i) => {
      if (!report.results || !Array.isArray(report.results)) return [];
      return report.results.map((r: any) =>
        [i, q(r.framework), q(r.operation), r.e2eMs, r.inAppMs ?? "", r.usedJSHeapMB ?? "", r.totalJSHeapMB ?? ""].join(",")
      );
    },
  },
  chart: {
    grepTag: "@chart-benchmark",
    jsonPrefix: "benchmark-chart-benchmark-",
    csvHeader: "iteration,framework,operation,e2e_ms,in_app_ms",
    extractRows: (report, i) => {
      if (!report.results || !Array.isArray(report.results)) return [];
      return report.results.map((r: any) =>
        [i, q(r.framework), q(r.operation), r.e2eMs, r.inAppMs ?? ""].join(",")
      );
    },
  },
  pageload: {
    grepTag: "@pageload",
    jsonPrefix: "page-load-pageload-",
    csvHeader: "iteration,framework,initial_load_ms,fcp_ms,lcp_ms,tti_ms,dcl_ms,speed_index_ms,cls,js_transfer_bytes,css_transfer_bytes,total_transfer_bytes,heap_used_mb,cpu_scripting_ms",
    extractRows: (report, i) => {
      if (!report.results || !Array.isArray(report.results)) return [];
      return report.results.map((r: any) =>
        [i, q(r.framework), r.initialLoadMs, r.fcp ?? "", r.lcp ?? "", r.tti, r.dcl, r.speedIndex ?? "", r.cls, r.jsTransferBytes, r.cssTransferBytes, r.totalTransferBytes, r.heapUsedMB, r.cpuScriptingMs].join(",")
      );
    },
  },
  memory: {
    grepTag: "@memory",
    jsonPrefix: "memory-",
    csvHeader: "iteration,framework,stage,used_js_heap_mb,total_js_heap_mb",
    extractRows: (report, i) => {
      if (!report.results || !Array.isArray(report.results)) return [];
      const rows: string[] = [];
      for (const r of report.results) {
        for (const s of r.snapshots || []) {
          rows.push([i, q(r.framework), q(s.stage), s.usedJSHeapMB, s.totalJSHeapMB].join(","));
        }
      }
      return rows;
    },
  },
  build: {
    grepTag: "@build",
    jsonPrefix: "build-metrics-build-",
    csvHeader: "iteration,framework,build_time_ms,js_raw_bytes,js_gzip_bytes,css_raw_bytes,css_gzip_bytes,total_raw_bytes,total_gzip_bytes,file_count",
    extractRows: (report, i) => {
      if (!report.results || !Array.isArray(report.results)) return [];
      return report.results.map((r: any) =>
        [i, q(r.framework), r.buildTimeMs, r.jsRawBytes, r.jsGzipBytes, r.cssRawBytes, r.cssGzipBytes, r.totalRawBytes, r.totalGzipBytes, r.fileCount].join(",")
      );
    },
  },
  enterprise: {
    grepTag: "@enterprise",
    jsonPrefix: "benchmark-enterprise-",
    csvHeader: "iteration,framework,operation,e2e_ms,in_app_ms",
    extractRows: (report, i) => {
      if (!report.results || !Array.isArray(report.results)) return [];
      return report.results.map((r: any) =>
        [i, q(r.framework), q(r.operation), r.e2eMs, r.inAppMs ?? ""].join(",")
      );
    },
  },
  lighthouse: {
    grepTag: "@lighthouse",
    jsonPrefix: "lighthouse-lighthouse-",
    csvHeader: "iteration,framework,perf_score,fcp_ms,lcp_ms,tbt_ms,speed_index_ms,cls,tti_ms,fcp_score,lcp_score,tbt_score,si_score,cls_score",
    extractRows: (report, i) => {
      if (!report.results || !Array.isArray(report.results)) return [];
      return report.results.map((r: any) =>
        [i, q(r.framework), r.performanceScore, r.fcp, r.lcp, r.tbt, r.speedIndex, r.cls, r.tti, r.fcpScore, r.lcpScore, r.tbtScore, r.siScore, r.clsScore].join(",")
      );
    },
  },
};

const ALL_SUITE_NAMES = Object.keys(SUITES);

/* ── Parse CLI args ──────────────────────────────────── */
const suite = process.argv[2] || "all";
const iterations = parseInt(process.argv[3] || "10", 10);

// suite may be "all" or a comma-separated list of suite names (e.g. "benchmark,memory,build")
const requestedSuites =
  suite === "all"
    ? ALL_SUITE_NAMES
    : suite.split(",").map((s) => s.trim()).filter(Boolean);

const unknown = requestedSuites.filter((s) => !SUITES[s]);
if (unknown.length > 0) {
  console.error(
    `Unknown suite(s): "${unknown.join(", ")}". Use: all, ${ALL_SUITE_NAMES.join(", ")}`
  );
  process.exit(1);
}
if (isNaN(iterations) || iterations < 1) {
  console.error(`Invalid iterations: "${process.argv[3]}". Must be a positive integer.`);
  process.exit(1);
}

const suitesToRun: string[] = requestedSuites;

fs.mkdirSync(RESULTS_DIR, { recursive: true });

const timestamp = new Date().toISOString().replace(/[:.]/g, "-");

console.log("════════════════════════════════════════════════════════════");
console.log(`  Benchmark Runner – Suite: ${suite}, Iterations: ${iterations}`);
console.log(`  Suites: ${suitesToRun.join(", ")}`);
console.log("════════════════════════════════════════════════════════════\n");

/* ── Helper: find latest JSON file modified after a given time ── */
function findNewestJson(afterMs: number, prefix: string): string | null {
  if (!fs.existsSync(RESULTS_DIR)) return null;
  const files = fs.readdirSync(RESULTS_DIR)
    .filter((f) => f.endsWith(".json") && f !== "latest.json" && f.startsWith(prefix))
    .map((f) => ({
      name: f,
      path: path.join(RESULTS_DIR, f),
      mtime: fs.statSync(path.join(RESULTS_DIR, f)).mtimeMs,
    }))
    .filter((f) => f.mtime > afterMs)
    .sort((a, b) => b.mtime - a.mtime);
  return files.length > 0 ? files[0].path : null;
}

/**
 * Fallback when the run died before its save-report test could write the JSON
 * (crash, OOM, external kill): salvage the per-measurement spill file that the
 * specs append to. Only entries recorded after `afterMs` are taken, so a stale
 * spill from a previous iteration (run killed before global-setup wiped it)
 * cannot be double-counted.
 */
function salvageSpill(suiteName: string, afterMs: number): any | null {
  const spillPath = path.join(RESULTS_DIR, `.spill-${suiteName}.jsonl`);
  if (!fs.existsSync(spillPath)) return null;
  const results = fs.readFileSync(spillPath, "utf-8")
    .split("\n")
    .filter((l) => l.trim().length > 0)
    .map((l) => JSON.parse(l))
    .filter((r) => Date.parse(r.timestamp ?? "") > afterMs);
  return results.length > 0 ? { results } : null;
}

/* ── Run each suite → its own CSV ────────────────────── */
const csvFiles: string[] = [];

for (const suiteName of suitesToRun) {
  const def = SUITES[suiteName];
  const csvPath = path.join(RESULTS_DIR, `${suiteName}-${timestamp}.csv`);

  console.log(`\n══════════════════════════════════════════════════════════`);
  console.log(`  Running ${suiteName} × ${iterations} iterations`);
  console.log(`  CSV → ${csvPath}`);
  console.log(`══════════════════════════════════════════════════════════\n`);

  const csvRows: string[] = [def.csvHeader];

  for (let i = 1; i <= iterations; i++) {
    console.log(`\n──── Iteration ${i}/${iterations} (${suiteName}) ────`);

    const beforeMs = Date.now();

    try {
      execSync(
        `npx playwright test --grep "${def.grepTag}" --reporter=list`,
        {
          cwd: __dirname,
          stdio: "inherit",
          // 24h safety net only – a gridops iteration with image batches
          // exceeded the previous 12h cap and was killed mid-run, losing
          // the whole iteration. Playwright's per-test timeouts bound runtime.
          timeout: 1_440 * 60 * 1000,
          env: {
            ...process.env,
            BENCH_ITERATION: String(i),
          },
        },
      );
    } catch {
      console.warn(`  ⚠ Playwright exited with error on iteration ${i}`);
    }

    const jsonPath = findNewestJson(beforeMs, def.jsonPrefix);
    let report: any = null;
    if (jsonPath) {
      try {
        report = JSON.parse(fs.readFileSync(jsonPath, "utf-8"));
      } catch (err) {
        console.warn(`  ⚠ Failed to parse ${jsonPath}:`, err);
      }
      try { fs.unlinkSync(jsonPath); } catch {}
    } else {
      // Run died before the save-report test – salvage the spill file instead
      report = salvageSpill(suiteName, beforeMs);
      if (report) {
        console.warn(`  ⚠ No JSON for iteration ${i} – salvaged ${report.results.length} measurements from spill`);
      } else {
        console.warn(`  ⚠ No JSON result found for iteration ${i}`);
      }
    }

    if (report) {
      const rows = def.extractRows(report, i);
      csvRows.push(...rows);
      console.log(`  → Iteration ${i}: ${rows.length} measurements`);
    }

    // Write the CSV after EVERY iteration so a killed runner only loses the
    // iteration in progress, not all completed ones (they used to live only
    // in memory until the end of the loop).
    fs.writeFileSync(csvPath, csvRows.join("\n") + "\n");
  }

  csvFiles.push(csvPath);

  const dataRows = csvRows.length - 1;
  console.log(`\n✅ ${suiteName}: ${iterations} iterations → ${dataRows} rows`);
  console.log(`   ${csvPath}`);
}

console.log("\n════════════════════════════════════════════════════════════");
console.log("  All benchmark suites complete!");
console.log("════════════════════════════════════════════════════════════\n");

for (const f of csvFiles) {
  const size = fs.statSync(f).size;
  console.log(`  ${path.basename(f)} (${(size / 1024).toFixed(1)} KB)`);
}
