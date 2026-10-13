<script lang="ts">
  import { onMount } from "svelte";
  import { listReports } from "$lib/api/reportsApi";
  import type { Report } from "$lib/types/report";

  let reports = $state<Report[]>([]);
  let loading = $state(true);
  let error = $state("");

  const trendW = 700;
  const trendH = 220;
  const pad = 30;

  async function fetchData() {
    loading = true;
    error = "";
    try {
      const result = await listReports({ pageSize: 200 });
      reports = result.data;
    } catch (err: any) {
      error = err.message || "Failed to load dashboard data";
    } finally {
      loading = false;
    }
  }

  onMount(fetchData);

  const statusColors: Record<string, string> = {
    draft: "#9ca3af",
    published: "#10b981",
    archived: "#f59e0b",
  };

  let amountByStatus = $derived.by(() => {
    const map: Record<string, number> = { draft: 0, published: 0, archived: 0 };
    for (const r of reports) map[r.status] = (map[r.status] || 0) + r.amount;
    const max = Math.max(...Object.values(map), 1);
    return Object.entries(map).map(([status, total]) => ({
      status,
      total,
      pct: (total / max) * 100,
      color: statusColors[status] || "#3b82f6",
    }));
  });

  let topOwners = $derived.by(() => {
    const map: Record<string, number> = {};
    for (const r of reports) map[r.owner] = (map[r.owner] || 0) + r.amount;
    const sorted = Object.entries(map)
      .map(([owner, total]) => ({ owner, total }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 5);
    const max = sorted[0]?.total || 1;
    return sorted.map((s) => ({ ...s, pct: (s.total / max) * 100 }));
  });

  let trendData = $derived.by(() => {
    const days: { label: string; date: string; count: number }[] = [];
    const now = new Date();
    for (let i = 13; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const iso = d.toISOString().slice(0, 10);
      days.push({ label: `${d.getMonth() + 1}/${d.getDate()}`, date: iso, count: 0 });
    }
    for (const r of reports) {
      const day = r.updatedAt.slice(0, 10);
      const entry = days.find((d) => d.date === day);
      if (entry) entry.count++;
    }
    return days;
  });

  let trendCoords = $derived.by(() => {
    const data = trendData;
    const maxCount = Math.max(...data.map((d) => d.count), 1);
    const xStep = (trendW - 2 * pad) / (data.length - 1 || 1);
    return data.map((d, i) => ({
      x: pad + i * xStep,
      y: trendH - pad - ((d.count / maxCount) * (trendH - 2 * pad)),
    }));
  });

  let trendPoints = $derived(
    trendCoords.map((p) => `${p.x},${p.y}`).join(" ")
  );

  function fmtK(n: number): string {
    if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
    if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
    return n.toFixed(0);
  }
</script>

<div>
  <h2>Dashboard</h2>

  {#if loading}
    <div class="loading">Loading dashboard data…</div>
  {:else if error}
    <div class="msg-error">
      {error}
      <button class="btn btn-secondary" onclick={fetchData}>Retry</button>
    </div>
  {:else}
    <div class="dashboard-grid">
      <div class="chart-card" data-testid="chart-status">
        <h3>Total Amount by Status</h3>
        {#each amountByStatus as item (item.status)}
          <div class="bar-row">
            <span class="bar-label">{item.status}</span>
            <div class="bar-track">
              <div
                class="bar-fill"
                style="width: {item.pct}%; background: {item.color}"
              ></div>
            </div>
            <span class="bar-value">{fmtK(item.total)}</span>
          </div>
        {/each}
      </div>

      <div class="chart-card" data-testid="chart-topowners">
        <h3>Top 5 Owners by Amount</h3>
        {#each topOwners as item (item.owner)}
          <div class="bar-row">
            <span class="bar-label">{item.owner.split(' ')[0]}</span>
            <div class="bar-track">
              <div
                class="bar-fill"
                style="width: {item.pct}%; background: #3b82f6"
              ></div>
            </div>
            <span class="bar-value">{fmtK(item.total)}</span>
          </div>
        {/each}
      </div>

      <div class="chart-card full-width" data-testid="chart-trend">
        <h3>Reports Updated per Day (Last 14 Days)</h3>
        <svg viewBox="0 0 {trendW} {trendH}" style="width:100%;height:200px;">
          {#each [1,2,3,4,5] as i}
            <line
              x1={pad} x2={trendW - pad}
              y1={pad + ((trendH - 2*pad) / 5) * i}
              y2={pad + ((trendH - 2*pad) / 5) * i}
              stroke="#e5e7eb" stroke-width="1"
            />
          {/each}
          <polyline
            points={trendPoints}
            fill="none" stroke="#2563eb" stroke-width="2.5" stroke-linejoin="round"
          />
          {#each trendCoords as pt, i}
            <circle
              cx={pt.x} cy={pt.y} r="3.5" fill="#2563eb"
            />
          {/each}
          {#each trendData as d, i}
            <text
              x={trendCoords[i]?.x} y={trendH - 2}
              text-anchor="middle" font-size="9" fill="#6b7280"
            >
              {d.label}
            </text>
          {/each}
        </svg>
      </div>
    </div>
  {/if}
</div>
