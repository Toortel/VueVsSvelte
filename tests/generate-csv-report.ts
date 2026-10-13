/**
 * generate-csv-report.ts – Aggregate a benchmark CSV produced by
 * run-benchmarks.ts into an HTML comparison report.
 *
 * Groups rows by framework + operation, aggregates across iterations
 * (median for all metrics, min/max for E2E) and renders a Vue-vs-Svelte
 * table per cell-type/section with the faster framework highlighted.
 *
 * Usage: npx tsx generate-csv-report.ts <path-to-csv> [output.html]
 */
import * as fs from "node:fs";
import * as path from "node:path";

interface Row {
  iteration: number;
  framework: string;
  operation: string;
  e2eMs: number;
  inAppMs: number | null;
  usedHeapMB: number | null;
}

/* ── CSV parsing (handles quoted fields with commas) ── */
function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') inQuotes = false;
      else cur += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ",") { fields.push(cur); cur = ""; }
    else cur += ch;
  }
  fields.push(cur);
  return fields;
}

function loadCsv(csvPath: string): Row[] {
  const lines = fs.readFileSync(csvPath, "utf-8").split(/\r?\n/).filter((l) => l.trim());
  const header = parseCsvLine(lines[0]);
  const idx = (name: string) => header.indexOf(name);
  const iIter = idx("iteration"), iFw = idx("framework"), iOp = idx("operation");
  const iE2e = idx("e2e_ms"), iInApp = idx("in_app_ms"), iHeap = idx("used_js_heap_mb");
  return lines.slice(1).map((line) => {
    const f = parseCsvLine(line);
    return {
      iteration: Number(f[iIter]),
      framework: f[iFw],
      operation: f[iOp],
      e2eMs: Number(f[iE2e]),
      inAppMs: f[iInApp] !== "" ? Number(f[iInApp]) : null,
      usedHeapMB: iHeap >= 0 && f[iHeap] !== "" ? Number(f[iHeap]) : null,
    };
  });
}

/* ── Aggregation ── */
function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

interface Agg {
  n: number;
  e2eMed: number;
  e2eMin: number;
  e2eMax: number;
  inAppMed: number | null;
  heapMed: number | null;
}

function aggregate(rows: Row[]): Agg {
  const e2e = rows.map((r) => r.e2eMs);
  const inApp = rows.map((r) => r.inAppMs).filter((v): v is number => v != null);
  const heap = rows.map((r) => r.usedHeapMB).filter((v): v is number => v != null);
  return {
    n: rows.length,
    e2eMed: median(e2e),
    e2eMin: Math.min(...e2e),
    e2eMax: Math.max(...e2e),
    inAppMed: inApp.length ? median(inApp) : null,
    heapMed: heap.length ? median(heap) : null,
  };
}

/** Section key: the [tag] in the operation label, or "other" */
function sectionOf(op: string): string {
  const m = op.match(/\[([^\]]+)\]/);
  return m ? m[1] : "other";
}

