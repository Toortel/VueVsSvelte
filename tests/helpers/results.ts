/**
 * results.ts – Collect, persist and compare benchmark results.
 *
 * Results are stored in benchmark-results/<timestamp>.json
 * and a latest.json symlink/copy for easy comparison.
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import ExcelJS from "exceljs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RESULTS_DIR = path.resolve(__dirname, "..", "benchmark-results");

export interface BenchmarkResult {
  framework: string;
  operation: string;
  e2eMs: number;
  inAppMs: number | null;
  usedJSHeapMB?: number | null;
  totalJSHeapMB?: number | null;
  timestamp: string;
}

export interface BenchmarkReport {
  runId: string;
  timestamp: string;
  userAgent: string;
  results: BenchmarkResult[];
}

/** Ensure the output directory exists */
function ensureDir(): void {
  if (!fs.existsSync(RESULTS_DIR)) {
    fs.mkdirSync(RESULTS_DIR, { recursive: true });
  }
}

/**
 * Spill files guard against data loss: Playwright restarts the worker process
 * after a test failure, wiping module-level result arrays. Each result is
 * appended to disk immediately; the save-report test reads them back.
 * Stale spills are deleted by global-setup.ts at the start of every run.
 */
function spillPath(suite: string): string {
  return path.join(RESULTS_DIR, `.spill-${suite}.jsonl`);
}

/** Append a single result to the suite's spill file (survives worker restarts). */
export function appendSpill(suite: string, result: BenchmarkResult): void {
  ensureDir();
  fs.appendFileSync(spillPath(suite), JSON.stringify(result) + "\n");
}

/** Read back all results spilled during this run (empty array if none). */
export function collectSpill(suite: string): BenchmarkResult[] {
  const p = spillPath(suite);
  if (!fs.existsSync(p)) return [];
  return fs
    .readFileSync(p, "utf-8")
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as BenchmarkResult);
}

/** Save a full benchmark report */
/** Save a full benchmark report. Set updateLatest=false to avoid overwriting the baseline. */
export function saveReport(report: BenchmarkReport, updateLatest = true): string {
  ensureDir();
  const filename = `benchmark-${report.runId}.json`;
  const filepath = path.join(RESULTS_DIR, filename);
  fs.writeFileSync(filepath, JSON.stringify(report, null, 2));

  // Also write as latest.json for easy comparison (unless opted out)
  if (updateLatest) {
    const latestPath = path.join(RESULTS_DIR, "latest.json");
    fs.writeFileSync(latestPath, JSON.stringify(report, null, 2));
  }

  return filepath;
}

/** Load the latest benchmark report (for regression comparison) */
export function loadLatest(): BenchmarkReport | null {
  const latestPath = path.join(RESULTS_DIR, "latest.json");
  if (!fs.existsSync(latestPath)) return null;
  return JSON.parse(fs.readFileSync(latestPath, "utf-8"));
}

/** Load a specific report by filename */
export function loadReport(filename: string): BenchmarkReport | null {
  const filepath = path.join(RESULTS_DIR, filename);
  if (!fs.existsSync(filepath)) return null;
  return JSON.parse(fs.readFileSync(filepath, "utf-8"));
}

/** List all saved reports */
export function listReports(): string[] {
  ensureDir();
  return fs.readdirSync(RESULTS_DIR)
    .filter((f) => f.startsWith("benchmark-") && f.endsWith(".json"))
    .sort();
}

/**
 * Generate an HTML comparison report from the latest benchmark.
 * Writes to benchmark-results/comparison.html
 */
