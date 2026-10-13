/**
 * Chart benchmark types – IDENTICAL across Vue / Svelte.
 *
 * Used for SVG chart performance stress-testing: rendering large datasets
 * as bar charts, scatter plots, and line charts through the framework's
 * own template/reactivity system.
 */

export interface DataPoint {
  x: number;
  y: number;
  color: string;
  size: number;
}

export interface BarItem {
  label: string;
  value: number;
  color: string;
}

export interface ChartTimingResult {
  operation: string;
  durationMs: number;
}

/* ── Colour palette ─────────────────────────────────── */

const PALETTE = [
  "#2563eb", "#dc2626", "#16a34a", "#ca8a04", "#9333ea",
  "#0891b2", "#e11d48", "#65a30d", "#c026d3", "#ea580c",
  "#4f46e5", "#059669", "#d97706", "#7c3aed", "#0d9488",
];

/* ── Data generation helpers ────────────────────────── */

function randomBetween(min: number, max: number): number {
  return Math.random() * (max - min) + min;
}

function pickColor(index: number): string {
  return PALETTE[index % PALETTE.length];
}

/** Generate N scatter/line data points with x in [0, count], y in [0, 1000] */
export function generatePoints(count: number): DataPoint[] {
  const points: DataPoint[] = [];
  for (let i = 0; i < count; i++) {
    points.push({
      x: i,
      y: randomBetween(0, 1000),
      color: pickColor(i),
      size: randomBetween(2, 6),
    });
  }
  return points;
}

/** Generate N bar items with random values in [10, 500] */
export function generateBars(count: number): BarItem[] {
  const bars: BarItem[] = [];
  for (let i = 0; i < count; i++) {
    bars.push({
      label: `B${i + 1}`,
      value: randomBetween(10, 500),
      color: pickColor(i),
    });
  }
  return bars;
}

/** Re-randomise y values of all points (simulates data update) */
export function updatePoints(points: DataPoint[]): DataPoint[] {
  return points.map((p) => ({
    ...p,
    y: randomBetween(0, 1000),
  }));
}

/** Re-randomise values of all bars */
export function updateBars(bars: BarItem[]): BarItem[] {
  return bars.map((b) => ({
    ...b,
    value: randomBetween(10, 500),
  }));
}
