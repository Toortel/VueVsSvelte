<!--
  KanbanView.vue – Kanban board with drag-and-drop between status columns.
  In Svelte the equivalent is routes/kanban/+page.svelte.
  Key Vue differences:
    - ref()/computed() for reactive state (Svelte uses $state/$derived)
    - @dragstart/@drop for drag events (Svelte uses ondragstart/ondrop)
    - useRouter().push() for navigation (Svelte uses goto())
-->
<template>
  <div>
    <h2>Kanban Board</h2>

    <div v-if="loading" class="loading">Loading reports…</div>
    <div v-else-if="error" class="msg-error">{{ error }}</div>

    <div v-else class="kanban-board" data-testid="kanban-board">
      <div
        v-for="col in COLUMNS"
        :key="col.status"
        class="kanban-column"
        :class="{ 'drag-over': dragOverColumn === col.status }"
        :data-testid="'kanban-col-' + col.status"
        @dragover.prevent="dragOverColumn = col.status"
        @dragleave="dragOverColumn = null"
        @drop.prevent="onDrop($event, col.status)"
      >
        <div class="kanban-column-header" :style="{ borderTop: '3px solid ' + col.color }">
          <span>{{ col.label }}</span>
          <span class="kanban-count" :data-testid="'kanban-count-' + col.status">{{ grouped[col.status].length }}</span>
        </div>
        <div class="kanban-cards">
          <div
            v-for="report in grouped[col.status]"
            :key="report.id"
            class="kanban-card"
            :data-testid="'kanban-card-' + report.id"
            draggable="true"
            @dragstart="onDragStart($event, report.id)"
            @click="router.push('/reports/' + report.id)"
          >
            <div class="kanban-card-title">{{ report.name }}</div>
            <div class="kanban-card-meta">
              <span>{{ report.owner }}</span>
              <span class="num">{{ formatAmount(report.amount, report.currency) }}</span>
            </div>
            <div class="kanban-card-footer">
              <span :class="'badge badge-priority-' + report.priority">{{ report.priority }}</span>
              <span style="font-size: .7rem; color: #9ca3af;">{{ report.department }}</span>
            </div>
          </div>
          <div v-if="grouped[col.status].length === 0" class="kanban-empty">No reports</div>
        </div>
      </div>
    </div>
  </div>

  <!-- Toast Notifications -->
  <div v-if="toasts.length > 0" class="toast-container" data-testid="toast-container">
    <div v-for="toast in toasts" :key="toast.id" :class="'toast toast-' + toast.type" :data-testid="'toast-' + toast.type">
      {{ toast.message }}
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from "vue";
import { useRouter } from "vue-router";
import { listReports, updateReport } from "../api/reportsApi";
import type { Report, ReportStatus } from "../types/report";

const router = useRouter();

const COLUMNS: { status: ReportStatus; label: string; color: string }[] = [
  { status: "draft", label: "Draft", color: "#9ca3af" },
  { status: "published", label: "Published", color: "#10b981" },
  { status: "archived", label: "Archived", color: "#f59e0b" },
];

const reports = ref<Report[]>([]);
const loading = ref(true);
const error = ref("");

const draggedId = ref<number | null>(null);
const dragOverColumn = ref<ReportStatus | null>(null);

// Toast
const toasts = ref<{ id: number; message: string; type: "success" | "error" }[]>([]);
let toastIdCounter = 0;
function addToast(message: string, type: "success" | "error" = "success") {
  const id = toastIdCounter++;
  toasts.value.push({ id, message, type });
  setTimeout(() => { toasts.value = toasts.value.filter(t => t.id !== id); }, 3000);
}

const grouped = computed(() => {
  const map: Record<ReportStatus, Report[]> = { draft: [], published: [], archived: [] };
  for (const r of reports.value) {
    if (map[r.status]) map[r.status].push(r);
  }
  return map;
});

onMounted(async () => {
  try {
    const result = await listReports({ pageSize: 200 });
    reports.value = result.data;
  } catch (err: any) {
    error.value = err.message || "Failed to load reports";
  } finally {
    loading.value = false;
  }
});

function onDragStart(e: DragEvent, id: number) {
  draggedId.value = id;
  if (e.dataTransfer) {
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", String(id));
  }
}

async function onDrop(e: DragEvent, newStatus: ReportStatus) {
  dragOverColumn.value = null;
  if (draggedId.value == null) return;

  const report = reports.value.find(r => r.id === draggedId.value);
  if (!report || report.status === newStatus) {
    draggedId.value = null;
    return;
  }

  const oldStatus = report.status;
  report.status = newStatus;

  try {
    await updateReport(draggedId.value, { status: newStatus });
    addToast(`Moved "${report.name}" to ${newStatus}.`);
  } catch (err: any) {
    report.status = oldStatus;
    addToast(err.message || "Failed to move report", "error");
  }
  draggedId.value = null;
}

function formatAmount(amount: number, currency: string): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(amount);
}
</script>
