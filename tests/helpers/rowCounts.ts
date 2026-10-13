/**
 * rowCounts.ts – single source of truth for the benchmark row scales
 * and their execution order.
 *
 * Both benchmark.spec.ts and memory-usage.spec.ts import from here so the
 * scales (and any randomized ordering) stay in sync across suites.
 */

export const BASE_ROW_COUNTS = [100, 500, 2_500, 12_500] as const;

/* ── Cell-matrix (rows × cols) shapes ─────────────────────
   Constant cell budget: rows × cols is always CELL_BUDGET, so any timing
   difference between shapes isolates the effect of column count. */

export const CELL_BUDGET = 12_500;

export interface GridShape {
  rows: number;
  cols: number;
}

export const BASE_GRID_SHAPES: readonly GridShape[] = [
  { rows: 12_500, cols: 1 },
  { rows: 2_500, cols: 5 },
  { rows: 1_250, cols: 10 },
  { rows: 500, cols: 25 },
  { rows: 250, cols: 50 },
];

/* ── Column-scaling (static rows, add cols) shapes ────────
   Static row counts; for each, C columns are ADDED to the table.
   Combinations whose total cell count exceeds MAX_CELLS are skipped
   (a 12,500×12,500 DOM table is not renderable). */

export const COLUMN_TEST_ROW_COUNTS = [1, 100, 500, 2_500] as const;
export const COLUMN_TEST_COL_COUNTS = [1, 100, 500, 2_500] as const;

/** Cell-count cap for the column-scaling matrix (override via BENCH_MAX_CELLS) */
export const MAX_CELLS =
  parseInt(process.env.BENCH_MAX_CELLS ?? "", 10) || 2_000_000;

export const BASE_COLUMN_SHAPES: readonly GridShape[] =
  COLUMN_TEST_ROW_COUNTS.flatMap((rows) =>
    COLUMN_TEST_COL_COUNTS.map((cols) => ({ rows, cols })),
  ).filter((s) => !(s.rows === 2_500 && s.cols === 2_500)); // ~6.25M cells – not renderable

/* ── Cell-type benchmark ──────────────────────────────── */

export const CELL_TYPES = ["text", "integer", "float", "image-png"] as const;
export type CellType = (typeof CELL_TYPES)[number];

/* ── Positional grid-ops benchmark (@gridops) ─────────── */

/** Base grids on which positional add/delete/edit ops run (rows × total cols). */
export const GRIDOPS_SHAPES: readonly GridShape[] = [
  { rows: 50, cols: 5 },
  { rows: 100, cols: 5 },
  { rows: 250, cols: 5 },
  { rows: 500, cols: 5 },
  { rows: 50, cols: 10 },
  { rows: 100, cols: 10 },
  { rows: 250, cols: 10 },
  { rows: 500, cols: 10 },
  { rows: 50, cols: 25 },
  { rows: 100, cols: 25 },
  { rows: 250, cols: 25 },
  { rows: 500, cols: 25 },
  { rows: 50, cols: 50 },
  { rows: 100, cols: 50 },
  { rows: 250, cols: 50 },
  { rows: 500, cols: 50 },
];

/** Batch sizes for positional add/delete operations. */
export const GRIDOPS_BATCHES = [1, 25, 50, 100, 500] as const;
// Image cells: large batches flood the vite server (unique cache-busting URLs,
// 20+ min per op) and measure the server, not the framework – use smaller batches
export const GRIDOPS_IMAGE_BATCHES = [1, 25, 50, 100] as const;

/** Insertion/deletion strategies: FIFO (start), center (middle), LIFO (end). */
export const GRIDOPS_POSITIONS = ["start", "middle", "end"] as const;
export type GridOpsPosition = (typeof GRIDOPS_POSITIONS)[number];

/** Positions for single-target ops (edit/update/read) – deterministic only. */
export const GRIDOPS_EDIT_POSITIONS = ["start", "middle", "end"] as const;

/**
 * Fisher-Yates shuffle.
 *
 * When BENCH_SEED is set the order is deterministic. The current iteration
 * (BENCH_ITERATION, injected by run-benchmarks.ts) is folded into the seed so
 * that *each iteration gets a different but reproducible order*. Without a seed
 * the order is fully random (Math.random).
 */
