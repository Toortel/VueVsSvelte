<script lang="ts">
  import { onMount } from "svelte";
  import { navigate } from "$lib/router";
  import { listReports, updateReport, deleteReport, bulkAction } from "$lib/api/reportsApi";
  import type { Report } from "$lib/types/report";

  // ── Reactive state ──
  let search = $state("");
  let status = $state("");
  let sortDir = $state<"asc" | "desc">("desc");
  let page = $state(1);
  let pageSize = $state(10);

  // Per-column filters
  let colFilters = $state({
    name: "",
    owner: "",
    department: "",
    category: "",
    status: "",
    priority: "",
    currency: "",
    tags: "",
    approvedBy: "",
  });

  let reports = $state<Report[]>([]);
  let totalCount = $state(0);
  let loading = $state(false);
  let error = $state("");

  let totalPages = $derived(Math.max(1, Math.ceil(totalCount / pageSize)));

  // ── Bulk selection ──
  let selectedIds = $state<Set<number>>(new Set());
  let allSelected = $derived(reports.length > 0 && reports.every(r => selectedIds.has(r.id)));
  let bulkStatusAction = $state("");

  function toggleAll() {
    if (allSelected) {
      selectedIds = new Set();
    } else {
      selectedIds = new Set(reports.map(r => r.id));
    }
  }

  function toggleRow(id: number) {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id); else next.add(id);
    selectedIds = next;
  }

  async function doBulkStatus() {
    if (!bulkStatusAction || selectedIds.size === 0) return;
    try {
      await bulkAction([...selectedIds], "updateStatus", bulkStatusAction);
      addToast(`Updated ${selectedIds.size} report(s) to "${bulkStatusAction}".`);
      selectedIds = new Set();
      bulkStatusAction = "";
      await fetchData();
    } catch (err: any) {
      addToast(err.message || "Bulk status update failed", "error");
    }
  }

  async function doBulkDelete() {
    if (selectedIds.size === 0) return;
    showBulkDeleteModal = true;
  }

  async function confirmBulkDelete() {
    try {
      await bulkAction([...selectedIds], "delete");
      addToast(`Deleted ${selectedIds.size} report(s).`);
      selectedIds = new Set();
      await fetchData();
    } catch (err: any) {
      addToast(err.message || "Bulk delete failed", "error");
    } finally {
      showBulkDeleteModal = false;
    }
  }

  // ── Inline editing ──
  let editingCell = $state<{ id: number; field: string } | null>(null);
  let editValue = $state("");

  function startInlineEdit(id: number, field: string, currentValue: string) {
    editingCell = { id, field };
    editValue = currentValue;
  }

  async function saveInlineEdit() {
    if (!editingCell) return;
    const { id, field } = editingCell;
    try {
      await updateReport(id, { [field]: editValue });
      const report = reports.find(r => r.id === id);
      if (report) (report as any)[field] = editValue;
      addToast("Field updated.");
    } catch (err: any) {
      addToast(err.message || "Inline edit failed", "error");
    }
    editingCell = null;
  }

  function cancelInlineEdit() {
    editingCell = null;
  }

  // ── Toast notifications ──
  let toasts = $state<{ id: number; message: string; type: "success" | "error" }[]>([]);
  let toastIdCounter = $state(0);
  let showBulkDeleteModal = $state(false);

  function addToast(message: string, type: "success" | "error" = "success") {
    const id = toastIdCounter++;
    toasts = [...toasts, { id, message, type }];
    setTimeout(() => { toasts = toasts.filter(t => t.id !== id); }, 3000);
  }

  // ── Debounced search ──
  let debounceTimer: ReturnType<typeof setTimeout>;
  function onSearchInput(e: Event) {
    const val = (e.target as HTMLInputElement).value;
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      search = val;
      page = 1;
    }, 300);
  }

  let colDebounce: ReturnType<typeof setTimeout>;
  function onColFilter(field: keyof typeof colFilters, e: Event) {
    const val = (e.target as HTMLInputElement | HTMLSelectElement).value;
    clearTimeout(colDebounce);
    colDebounce = setTimeout(() => {
      colFilters[field] = val;
      page = 1;
    }, 300);
  }

  function onStatusChange(e: Event) {
    status = (e.target as HTMLSelectElement).value;
    page = 1;
  }

  function onPageSizeChange(e: Event) {
    pageSize = Number((e.target as HTMLSelectElement).value);
    page = 1;
  }

  function toggleSort() {
    sortDir = sortDir === "desc" ? "asc" : "desc";
  }

  async function fetchData() {
    loading = true;
    error = "";
    try {
      const result = await listReports({
        page,
        pageSize,
        q: search || undefined,
        status: (status || colFilters.status) as any || undefined,
        sort: `updatedAt:${sortDir}`,
        name: colFilters.name || undefined,
        owner: colFilters.owner || undefined,
        department: colFilters.department || undefined,
        category: colFilters.category || undefined,
        priority: colFilters.priority as any || undefined,
        tags: colFilters.tags || undefined,
        approvedBy: colFilters.approvedBy || undefined,
        currency: colFilters.currency || undefined,
      });
      reports = result.data;
      totalCount = result.totalCount;
    } catch (err: any) {
      error = err.message || "Failed to load reports";
    } finally {
      loading = false;
    }
  }

  $effect(() => {
    void (search, status, sortDir, page, pageSize,
      colFilters.name, colFilters.owner, colFilters.department, colFilters.category,
      colFilters.status, colFilters.priority, colFilters.currency, colFilters.tags,
      colFilters.approvedBy);
    fetchData();
  });

  let clickTimer: ReturnType<typeof setTimeout> | null = null;

  function goToEdit(id: number) {
    if (clickTimer) clearTimeout(clickTimer);
    clickTimer = setTimeout(() => navigate(`/reports/${id}`), 250);
  }

  function cancelClickNav() {
    if (clickTimer) { clearTimeout(clickTimer); clickTimer = null; }
  }

  function formatAmount(amount: number, currency: string): string {
    return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(amount);
  }

  function formatDate(iso: string): string {
    return new Date(iso).toLocaleDateString("en-US", {
      year: "numeric", month: "short", day: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  }
</script>

<div>
  <div style="display: flex; justify-content: space-between; align-items: center;">
    <h2>Reports</h2>
    <button class="btn btn-primary" data-testid="create-report-btn" onclick={() => navigate("/reports/create")}>+ New Report</button>
  </div>

  <!-- Toolbar -->
  <div class="toolbar">
    <input
      data-testid="search-input"
      type="text"
      placeholder="Global search…"
      value={search}
      oninput={onSearchInput}
    />
    <select data-testid="status-select" value={status} onchange={onStatusChange}>
      <option value="">All statuses</option>
      <option value="draft">Draft</option>
      <option value="published">Published</option>
      <option value="archived">Archived</option>
    </select>
    <button
      class="btn btn-secondary"
      data-testid="sort-updatedat"
      onclick={toggleSort}
    >
      Updated {sortDir === "desc" ? "↓" : "↑"}
    </button>
    <select data-testid="page-size-select" value={String(pageSize)} onchange={onPageSizeChange}>
      <option value="10">10 / page</option>
      <option value="25">25 / page</option>
      <option value="50">50 / page</option>
    </select>
  </div>

  <!-- Bulk actions bar -->
  {#if selectedIds.size > 0}
    <div class="toolbar" data-testid="bulk-actions" style="background: #eff6ff; padding: .5rem .75rem; border-radius: 6px; margin-bottom: .75rem;">
      <span style="font-weight: 600; font-size: .85rem;">{selectedIds.size} selected</span>
      <select data-testid="bulk-status-select" bind:value={bulkStatusAction} style="padding: .35rem .5rem; border: 1px solid #d1d5db; border-radius: 4px; font-size: .8rem;">
        <option value="">Change status…</option>
        <option value="draft">Draft</option>
        <option value="published">Published</option>
        <option value="archived">Archived</option>
      </select>
      <button class="btn btn-primary" data-testid="bulk-status-apply" onclick={doBulkStatus} disabled={!bulkStatusAction} style="padding: .35rem .75rem; font-size: .8rem;">Apply</button>
      <button class="btn btn-danger" data-testid="bulk-delete-btn" onclick={doBulkDelete} style="padding: .35rem .75rem; font-size: .8rem; border-radius: 6px; font-weight: 500; cursor: pointer;">Delete Selected</button>
    </div>
  {/if}

  {#if loading}
    <div class="loading">Loading reports…</div>
  {:else if error}
    <div class="msg-error">
      {error}
      <button class="btn btn-secondary" onclick={fetchData}>Retry</button>
    </div>
  {:else}
    <div class="table-scroll">
      <table data-testid="reports-table">
        <thead>
          <tr>
            <th style="width: 40px;">
              <input type="checkbox" data-testid="select-all" checked={allSelected} onchange={toggleAll} />
            </th>
            <th>Name</th>
            <th>Owner</th>
            <th>Department</th>
            <th>Category</th>
            <th>Status</th>
            <th>Priority</th>
            <th>Amount</th>
            <th>Currency</th>
            <th>Tags</th>
            <th>Approved By</th>
            <th>Updated At</th>
          </tr>
          <tr class="filter-row">
            <th></th>
            <th><input data-testid="filter-name" type="text" placeholder="Filter…" value={colFilters.name} oninput={(e: Event) => onColFilter('name', e)} /></th>
            <th><input data-testid="filter-owner" type="text" placeholder="Filter…" value={colFilters.owner} oninput={(e: Event) => onColFilter('owner', e)} /></th>
            <th><input data-testid="filter-department" type="text" placeholder="Filter…" value={colFilters.department} oninput={(e: Event) => onColFilter('department', e)} /></th>
            <th><input data-testid="filter-category" type="text" placeholder="Filter…" value={colFilters.category} oninput={(e: Event) => onColFilter('category', e)} /></th>
            <th>
              <select data-testid="filter-status" value={colFilters.status} onchange={(e: Event) => onColFilter('status', e)}>
                <option value="">All</option>
                <option value="draft">Draft</option>
                <option value="published">Published</option>
                <option value="archived">Archived</option>
              </select>
            </th>
            <th>
              <select data-testid="filter-priority" value={colFilters.priority} onchange={(e: Event) => onColFilter('priority', e)}>
                <option value="">All</option>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="critical">Critical</option>
              </select>
            </th>
            <th></th>
            <th><input data-testid="filter-currency" type="text" placeholder="Filter…" value={colFilters.currency} oninput={(e: Event) => onColFilter('currency', e)} /></th>
            <th><input data-testid="filter-tags" type="text" placeholder="Filter…" value={colFilters.tags} oninput={(e: Event) => onColFilter('tags', e)} /></th>
            <th><input data-testid="filter-approvedBy" type="text" placeholder="Filter…" value={colFilters.approvedBy} oninput={(e: Event) => onColFilter('approvedBy', e)} /></th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {#each reports as r (r.id)}
            <tr data-testid="row-{r.id}">
              <td onclick={(e: Event) => e.stopPropagation()}>
                <input type="checkbox" data-testid="select-{r.id}" checked={selectedIds.has(r.id)} onchange={() => toggleRow(r.id)} />
              </td>
              <!-- Inline editable: Name -->
              <td ondblclick={() => { cancelClickNav(); startInlineEdit(r.id, 'name', r.name); }} class="clickable">
                {#if editingCell?.id === r.id && editingCell.field === 'name'}
                  <input data-testid="inline-name-{r.id}" type="text" bind:value={editValue}
                    onblur={saveInlineEdit}
                    onkeydown={(e: KeyboardEvent) => { if (e.key === 'Enter') saveInlineEdit(); if (e.key === 'Escape') cancelInlineEdit(); }}
                    style="width: 100%; padding: .2rem .4rem; border: 2px solid #3b82f6; border-radius: 4px; font-size: .85rem;"
                  />
                {:else}
                  <span onclick={() => goToEdit(r.id)}>{r.name}</span>
                {/if}
              </td>
              <!-- Inline editable: Owner -->
              <td ondblclick={() => startInlineEdit(r.id, 'owner', r.owner)} class="clickable">
                {#if editingCell?.id === r.id && editingCell.field === 'owner'}
                  <input data-testid="inline-owner-{r.id}" type="text" bind:value={editValue}
                    onblur={saveInlineEdit}
                    onkeydown={(e: KeyboardEvent) => { if (e.key === 'Enter') saveInlineEdit(); if (e.key === 'Escape') cancelInlineEdit(); }}
                    style="width: 100%; padding: .2rem .4rem; border: 2px solid #3b82f6; border-radius: 4px; font-size: .85rem;"
                  />
                {:else}
                  {r.owner}
                {/if}
              </td>
              <td>{r.department}</td>
              <td>{r.category}</td>
              <td>
                <span class="badge badge-{r.status}">{r.status}</span>
              </td>
              <td>
                <span class="badge badge-priority-{r.priority}">{r.priority}</span>
              </td>
              <td class="num">{formatAmount(r.amount, r.currency)}</td>
              <td>{r.currency}</td>
              <td>{r.tags}</td>
              <td>{r.approvedBy || "—"}</td>
              <td>{formatDate(r.updatedAt)}</td>
            </tr>
          {/each}
          {#if reports.length === 0}
            <tr>
              <td colspan="12" class="empty-state">No reports found.</td>
            </tr>
          {/if}
        </tbody>
      </table>
    </div>

    <div class="pagination">
      <button
        class="btn btn-secondary"
        data-testid="pagination-prev"
        disabled={page <= 1}
        onclick={() => page--}
      >
        ← Prev
      </button>
      <span data-testid="pagination-info">Page {page} of {totalPages}</span>
      <button
        class="btn btn-secondary"
        data-testid="pagination-next"
        disabled={page >= totalPages}
        onclick={() => page++}
      >
        Next →
      </button>
    </div>
  {/if}
</div>

<!-- Bulk Delete Modal -->
{#if showBulkDeleteModal}
  <div class="modal-overlay" data-testid="bulk-delete-modal" onclick={() => showBulkDeleteModal = false}>
    <div class="modal-content" onclick={(e) => e.stopPropagation()}>
      <h3>Delete {selectedIds.size} Report(s)</h3>
      <p>Are you sure you want to delete {selectedIds.size} selected report(s)? This cannot be undone.</p>
      <div style="display: flex; gap: .5rem; margin-top: 1rem; justify-content: flex-end;">
        <button class="btn btn-secondary" data-testid="modal-cancel" onclick={() => showBulkDeleteModal = false}>Cancel</button>
        <button class="btn btn-danger" data-testid="modal-confirm" style="padding: .5rem 1rem; border-radius: 6px; font-size: .875rem; font-weight: 500; cursor: pointer;" onclick={confirmBulkDelete}>Delete</button>
      </div>
    </div>
  </div>
{/if}

<!-- Toast Notifications -->
{#if toasts.length > 0}
  <div class="toast-container" data-testid="toast-container">
    {#each toasts as toast (toast.id)}
      <div class="toast toast-{toast.type}" data-testid="toast-{toast.type}">
        {toast.message}
      </div>
    {/each}
  </div>
{/if}
