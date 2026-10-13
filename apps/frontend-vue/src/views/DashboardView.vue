<!--
  DashboardView.vue – 3 charts built with inline SVG/HTML bars.
  In Svelte the equivalent is routes/dashboard/+page.svelte.
  Key Vue differences:
    - computed() for derived aggregations (Svelte uses $derived)
    - onMounted() for data fetch (Svelte uses onMount())
-->
<template>
  <div>
    <h2>Dashboard</h2>

    <div v-if="loading" class="loading">Loading dashboard data…</div>
    <div v-else-if="error" class="msg-error">
      {{ error }}
      <button class="btn btn-secondary" @click="fetchData">Retry</button>
    </div>

    <div v-else class="dashboard-grid">
      <!-- Chart 1: Amount by Status (horizontal bars) -->
      <div class="chart-card" data-testid="chart-status">
        <h3>Total Amount by Status</h3>
        <div v-for="item in amountByStatus" :key="item.status" class="bar-row">
          <span class="bar-label">{{ item.status }}</span>
          <div class="bar-track">
            <div
              class="bar-fill"
              :style="{ width: item.pct + '%', background: item.color }"
            ></div>
          </div>
          <span class="bar-value">{{ fmtK(item.total) }}</span>
        </div>
      </div>

      <!-- Chart 2: Top 5 Owners (horizontal bars) -->
      <div class="chart-card" data-testid="chart-topowners">
        <h3>Top 5 Owners by Amount</h3>
        <div v-for="item in topOwners" :key="item.owner" class="bar-row">
          <span class="bar-label">{{ item.owner.split(' ')[0] }}</span>
          <div class="bar-track">
            <div
              class="bar-fill"
              :style="{ width: item.pct + '%', background: '#3b82f6' }"
            ></div>
          </div>
          <span class="bar-value">{{ fmtK(item.total) }}</span>
        </div>
      </div>

      <!-- Chart 3: Trend – reports updated per day (last 14 days) SVG line chart -->
      <div class="chart-card full-width" data-testid="chart-trend">
        <h3>Reports Updated per Day (Last 14 Days)</h3>
        <svg :viewBox="'0 0 ' + trendW + ' ' + trendH" style="width:100%;height:200px;">
          <!-- grid lines -->
          <line
            v-for="i in 5" :key="'g'+i"
            :x1="pad" :x2="trendW - pad"
            :y1="pad + ((trendH - 2*pad) / 5) * i"
            :y2="pad + ((trendH - 2*pad) / 5) * i"
            stroke="#e5e7eb" stroke-width="1"
          />
          <!-- line -->
          <polyline
            :points="trendPoints"
            fill="none" stroke="#2563eb" stroke-width="2.5" stroke-linejoin="round"
          />
          <!-- dots -->
          <circle
            v-for="(pt, i) in trendCoords" :key="'d'+i"
            :cx="pt.x" :cy="pt.y" r="3.5" fill="#2563eb"
          />
          <!-- x labels -->
          <text
            v-for="(d, i) in trendData" :key="'l'+i"
            :x="trendCoords[i]?.x" :y="trendH - 2"
            text-anchor="middle" font-size="9" fill="#6b7280"
          >
            {{ d.label }}
          </text>
        </svg>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from "vue";
import { listReports } from "../api/reportsApi";
import type { Report } from "../types/report";

const reports = ref<Report[]>([]);
const loading = ref(true);
const error = ref("");

// SVG sizing constants
const trendW = 700;
const trendH = 220;
const pad = 30;

async function fetchData() {
  loading.value = true;
  error.value = "";
  try {
    const result = await listReports({ pageSize: 200 });
    reports.value = result.data;
  } catch (err: any) {
    error.value = err.message || "Failed to load dashboard data";
  } finally {
    loading.value = false;
  }
}

onMounted(fetchData);

// ── Aggregation 1: Amount by Status ──
const statusColors: Record<string, string> = {
  draft: "#9ca3af",
  published: "#10b981",
  archived: "#f59e0b",
};

const amountByStatus = computed(() => {
  const map: Record<string, number> = { draft: 0, published: 0, archived: 0 };
  for (const r of reports.value) map[r.status] = (map[r.status] || 0) + r.amount;
  const max = Math.max(...Object.values(map), 1);
  return Object.entries(map).map(([status, total]) => ({
    status,
    total,
    pct: (total / max) * 100,
    color: statusColors[status] || "#3b82f6",
  }));
});

// ── Aggregation 2: Top 5 Owners ──
const topOwners = computed(() => {
  const map: Record<string, number> = {};
  for (const r of reports.value) map[r.owner] = (map[r.owner] || 0) + r.amount;
  const sorted = Object.entries(map)
    .map(([owner, total]) => ({ owner, total }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 5);
  const max = sorted[0]?.total || 1;
  return sorted.map((s) => ({ ...s, pct: (s.total / max) * 100 }));
});

// ── Aggregation 3: Trend (last 14 days) ──
const trendData = computed(() => {
  const days: { label: string; date: string; count: number }[] = [];
  const now = new Date();
  for (let i = 13; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const iso = d.toISOString().slice(0, 10);
    days.push({ label: `${d.getMonth() + 1}/${d.getDate()}`, date: iso, count: 0 });
  }
  for (const r of reports.value) {
    const day = r.updatedAt.slice(0, 10);
    const entry = days.find((d) => d.date === day);
    if (entry) entry.count++;
  }
  return days;
});

const trendCoords = computed(() => {
  const data = trendData.value;
  const maxCount = Math.max(...data.map((d) => d.count), 1);
  const xStep = (trendW - 2 * pad) / (data.length - 1 || 1);
  return data.map((d, i) => ({
    x: pad + i * xStep,
    y: trendH - pad - ((d.count / maxCount) * (trendH - 2 * pad)),
  }));
});

const trendPoints = computed(() =>
  trendCoords.value.map((p) => `${p.x},${p.y}`).join(" ")
);

// ── Helpers ──
function fmtK(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return n.toFixed(0);
}
</script>
