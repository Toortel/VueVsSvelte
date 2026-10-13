<script lang="ts">
  import { tick } from "svelte";
  import type { DataPoint, BarItem, ChartTimingResult } from "$lib/types/chartBenchmark";
  import {
    generatePoints, generateBars, updatePoints, updateBars,
  } from "$lib/types/chartBenchmark";

  let bars = $state<BarItem[]>([]);
  let scatterPoints = $state<DataPoint[]>([]);
  let linePoints = $state<DataPoint[]>([]);
  let timings = $state<ChartTimingResult[]>([]);

  const barW = 800;
  const barH = 300;
  const plotW = 800;
  const plotH = 400;

  let barMax = $derived(bars.length === 0 ? 1 : Math.max(...bars.map((b) => b.value), 1));
  let scatterMaxX = $derived(scatterPoints.length === 0 ? 1 : Math.max(...scatterPoints.map((p) => p.x), 1));
  let linePointsStr = $derived.by(() => {
    if (linePoints.length === 0) return "";
    const maxX = Math.max(...linePoints.map((p) => p.x), 1);
    return linePoints
      .map((p) => `${(p.x / maxX) * plotW},${plotH - (p.y / 1000) * plotH}`)
      .join(" ");
  });

  async function timed(operation: string, fn: () => void) {
    const t0 = performance.now();
    fn();
    await tick();
    const t1 = performance.now();
    timings = [...timings, { operation, durationMs: t1 - t0 }];
  }

  function createBarsN(n: number) { timed(`Render ${n.toLocaleString()} bars`, () => { bars = generateBars(n); }); }
  function createScatterN(n: number) { timed(`Render scatter ${n.toLocaleString()} pts`, () => { scatterPoints = generatePoints(n); }); }
  function createLineN(n: number) { timed(`Render line ${n.toLocaleString()} pts`, () => { linePoints = generatePoints(n); }); }

  function updateAll() {
    timed("Update all chart data", () => {
      if (bars.length > 0) bars = updateBars(bars);
      if (scatterPoints.length > 0) scatterPoints = updatePoints(scatterPoints);
      if (linePoints.length > 0) linePoints = updatePoints(linePoints);
    });
  }

  function clearAll() {
    timed("Clear all charts", () => {
      bars = [];
      scatterPoints = [];
      linePoints = [];
    });
  }

  function clearTimings() { timings = []; }
</script>

<div>
  <h2>📊 Charts Benchmark</h2>
  <p class="bench-subtitle">
    Bars: <strong data-testid="chart-bar-count">{bars.length}</strong>
    &nbsp;|&nbsp;Scatter points: <strong data-testid="chart-scatter-count">{scatterPoints.length}</strong>
    &nbsp;|&nbsp;Line points: <strong data-testid="chart-line-count">{linePoints.length}</strong>
  </p>

  <div class="bench-buttons" data-testid="chart-controls">
    <button class="btn btn-primary" data-testid="chart-bars-100" onclick={() => createBarsN(100)}>100 bars</button>
    <button class="btn btn-primary" data-testid="chart-bars-500" onclick={() => createBarsN(500)}>500 bars</button>
    <button class="btn btn-primary" data-testid="chart-bars-2500" onclick={() => createBarsN(2500)}>2,500 bars</button>
    <button class="btn btn-primary" data-testid="chart-bars-12500" onclick={() => createBarsN(12500)}>12,500 bars</button>
    <button class="btn btn-primary" data-testid="chart-scatter-100" onclick={() => createScatterN(100)}>Scatter 100</button>
    <button class="btn btn-primary" data-testid="chart-scatter-500" onclick={() => createScatterN(500)}>Scatter 500</button>
    <button class="btn btn-primary" data-testid="chart-scatter-2500" onclick={() => createScatterN(2500)}>Scatter 2,500</button>
    <button class="btn btn-primary" data-testid="chart-scatter-12500" onclick={() => createScatterN(12500)}>Scatter 12,500</button>
    <button class="btn btn-primary" data-testid="chart-line-100" onclick={() => createLineN(100)}>Line 100</button>
    <button class="btn btn-primary" data-testid="chart-line-500" onclick={() => createLineN(500)}>Line 500</button>
    <button class="btn btn-primary" data-testid="chart-line-2500" onclick={() => createLineN(2500)}>Line 2,500</button>
    <button class="btn btn-primary" data-testid="chart-line-12500" onclick={() => createLineN(12500)}>Line 12,500</button>
    <button class="btn btn-secondary" data-testid="chart-update-all" onclick={updateAll}>Update all data</button>
    <button class="btn btn-secondary" data-testid="chart-clear" onclick={clearAll}>Clear all</button>
  </div>

  {#if timings.length > 0}
    <div class="bench-timings card" data-testid="chart-timings">
      <h3>Timing Results</h3>
      <table>
        <thead>
          <tr><th>#</th><th>Operation</th><th>Duration</th></tr>
        </thead>
        <tbody>
          {#each timings as t, idx}
            <tr>
              <td>{idx + 1}</td>
              <td>{t.operation}</td>
              <td class="timing-value">{t.durationMs.toFixed(2)} ms</td>
            </tr>
          {/each}
        </tbody>
      </table>
      <button class="btn btn-secondary" style="margin-top:.5rem" onclick={clearTimings}>Clear log</button>
    </div>
  {/if}

  {#if bars.length > 0}
    <div class="chart-card full-width" data-testid="chart-bar-area">
      <h3>Bar Chart ({bars.length} bars)</h3>
      <svg
        viewBox="0 0 {barW} {barH}"
        class="chart-svg"
        data-testid="chart-bar-svg"
        preserveAspectRatio="none"
      >
        {#each bars as bar, i}
          <rect
            x={i * (barW / bars.length)}
            y={barH - (bar.value / barMax) * barH}
            width={Math.max(barW / bars.length - 1, 0.5)}
            height={(bar.value / barMax) * barH}
            fill={bar.color}
          />
        {/each}
      </svg>
    </div>
  {/if}

  {#if scatterPoints.length > 0}
    <div class="chart-card full-width" data-testid="chart-scatter-area">
      <h3>Scatter Plot ({scatterPoints.length} points)</h3>
      <svg
        viewBox="0 0 {plotW} {plotH}"
        class="chart-svg"
        data-testid="chart-scatter-svg"
        preserveAspectRatio="xMidYMid meet"
      >
        {#each scatterPoints as pt, i}
          <circle
            cx={(pt.x / scatterMaxX) * plotW}
            cy={plotH - (pt.y / 1000) * plotH}
            r={pt.size}
            fill={pt.color}
            opacity="0.7"
          />
        {/each}
      </svg>
    </div>
  {/if}

  {#if linePoints.length > 0}
    <div class="chart-card full-width" data-testid="chart-line-area">
      <h3>Line Chart ({linePoints.length} points)</h3>
      <svg
        viewBox="0 0 {plotW} {plotH}"
        class="chart-svg"
        data-testid="chart-line-svg"
        preserveAspectRatio="xMidYMid meet"
      >
        <polyline
          points={linePointsStr}
          fill="none"
          stroke="#2563eb"
          stroke-width="1.5"
          stroke-linejoin="round"
        />
      </svg>
    </div>
  {/if}
</div>