export function shuffle<T>(input: readonly T[]): T[] {
  const arr = [...input];
  const seed = process.env.BENCH_SEED;
  // Deterministic PRNG (mulberry32) when a seed is provided, else Math.random.
  let rng: () => number;
  if (seed !== undefined) {
    // Combine the base seed with the iteration so every iteration differs.
    const iteration = process.env.BENCH_ITERATION ?? "0";
    const seedStr = `${seed}#${iteration}`;
    let h = 1779033703 ^ seedStr.length;
    for (let i = 0; i < seedStr.length; i++) {
      h = Math.imul(h ^ seedStr.charCodeAt(i), 3432918353);
      h = (h << 13) | (h >>> 19);
    }
    let a = h >>> 0;
    rng = () => {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  } else {
    rng = Math.random;
  }
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * Returns the row-count execution order for a run and logs it once.
 *
 * With the same BENCH_SEED, all suites share the same order *within a given
 * iteration*, but the order changes from one iteration to the next
 * (BENCH_ITERATION is mixed into the seed).
 *
 * @param suite - short label used in the log line (e.g. "benchmark", "memory").
 */
export function getRowCountOrder(suite: string): number[] {
  const order = shuffle(BASE_ROW_COUNTS);
  const seed = process.env.BENCH_SEED;
  const iteration = process.env.BENCH_ITERATION;
  const suffix = seed
    ? ` (seed="${seed}"${iteration ? `, iteration=${iteration}` : ""})`
    : " (random)";
  console.log(
    `[${suite}] Row-count execution order: ${order
      .map((n) => n.toLocaleString())
      .join(" → ")}${suffix}`,
  );
  return order;
}

/**
 * Returns the grid-shape execution order for a cell-matrix run and logs it once.
 * Same seeding behaviour as getRowCountOrder.
 */
export function getGridShapeOrder(suite: string): GridShape[] {
  const order = shuffle(BASE_GRID_SHAPES);
  const seed = process.env.BENCH_SEED;
  const iteration = process.env.BENCH_ITERATION;
  const suffix = seed
    ? ` (seed="${seed}"${iteration ? `, iteration=${iteration}` : ""})`
    : " (random)";
  console.log(
    `[${suite}] Grid-shape execution order (${CELL_BUDGET.toLocaleString()} cells each): ${order
      .map((s) => `${s.rows.toLocaleString()}×${s.cols}`)
      .join(" → ")}${suffix}`,
  );
  return order;
}

/**
 * Returns the column-scaling execution order (rows × added-cols matrix) and
 * logs it once. Same seeding behaviour as getRowCountOrder. Shapes exceeding
 * MAX_CELLS are still included – the spec skips them so the skip is visible.
 */
export function getColumnShapeOrder(suite: string): GridShape[] {
  const order = shuffle(BASE_COLUMN_SHAPES);
  const seed = process.env.BENCH_SEED;
  const iteration = process.env.BENCH_ITERATION;
  const suffix = seed
    ? ` (seed="${seed}"${iteration ? `, iteration=${iteration}` : ""})`
    : " (random)";
  console.log(
    `[${suite}] Column-shape execution order (max ${MAX_CELLS.toLocaleString()} cells): ${order
      .map((s) => `${s.rows.toLocaleString()}r+${s.cols.toLocaleString()}c`)
      .join(" → ")}${suffix}`,
  );
  return order;
}

/**
 * Returns the cell-type execution order and logs it once.
 * Same seeding behaviour as getRowCountOrder.
 */
export function getCellTypeOrder(suite: string): CellType[] {
  const order = shuffle(CELL_TYPES);
  const seed = process.env.BENCH_SEED;
  const iteration = process.env.BENCH_ITERATION;
  const suffix = seed
    ? ` (seed="${seed}"${iteration ? `, iteration=${iteration}` : ""})`
    : " (random)";
  console.log(
    `[${suite}] Cell-type execution order: ${order.join(" → ")}${suffix}`,
  );
  return order;
}

/**
 * Returns the grid-ops base-shape execution order and logs it once.
 * Same seeding behaviour as getRowCountOrder.
 */
export function getGridOpsShapeOrder(suite: string): GridShape[] {
  const order = shuffle(GRIDOPS_SHAPES);
  const seed = process.env.BENCH_SEED;
  const iteration = process.env.BENCH_ITERATION;
  const suffix = seed
    ? ` (seed="${seed}"${iteration ? `, iteration=${iteration}` : ""})`
    : " (random)";
  console.log(
    `[${suite}] Grid-ops shape execution order: ${order
      .map((s) => `${s.rows.toLocaleString()}×${s.cols.toLocaleString()}`)
      .join(" → ")}${suffix}`,
  );
  return order;
}