export function generateHtmlReport(report: BenchmarkReport): string {
  ensureDir();

  // Group results by operation
  const operations = [...new Set(report.results.map((r) => r.operation))];
  const frameworks = [...new Set(report.results.map((r) => r.framework))];

  let tableRows = "";
  for (const op of operations) {
    const cells = frameworks.map((fw) => {
      const entry = report.results.find(
        (r) => r.framework === fw && r.operation === op
      );
      const e2e = entry ? entry.e2eMs.toFixed(1) : "–";
      const inApp = entry?.inAppMs != null ? entry.inAppMs.toFixed(1) : "–";
      const heap = entry?.usedJSHeapMB != null ? entry.usedJSHeapMB.toFixed(2) : "–";
      return `<td>${e2e}</td><td>${inApp}</td><td>${heap}</td>`;
    });
    tableRows += `<tr><td class="op">${op}</td>${cells.join("")}</tr>\n`;
  }

  const fwHeaders = frameworks
    .map((fw) => `<th colspan="3">${fw}</th>`)
    .join("");
  const subHeaders = frameworks
    .map(() => `<th>E2E (ms)</th><th>In-App (ms)</th><th>Heap (MB)</th>`)
    .join("");

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Benchmark Comparison – ${report.timestamp}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; max-width: 1200px; margin: 2rem auto; padding: 0 1rem; background: #f8fafc; color: #1a1a2e; }
    h1 { color: #1e40af; }
    .meta { color: #6b7280; margin-bottom: 1.5rem; font-size: .9rem; }
    table { width: 100%; border-collapse: collapse; background: #fff; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden; }
    th { background: #1e40af; color: #fff; padding: .75rem; font-size: .8rem; text-transform: uppercase; }
    th[colspan] { border-bottom: 1px solid rgba(255,255,255,.3); }
    td { padding: .6rem .75rem; border-bottom: 1px solid #e2e8f0; text-align: center; font-family: "Consolas", monospace; font-size: .85rem; }
    td.op { text-align: left; font-weight: 600; font-family: inherit; }
    tr:hover { background: #f1f5f9; }
    .legend { margin-top: 1rem; font-size: .8rem; color: #6b7280; }
  </style>
</head>
<body>
  <h1>⚡ Framework Benchmark Comparison</h1>
  <div class="meta">
    <p>Run ID: ${report.runId}</p>
    <p>Timestamp: ${report.timestamp}</p>
    <p>User Agent: ${report.userAgent}</p>
  </div>
  <table>
    <thead>
      <tr><th rowspan="2">Operation</th>${fwHeaders}</tr>
      <tr>${subHeaders}</tr>
    </thead>
    <tbody>
      ${tableRows}
    </tbody>
  </table>
  <p class="legend">
    <strong>E2E</strong> = Playwright wall-clock (click → DOM settled).
    <strong>In-App</strong> = Framework's own performance.now() measurement.
    <strong>Heap</strong> = used JS heap right after the operation.
    Lower is better.
  </p>
</body>
</html>`;

  const htmlPath = path.join(RESULTS_DIR, "comparison.html");
  fs.writeFileSync(htmlPath, html);
  return htmlPath;
}

/**
 * Generate an Excel (.xlsx) report consolidating all framework results
 * into a single workbook with multiple sheets.
 *
 * Sheet 1 – "Comparison"  : Operations as rows, frameworks as column groups
 * Sheet 2 – "Raw Data"    : Flat list of every measurement
 * Sheet 3 – "Summary"     : Run metadata and per-framework averages
 */
export async function generateExcelReport(
  report: BenchmarkReport,
  filenamePrefix = "benchmark-results"
): Promise<string> {
  ensureDir();

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Budget Reporting Benchmark Suite";
  workbook.created = new Date(report.timestamp);

  const operations = [...new Set(report.results.map((r) => r.operation))];
  const frameworks = [...new Set(report.results.map((r) => r.framework))];

  /* ── Colour palette ────────────────────────────────── */
  const headerFill: ExcelJS.Fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF1E40AF" },
  };
  const headerFont: Partial<ExcelJS.Font> = {
    bold: true,
    color: { argb: "FFFFFFFF" },
    size: 11,
  };
  const subHeaderFill: ExcelJS.Fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF3B82F6" },
  };
  const bestFill: ExcelJS.Fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFD1FAE5" }, // green-100
  };
  const worstFill: ExcelJS.Fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFFEE2E2" }, // red-100
  };
  const thinBorder: Partial<ExcelJS.Borders> = {
    top: { style: "thin" },
    left: { style: "thin" },
    bottom: { style: "thin" },
    right: { style: "thin" },
  };

  /* ═══════════════════════════════════════════════════
     Sheet 1 – Comparison
     ═══════════════════════════════════════════════════ */
  const comp = workbook.addWorksheet("Comparison", {
    views: [{ state: "frozen", ySplit: 2 }],
  });

  // Row 1 – framework group headers
  const row1Vals: string[] = ["Operation"];
  for (const fw of frameworks) {
    row1Vals.push(fw, "", ""); // each fw gets 3 cols (E2E, In-App, Heap)
  }
  const headerRow1 = comp.addRow(row1Vals);
  headerRow1.eachCell((cell: any, colNumber: any) => {
    cell.fill = headerFill;
    cell.font = headerFont;
    cell.alignment = { horizontal: "center", vertical: "middle" };
    cell.border = thinBorder;
  });
  // Merge framework header cells (groups of 3 starting at col 2)
  for (let i = 0; i < frameworks.length; i++) {
    const startCol = 2 + i * 3;
    comp.mergeCells(1, startCol, 1, startCol + 2);
  }

  // Row 2 – sub-headers (E2E ms / In-App ms / Heap MB for each framework)
  const row2Vals: string[] = [""];
  for (const _fw of frameworks) {
    row2Vals.push("E2E (ms)", "In-App (ms)", "Heap (MB)");
  }
  const headerRow2 = comp.addRow(row2Vals);
  headerRow2.eachCell((cell: any) => {
    cell.fill = subHeaderFill;
    cell.font = { ...headerFont, size: 10 };
    cell.alignment = { horizontal: "center", vertical: "middle" };
    cell.border = thinBorder;
  });

  // Data rows – one per operation
  for (const op of operations) {
    const rowVals: (string | number)[] = [op];
    const e2eValues: (number | null)[] = [];

    for (const fw of frameworks) {
      const entry = report.results.find(
        (r) => r.framework === fw && r.operation === op
      );
      const e2e = entry ? entry.e2eMs : null;
      const inApp = entry?.inAppMs ?? null;
      const heap = entry?.usedJSHeapMB ?? null;
      e2eValues.push(e2e);
      rowVals.push(e2e ?? ("–" as any), inApp ?? ("–" as any), heap ?? ("–" as any));
    }

    const dataRow = comp.addRow(rowVals);

    // Style operation name cell
    dataRow.getCell(1).font = { bold: true };
    dataRow.getCell(1).alignment = { horizontal: "left" };

    // Style numeric cells
    for (let c = 2; c <= rowVals.length; c++) {
      const cell = dataRow.getCell(c);
      cell.alignment = { horizontal: "center" };
      cell.border = thinBorder;
      if (typeof cell.value === "number") {
        cell.numFmt = "#,##0.0";
      }
    }

    // Highlight best / worst E2E for this operation
    const numericE2e = e2eValues.filter((v) => v != null) as number[];
    if (numericE2e.length > 1) {
      const best = Math.min(...numericE2e);
      const worst = Math.max(...numericE2e);
      for (let i = 0; i < frameworks.length; i++) {
        if (e2eValues[i] === best) {
          dataRow.getCell(2 + i * 3).fill = bestFill;
        }
        if (e2eValues[i] === worst && worst !== best) {
          dataRow.getCell(2 + i * 3).fill = worstFill;
        }
      }
    }
  }

  // Auto-fit column widths
  comp.getColumn(1).width = 35;
  for (let i = 0; i < frameworks.length * 3; i++) {
    comp.getColumn(i + 2).width = 14;
  }

  /* ═══════════════════════════════════════════════════
     Sheet 2 – Raw Data
     ═══════════════════════════════════════════════════ */
  const raw = workbook.addWorksheet("Raw Data", {
    views: [{ state: "frozen", ySplit: 1 }],
  });

  const rawHeaders = ["Framework", "Operation", "E2E (ms)", "In-App (ms)", "Heap Used (MB)", "Heap Total (MB)", "Timestamp"];
  const rawHeaderRow = raw.addRow(rawHeaders);
  rawHeaderRow.eachCell((cell: any) => {
    cell.fill = headerFill;
    cell.font = headerFont;
    cell.alignment = { horizontal: "center", vertical: "middle" };
    cell.border = thinBorder;
  });

  for (const r of report.results) {
    const row = raw.addRow([
      r.framework,
      r.operation,
      r.e2eMs,
      r.inAppMs ?? "–",
      r.usedJSHeapMB ?? "–",
      r.totalJSHeapMB ?? "–",
      r.timestamp,
    ]);
    row.eachCell((cell: any, colNumber: any) => {
      cell.border = thinBorder;
      cell.alignment = { horizontal: "center" };
      if (colNumber >= 3 && colNumber <= 6) {
        if (typeof cell.value === "number") {
          cell.numFmt = colNumber >= 5 ? "#,##0.00" : "#,##0.0";
        }
      }
    });
    row.getCell(1).alignment = { horizontal: "left" };
    row.getCell(2).alignment = { horizontal: "left" };
  }

  // Auto-fit
  raw.getColumn(1).width = 14;
  raw.getColumn(2).width = 35;
  raw.getColumn(3).width = 14;
  raw.getColumn(4).width = 14;
  raw.getColumn(5).width = 16;
  raw.getColumn(6).width = 16;
  raw.getColumn(7).width = 28;

  // Auto-filter
  raw.autoFilter = { from: "A1", to: "G1" };

  /* ═══════════════════════════════════════════════════
     Sheet 3 – Summary
     ═══════════════════════════════════════════════════ */
  const summary = workbook.addWorksheet("Summary");

  // Metadata section
  const metaTitle = summary.addRow(["Run Metadata"]);
  metaTitle.getCell(1).font = { bold: true, size: 14, color: { argb: "FF1E40AF" } };
  summary.addRow([]);
  summary.addRow(["Run ID", report.runId]);
  summary.addRow(["Timestamp", report.timestamp]);
  summary.addRow(["User Agent", report.userAgent]);
  summary.addRow(["Total Measurements", report.results.length]);
  summary.addRow(["Frameworks", frameworks.join(", ")]);
  summary.addRow(["Operations", operations.length]);
  summary.addRow([]);

  // Per-framework averages section
  const avgTitle = summary.addRow(["Per-Framework Averages"]);
  avgTitle.getCell(1).font = { bold: true, size: 14, color: { argb: "FF1E40AF" } };
  summary.addRow([]);

  const avgHeaders = ["Framework", "Avg E2E (ms)", "Avg In-App (ms)", "Min E2E (ms)", "Max E2E (ms)", "Measurements"];
  const avgHeaderRow = summary.addRow(avgHeaders);
  avgHeaderRow.eachCell((cell: any) => {
    cell.fill = headerFill;
    cell.font = headerFont;
    cell.alignment = { horizontal: "center", vertical: "middle" };
    cell.border = thinBorder;
  });

  for (const fw of frameworks) {
    const fwResults = report.results.filter((r) => r.framework === fw);
    const e2eVals = fwResults.map((r) => r.e2eMs);
    const inAppVals = fwResults
      .filter((r) => r.inAppMs != null)
      .map((r) => r.inAppMs as number);

    const avgE2e = e2eVals.reduce((a, b) => a + b, 0) / e2eVals.length;
    const avgInApp =
      inAppVals.length > 0
        ? inAppVals.reduce((a, b) => a + b, 0) / inAppVals.length
        : null;

    const row = summary.addRow([
      fw,
      avgE2e,
      avgInApp ?? "–",
      Math.min(...e2eVals),
      Math.max(...e2eVals),
      fwResults.length,
    ]);
    row.eachCell((cell: any, colNumber: any) => {
      cell.border = thinBorder;
      cell.alignment = { horizontal: "center" };
      if (colNumber >= 2 && colNumber <= 5 && typeof cell.value === "number") {
        cell.numFmt = "#,##0.0";
      }
    });
    row.getCell(1).alignment = { horizontal: "left" };
    row.getCell(1).font = { bold: true };
  }

  // Auto-fit summary columns
  summary.getColumn(1).width = 22;
  summary.getColumn(2).width = 16;
  summary.getColumn(3).width = 18;
  summary.getColumn(4).width = 16;
  summary.getColumn(5).width = 16;
  summary.getColumn(6).width = 16;

  /* ── Write file ────────────────────────────────────── */
  const xlsxPath = path.join(RESULTS_DIR, `${filenamePrefix}.xlsx`);
  await workbook.xlsx.writeFile(xlsxPath);
  return xlsxPath;
}