function fmt(v: number | null, digits = 1): string {
  return v == null ? "–" : v.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

/* ── Main ── */
const csvPath = process.argv[2];
if (!csvPath || !fs.existsSync(csvPath)) {
  console.error("Usage: npx tsx generate-csv-report.ts <path-to-csv> [output.html]");
  process.exit(1);
}
const outPath = process.argv[3] ?? csvPath.replace(/\.csv$/, "-report.html");

const rows = loadCsv(csvPath);
const frameworks = [...new Set(rows.map((r) => r.framework))];
const iterations = new Set(rows.map((r) => r.iteration)).size;
// preserve first-seen operation order
const operations = [...new Set(rows.map((r) => r.operation))];

const agg = new Map<string, Agg>(); // "fw|op" -> Agg
for (const fw of frameworks) {
  for (const op of operations) {
    const subset = rows.filter((r) => r.framework === fw && r.operation === op);
    if (subset.length) agg.set(`${fw}|${op}`, aggregate(subset));
  }
}

/* Wins + overall stats (based on median E2E) */
const wins = new Map<string, number>(frameworks.map((f) => [f, 0]));
const ratios: number[] = []; // fw[0] / fw[1]
for (const op of operations) {
  const a = agg.get(`${frameworks[0]}|${op}`);
  const b = agg.get(`${frameworks[1]}|${op}`);
  if (!a || !b) continue;
  wins.set(a.e2eMed <= b.e2eMed ? frameworks[0] : frameworks[1],
    (wins.get(a.e2eMed <= b.e2eMed ? frameworks[0] : frameworks[1]) ?? 0) + 1);
  ratios.push(a.e2eMed / b.e2eMed);
}

/* Sections in first-seen order */
const sections = [...new Set(operations.map(sectionOf))];

let body = "";
for (const sec of sections) {
  const secOps = operations.filter((op) => sectionOf(op) === sec);
  let trs = "";
  for (const op of secOps) {
    const aggs = frameworks.map((fw) => agg.get(`${fw}|${op}`));
    const meds = aggs.map((a) => a?.e2eMed ?? Infinity);
    const best = Math.min(...meds);
    const cells = aggs
      .map((a, i) => {
        const cls = meds[i] === best ? ' class="best"' : "";
        if (!a) return `<td>–</td><td>–</td><td>–</td><td>–</td>`;
        return (
          `<td${cls}>${fmt(a.e2eMed)}</td>` +
          `<td class="range">${fmt(a.e2eMin)} – ${fmt(a.e2eMax)}</td>` +
          `<td>${fmt(a.inAppMed)}</td>` +
          `<td>${fmt(a.heapMed, 2)}</td>`
        );
      })
      .join("");
    const [a, b] = aggs;
    const delta =
      a && b && b.e2eMed > 0
        ? `${a.e2eMed <= b.e2eMed ? frameworks[0] : frameworks[1]} × ${fmt(Math.max(a.e2eMed, b.e2eMed) / Math.min(a.e2eMed, b.e2eMed), 2)}`
        : "–";
    trs += `<tr><td class="op">${op}</td>${cells}<td class="delta">${delta}</td></tr>\n`;
  }
  const fwHead = frameworks.map((fw) => `<th colspan="4">${fw}</th>`).join("");
  const subHead = frameworks
    .map(() => `<th>E2E med (ms)</th><th>E2E min–max</th><th>In-app med (ms)</th><th>Heap med (MB)</th>`)
    .join("");
  body += `
  <h2>${sec}</h2>
  <table>
    <thead>
      <tr><th rowspan="2">Operation</th>${fwHead}<th rowspan="2">Faster (×)</th></tr>
      <tr>${subHead}</tr>
    </thead>
    <tbody>${trs}</tbody>
  </table>`;
}

const medianRatio = ratios.length ? median(ratios) : 1;
const overall =
  medianRatio <= 1
    ? `${frameworks[0]} is faster on the median operation (×${fmt(1 / medianRatio, 2)})`
    : `${frameworks[1]} is faster on the median operation (×${fmt(medianRatio, 2)})`;

const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Benchmark report – ${path.basename(csvPath)}</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; max-width: 1400px; margin: 2rem auto; padding: 0 1rem; background: #f8fafc; color: #1a1a2e; }
  h1 { color: #1e40af; } h2 { color: #1e40af; margin-top: 2.5rem; }
  .meta { color: #6b7280; font-size: .9rem; margin-bottom: 1.5rem; }
  .summary { background: #fff; border: 1px solid #e2e8f0; border-radius: 8px; padding: 1rem 1.25rem; margin-bottom: 1rem; }
  table { width: 100%; border-collapse: collapse; background: #fff; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden; font-size: .85rem; }
  th { background: #1e40af; color: #fff; padding: .5rem .6rem; font-size: .72rem; text-transform: uppercase; }
  td { padding: .4rem .6rem; border-top: 1px solid #eef2f7; text-align: right; font-variant-numeric: tabular-nums; }
  td.op { text-align: left; font-weight: 500; white-space: nowrap; }
  td.best { background: #dcfce7; font-weight: 600; }
  td.range { color: #9ca3af; font-size: .78rem; white-space: nowrap; }
  td.delta { color: #6b7280; white-space: nowrap; }
</style>
</head>
<body>
<h1>Benchmark report</h1>
<div class="meta">Source: ${path.basename(csvPath)} · ${iterations} iterations · ${operations.length} operations · frameworks: ${frameworks.join(", ")}</div>
<div class="summary">
  <strong>Overall:</strong> ${overall}.
  Wins by median E2E: ${frameworks.map((f) => `${f} ${wins.get(f) ?? 0}`).join(" · ")}.
  All values are medians across ${iterations} iterations; green = faster framework (median E2E).
</div>
${body}
</body>
</html>`;

fs.writeFileSync(outPath, html);
console.log(`Report written: ${outPath}`);
console.log(`  ${overall}`);
console.log(`  Wins: ${frameworks.map((f) => `${f}=${wins.get(f) ?? 0}`).join(", ")} of ${ratios.length} ops`);
