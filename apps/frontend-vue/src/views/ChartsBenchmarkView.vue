<!--
  ChartsBenchmarkView.vue – SVG chart rendering performance stress-test.
  Identical operations in Svelte (routes/charts/+page.svelte)
  and Solid (views/ChartsBenchmarkView.tsx).

  All charts are rendered via the framework's own template system (v-for / SVG)
  so rendering goes through Vue's virtual DOM, making it a real framework benchmark.

  Operations (each timed via performance.now()):
  1.  Render bar chart with 100 bars
  2.  Render bar chart with 1,000 bars
  3.  Render scatter plot with 1,000 points
  4.  Render scatter plot with 10,000 points
  5.  Render line chart with 1,000 points
  6.  Render line chart with 10,000 points
  7.  Update all data points
  8.  Append 500 points to scatter
  9.  Clear all charts
-->
<template>
  <div>
    <h2>📊 Charts Benchmark</h2>
    <p class="bench-subtitle">
      Bars: <strong data-testid="chart-bar-count">{{ bars.length }}</strong>
      &nbsp;|&nbsp;Scatter points: <strong data-testid="chart-scatter-count">{{ scatterPoints.length }}</strong>
      &nbsp;|&nbsp;Line points: <strong data-testid="chart-line-count">{{ linePoints.length }}</strong>
    </p>

    <!-- Action buttons -->
    <div class="bench-buttons" data-testid="chart-controls">
      <button class="btn btn-primary" data-testid="chart-bars-100" @click="createBarsN(100)">100 bars</button>
      <button class="btn btn-primary" data-testid="chart-bars-500" @click="createBarsN(500)">500 bars</button>
      <button class="btn btn-primary" data-testid="chart-bars-2500" @click="createBarsN(2500)">2,500 bars</button>
      <button class="btn btn-primary" data-testid="chart-bars-12500" @click="createBarsN(12500)">12,500 bars</button>
      <button class="btn btn-primary" data-testid="chart-scatter-100" @click="createScatterN(100)">Scatter 100</button>
      <button class="btn btn-primary" data-testid="chart-scatter-500" @click="createScatterN(500)">Scatter 500</button>
      <button class="btn btn-primary" data-testid="chart-scatter-2500" @click="createScatterN(2500)">Scatter 2,500</button>
      <button class="btn btn-primary" data-testid="chart-scatter-12500" @click="createScatterN(12500)">Scatter 12,500</button>
      <button class="btn btn-primary" data-testid="chart-line-100" @click="createLineN(100)">Line 100</button>
      <button class="btn btn-primary" data-testid="chart-line-500" @click="createLineN(500)">Line 500</button>
      <button class="btn btn-primary" data-testid="chart-line-2500" @click="createLineN(2500)">Line 2,500</button>
      <button class="btn btn-primary" data-testid="chart-line-12500" @click="createLineN(12500)">Line 12,500</button>
      <button class="btn btn-secondary" data-testid="chart-update-all" @click="updateAll">Update all data</button>
      <button class="btn btn-secondary" data-testid="chart-clear" @click="clearAll">Clear all</button>
    </div>

    <!-- Timing results log -->
    <div v-if="timings.length > 0" class="bench-timings card" data-testid="chart-timings">
      <h3>Timing Results</h3>
      <table>
        <thead>
          <tr><th>#</th><th>Operation</th><th>Duration</th></tr>
        </thead>
        <tbody>
          <tr v-for="(t, idx) in timings" :key="idx">
            <td>{{ idx + 1 }}</td>
            <td>{{ t.operation }}</td>
            <td class="timing-value">{{ t.durationMs.toFixed(2) }} ms</td>
          </tr>
        </tbody>
      </table>
      <button class="btn btn-secondary" style="margin-top:.5rem" @click="timings = []">Clear log</button>
    </div>

    <!-- Bar chart -->
    <div v-if="bars.length > 0" class="chart-card full-width" data-testid="chart-bar-area">
      <h3>Bar Chart ({{ bars.length }} bars)</h3>
      <svg
        :viewBox="`0 0 ${barW} ${barH}`"
        class="chart-svg"
        data-testid="chart-bar-svg"
        preserveAspectRatio="none"
      >
        <rect
          v-for="(bar, i) in bars"
          :key="i"
          :x="i * (barW / bars.length)"
          :y="barH - (bar.value / barMax) * barH"
          :width="Math.max(barW / bars.length - 1, 0.5)"
          :height="(bar.value / barMax) * barH"
          :fill="bar.color"
        />
      </svg>
    </div>

    <!-- Scatter plot -->
    <div v-if="scatterPoints.length > 0" class="chart-card full-width" data-testid="chart-scatter-area">
      <h3>Scatter Plot ({{ scatterPoints.length }} points)</h3>
      <svg
        :viewBox="`0 0 ${plotW} ${plotH}`"
        class="chart-svg"
        data-testid="chart-scatter-svg"
        preserveAspectRatio="xMidYMid meet"
      >
        <circle
          v-for="(pt, i) in scatterPoints"
          :key="i"
          :cx="(pt.x / scatterMaxX) * plotW"
          :cy="plotH - (pt.y / 1000) * plotH"
          :r="pt.size"
          :fill="pt.color"
          opacity="0.7"
        />
      </svg>
    </div>

    <!-- Line chart -->
    <div v-if="linePoints.length > 0" class="chart-card full-width" data-testid="chart-line-area">
      <h3>Line Chart ({{ linePoints.length }} points)</h3>
      <svg
        :viewBox="`0 0 ${plotW} ${plotH}`"
        class="chart-svg"
        data-testid="chart-line-svg"
        preserveAspectRatio="xMidYMid meet"
      >
        <polyline
          :points="linePointsStr"
          fill="none"
          stroke="#2563eb"
          stroke-width="1.5"
          stroke-linejoin="round"
        />
      </svg>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, nextTick } from "vue";
