/**
 * Benchmark types – IDENTICAL across Vue / Svelte.
 *
 * Used for framework performance stress-testing: bulk create, update,
 * delete, swap, select, deep nesting, etc.
 */

/** Cell content: numbers for integer/float types, strings for text/image types */
export type CellValue = string | number;

export interface BenchmarkRow {
  id: number;
  label: CellValue;
  className: string;           // "" or "highlight"
  children: BenchmarkRow[];    // for nested-tree benchmark
  cells: CellValue[];          // extra data columns (beyond label) for the cell-matrix benchmark
}

export interface TimingResult {
  operation: string;
  durationMs: number;
}

/** Content type used for generated cells (cell-type benchmark) */
export type CellType = "text" | "integer" | "float" | "image" | "image-png";

/* ── Data-generation helpers ─────────────────────────────── */

const adjectives = [
  "pretty", "large", "big", "small", "tall", "short", "long",
  "handsome", "plain", "quaint", "clean", "elegant", "easy",
  "angry", "crazy", "helpful", "mushy", "odd", "unsightly",
  "adorable", "important", "inexpensive", "cheap", "expensive", "fancy",
];

const colours = [
  "red", "yellow", "blue", "green", "pink", "brown", "purple",
  "orange", "white", "black", "grey", "violet", "cyan", "magenta",
];

const nouns = [
  "table", "chair", "house", "bbq", "desk", "car", "pony", "cookie",
  "sandwich", "burger", "pizza", "mouse", "keyboard", "monitor",
  "laptop", "phone", "garden", "flower", "river", "mountain",
];

let nextId = 1;
let nextImageIndex = 0;

/** Inline data: URIs — zero network cost; the unique #_N fragment keeps every cell's src distinct */
const IMAGE_BASE =
  "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 16 16'><rect width='16' height='16' rx='3' fill='%2342b883'/><circle cx='8' cy='8' r='4' fill='%23fff'/></svg>";
const IMAGE_PNG_BASE =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAAA8SURBVDhPY3Da0fyfEsyALkAqHs4GYAPoanAagA+gq6W+AYQAunoMAwgZgq6WNgbgMgRdDV4DiMXDwAAAWBDBH3nfNdMAAAAASUVORK5CYII=";

function randomPick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

/** Random cell value (same word pool as labels) */
function buildCellValue(): string {
  return `${randomPick(adjectives)} ${randomPick(colours)} ${randomPick(nouns)}`;
}

/** Generate a cell value of the given content type */
export function buildCellValueOfType(type: CellType): CellValue {
  switch (type) {
    case "integer":
      return Math.floor(Math.random() * 100_000);
    case "float":
      return Math.round(Math.random() * 100_000 * 10_000) / 10_000; // ≤4 decimal places
    case "image":
      return `${IMAGE_BASE}#_${nextImageIndex++}`;
    case "image-png":
      return `${IMAGE_PNG_BASE}#_${nextImageIndex++}`;
    default:
      return buildCellValue();
  }
}

/** True when a cell value is an image URL (rendered as <img>) */
export function isImageCell(value: CellValue): value is string {
  return typeof value === "string" && (value.startsWith(IMAGE_BASE) || value.startsWith(IMAGE_PNG_BASE));
}

/** Generate `count` cell values of the given type (used by the add-columns op) */
export function buildCells(count: number, cellType: CellType = "text"): CellValue[] {
  const cells: CellValue[] = [];
  for (let i = 0; i < count; i++) cells.push(buildCellValueOfType(cellType));
  return cells;
}

/** Generate a single row with an auto-incrementing id and `extraCols` extra cells */
export function buildRow(extraCols = 0, cellType: CellType = "text"): BenchmarkRow {
  return {
    id: nextId++,
    label: buildCellValueOfType(cellType),
    className: "",
    children: [],
    cells: buildCells(extraCols, cellType),
  };
}

/** Generate N flat rows, each with `extraCols` extra data columns */
export function buildRows(count: number, extraCols = 0, cellType: CellType = "text"): BenchmarkRow[] {
  const rows: BenchmarkRow[] = [];
  for (let i = 0; i < count; i++) rows.push(buildRow(extraCols, cellType));
  return rows;
}

/** Build a deeply nested tree: each node has `breadth` children, `depth` levels deep */
export function buildNestedTree(depth: number, breadth: number): BenchmarkRow[] {
  if (depth <= 0) return [];
  const nodes: BenchmarkRow[] = [];
  for (let i = 0; i < breadth; i++) {
    const row = buildRow();
    row.children = buildNestedTree(depth - 1, breadth);
    nodes.push(row);
  }
  return nodes;
}

/** Count total nodes in a tree (for display) */
export function countNodes(rows: BenchmarkRow[]): number {
  let count = 0;
  for (const r of rows) {
    count += 1 + countNodes(r.children);
  }
  return count;
}

/** Reset the auto-increment id (useful between full clears) */
export function resetId(): void {
  nextId = 1;
  nextImageIndex = 0;
}
