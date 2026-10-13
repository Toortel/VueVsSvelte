<script lang="ts">
  import { onMount } from "svelte";
  import { navigate } from "$lib/router";
  import { listReports, updateReport } from "$lib/api/reportsApi";
  import type { Report, ReportStatus } from "$lib/types/report";

  const COLUMNS: { status: ReportStatus; label: string; color: string }[] = [
    { status: "draft", label: "Draft", color: "#9ca3af" },
    { status: "published", label: "Published", color: "#10b981" },
    { status: "archived", label: "Archived", color: "#f59e0b" },
  ];

  let reports = $state<Report[]>([]);
  let loading = $state(true);
  let error = $state("");

  let draggedId = $state<number | null>(null);
  let dragOverColumn = $state<ReportStatus | null>(null);

  let toasts = $state<{ id: number; message: string; type: "success" | "error" }[]>([]);
  let toastIdCounter = $state(0);
  function addToast(message: string, type: "success" | "error" = "success") {
    const id = toastIdCounter++;
    toasts = [...toasts, { id, message, type }];
    setTimeout(() => { toasts = toasts.filter(t => t.id !== id); }, 3000);
  }

  let grouped = $derived.by(() => {
    const map: Record<ReportStatus, Report[]> = { draft: [], published: [], archived: [] };
    for (const r of reports) {
      if (map[r.status]) map[r.status].push(r);
    }
    return map;
  });

  onMount(async () => {
    try {
      const result = await listReports({ pageSize: 200 });
      reports = result.data;
    } catch (err: any) {
      error = err.message || "Failed to load reports";
    } finally {
      loading = false;
    }
  });

  function onDragStart(e: DragEvent, id: number) {
    draggedId = id;
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", String(id));
    }
  }

  function onDragOver(e: DragEvent, status: ReportStatus) {
    e.preventDefault();
    dragOverColumn = status;
  }

  function onDragLeave() {
    dragOverColumn = null;
  }

  async function onDrop(e: DragEvent, newStatus: ReportStatus) {
    e.preventDefault();
    dragOverColumn = null;
    if (draggedId == null) return;

    const report = reports.find(r => r.id === draggedId);
    if (!report || report.status === newStatus) {
      draggedId = null;
      return;
    }

    const oldStatus = report.status;
    report.status = newStatus;
    reports = [...reports];

    try {
      await updateReport(draggedId, { status: newStatus });
      addToast(`Moved "${report.name}" to ${newStatus}.`);
    } catch (err: any) {
      report.status = oldStatus;
      reports = [...reports];
      addToast(err.message || "Failed to move report", "error");
    }
    draggedId = null;
  }

  function formatAmount(amount: number, currency: string): string {
    return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(amount);
  }
</script>

<div>
  <h2>Kanban Board</h2>

  {#if loading}
    <div class="loading">Loading reports…</div>
  {:else if error}
    <div class="msg-error">{error}</div>
  {:else}
    <div class="kanban-board" data-testid="kanban-board">
      {#each COLUMNS as col (col.status)}
        <div
          class="kanban-column"
          class:drag-over={dragOverColumn === col.status}
          data-testid="kanban-col-{col.status}"
          ondragover={(e: DragEvent) => onDragOver(e, col.status)}
          ondragleave={onDragLeave}
          ondrop={(e: DragEvent) => onDrop(e, col.status)}
        >
          <div class="kanban-column-header" style="border-top: 3px solid {col.color};">
            <span>{col.label}</span>
            <span class="kanban-count" data-testid="kanban-count-{col.status}">{grouped[col.status].length}</span>
          </div>
          <div class="kanban-cards">
            {#each grouped[col.status] as report (report.id)}
              <div
                class="kanban-card"
                data-testid="kanban-card-{report.id}"
                draggable="true"
                ondragstart={(e: DragEvent) => onDragStart(e, report.id)}
                onclick={() => navigate(`/reports/${report.id}`)}
              >
                <div class="kanban-card-title">{report.name}</div>
                <div class="kanban-card-meta">
                  <span>{report.owner}</span>
                  <span class="num">{formatAmount(report.amount, report.currency)}</span>
                </div>
                <div class="kanban-card-footer">
                  <span class="badge badge-priority-{report.priority}">{report.priority}</span>
                  <span style="font-size: .7rem; color: #9ca3af;">{report.department}</span>
                </div>
              </div>
            {/each}
            {#if grouped[col.status].length === 0}
              <div class="kanban-empty">No reports</div>
            {/if}
          </div>
        </div>
      {/each}
    </div>
  {/if}
</div>

{#if toasts.length > 0}
  <div class="toast-container" data-testid="toast-container">
    {#each toasts as toast (toast.id)}
      <div class="toast toast-{toast.type}" data-testid="toast-{toast.type}">
        {toast.message}
      </div>
    {/each}
  </div>
{/if}