import type { DataPoint, BarItem, ChartTimingResult } from "../types/chartBenchmark";
import {
  generatePoints, generateBars, updatePoints, updateBars,
} from "../types/chartBenchmark";

// ── State ──
const bars = ref<BarItem[]>([]);
const scatterPoints = ref<DataPoint[]>([]);
const linePoints = ref<DataPoint[]>([]);
const timings = ref<ChartTimingResult[]>([]);

// ── SVG sizing constants ──
const barW = 800;
const barH = 300;
const plotW = 800;
const plotH = 400;

// ── Derived ──
const barMax = computed(() => {
  if (bars.value.length === 0) return 1;
  return Math.max(...bars.value.map((b) => b.value), 1);
});

const scatterMaxX = computed(() => {
  if (scatterPoints.value.length === 0) return 1;
  return Math.max(...scatterPoints.value.map((p) => p.x), 1);
});

const linePointsStr = computed(() => {
  if (linePoints.value.length === 0) return "";
  const maxX = Math.max(...linePoints.value.map((p) => p.x), 1);
  return linePoints.value
    .map((p) => `${(p.x / maxX) * plotW},${plotH - (p.y / 1000) * plotH}`)
    .join(" ");
});

// ── Timing helper (measures after nextTick) ──
async function timed(operation: string, fn: () => void) {
  const t0 = performance.now();
  fn();
  await nextTick();
  const t1 = performance.now();
  timings.value = [...timings.value, { operation, durationMs: t1 - t0 }];
}

// ── Bars N ──
function createBarsN(n: number) { timed(`Render ${n.toLocaleString()} bars`, () => { bars.value = generateBars(n); }); }

// ── Scatter N ──
function createScatterN(n: number) { timed(`Render scatter ${n.toLocaleString()} pts`, () => { scatterPoints.value = generatePoints(n); }); }

// ── Line N ──
function createLineN(n: number) { timed(`Render line ${n.toLocaleString()} pts`, () => { linePoints.value = generatePoints(n); }); }

// ── Update all data ──
function updateAll() {
  timed("Update all chart data", () => {
    if (bars.value.length > 0) bars.value = updateBars(bars.value);
    if (scatterPoints.value.length > 0) scatterPoints.value = updatePoints(scatterPoints.value);
    if (linePoints.value.length > 0) linePoints.value = updatePoints(linePoints.value);
  });
}

// ── Clear all ──
function clearAll() {
  timed("Clear all charts", () => {
    bars.value = [];
    scatterPoints.value = [];
    linePoints.value = [];
  });
}
</script>
