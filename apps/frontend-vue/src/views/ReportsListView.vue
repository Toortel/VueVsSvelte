<!--
  ReportsListView.vue – paginated, filterable, searchable report list with
  bulk selection, inline editing, create/delete actions, and toast notifications.
  In Svelte the equivalent is routes/reports/+page.svelte.
-->
<template>
  <div>
    <div style="display: flex; justify-content: space-between; align-items: center;">
      <h2>Reports</h2>
      <button class="btn btn-primary" data-testid="create-report-btn" @click="router.push('/reports/create')">+ New Report</button>
    </div>

    <!-- Toolbar -->
    <div class="toolbar">
      <input data-testid="search-input" type="text" placeholder="Global search…" :value="search" @input="onSearchInput" />
      <select data-testid="status-select" :value="status" @change="onStatusChange">
        <option value="">All statuses</option>
        <option value="draft">Draft</option>
        <option value="published">Published</option>
        <option value="archived">Archived</option>
      </select>
      <button class="btn btn-secondary" data-testid="sort-updatedat" @click="toggleSort">
        Updated {{ sortDir === "desc" ? "↓" : "↑" }}
      </button>
      <select data-testid="page-size-select" :value="String(pageSize)" @change="onPageSizeChange">
        <option value="10">10 / page</option>
        <option value="25">25 / page</option>
        <option value="50">50 / page</option>
      </select>
    </div>

    <!-- Bulk actions bar -->
    <div v-if="selectedIds.size > 0" class="toolbar" data-testid="bulk-actions"
      style="background: #eff6ff; padding: .5rem .75rem; border-radius: 6px; margin-bottom: .75rem;">
      <span style="font-weight: 600; font-size: .85rem;">{{ selectedIds.size }} selected</span>
      <select data-testid="bulk-status-select" v-model="bulkStatusAction"
        style="padding: .35rem .5rem; border: 1px solid #d1d5db; border-radius: 4px; font-size: .8rem;">
        <option value="">Change status…</option>
        <option value="draft">Draft</option>
        <option value="published">Published</option>
        <option value="archived">Archived</option>
      </select>
      <button class="btn btn-primary" data-testid="bulk-status-apply" @click="doBulkStatus"
        :disabled="!bulkStatusAction" style="padding: .35rem .75rem; font-size: .8rem;">Apply</button>
      <button class="btn btn-danger" data-testid="bulk-delete-btn" @click="showBulkDeleteModal = true"
        style="padding: .35rem .75rem; font-size: .8rem; border-radius: 6px; font-weight: 500; cursor: pointer;">Delete Selected</button>
    </div>

    <div v-if="loading" class="loading">Loading reports…</div>
    <div v-else-if="error" class="msg-error">
      {{ error }}
      <button class="btn btn-secondary" @click="fetchData">Retry</button>
    </div>

    <template v-else>
      <div class="table-scroll">
        <table data-testid="reports-table">
          <thead>
            <tr>
              <th style="width: 40px;">
                <input type="checkbox" data-testid="select-all" :checked="allSelected" @change="toggleAll" />
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
              <th><input data-testid="filter-name" type="text" placeholder="Filter…" :value="colFilters.name" @input="onColFilter('name', $event)" /></th>
              <th><input data-testid="filter-owner" type="text" placeholder="Filter…" :value="colFilters.owner" @input="onColFilter('owner', $event)" /></th>
              <th><input data-testid="filter-department" type="text" placeholder="Filter…" :value="colFilters.department" @input="onColFilter('department', $event)" /></th>
              <th><input data-testid="filter-category" type="text" placeholder="Filter…" :value="colFilters.category" @input="onColFilter('category', $event)" /></th>
              <th>
                <select data-testid="filter-status" :value="colFilters.status" @change="onColFilter('status', $event)">
                  <option value="">All</option>
                  <option value="draft">Draft</option>
                  <option value="published">Published</option>
                  <option value="archived">Archived</option>
                </select>
              </th>
              <th>
                <select data-testid="filter-priority" :value="colFilters.priority" @change="onColFilter('priority', $event)">
                  <option value="">All</option>
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="critical">Critical</option>
                </select>
              </th>
              <th></th>
              <th><input data-testid="filter-currency" type="text" placeholder="Filter…" :value="colFilters.currency" @input="onColFilter('currency', $event)" /></th>
              <th><input data-testid="filter-tags" type="text" placeholder="Filter…" :value="colFilters.tags" @input="onColFilter('tags', $event)" /></th>
              <th><input data-testid="filter-approvedBy" type="text" placeholder="Filter…" :value="colFilters.approvedBy" @input="onColFilter('approvedBy', $event)" /></th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="r in reports" :key="r.id" :data-testid="'row-' + r.id">
              <td @click.stop>
                <input type="checkbox" :data-testid="'select-' + r.id" :checked="selectedIds.has(r.id)" @change="toggleRow(r.id)" />
              </td>
              <!-- Inline editable: Name -->
              <td @dblclick="cancelClickNav(); startInlineEdit(r.id, 'name', r.name)" class="clickable">
                <template v-if="editingCell?.id === r.id && editingCell.field === 'name'">
                  <input :data-testid="'inline-name-' + r.id" type="text" v-model="editValue"
                    @blur="saveInlineEdit"
                    @keydown.enter="saveInlineEdit" @keydown.escape="cancelInlineEdit"
                    style="width: 100%; padding: .2rem .4rem; border: 2px solid #3b82f6; border-radius: 4px; font-size: .85rem;"
                  />
                </template>
                <span v-else @click="goToEdit(r.id)">{{ r.name }}</span>
              </td>
              <!-- Inline editable: Owner -->
              <td @dblclick="startInlineEdit(r.id, 'owner', r.owner)" class="clickable">
                <template v-if="editingCell?.id === r.id && editingCell.field === 'owner'">
                  <input :data-testid="'inline-owner-' + r.id" type="text" v-model="editValue"
                    @blur="saveInlineEdit"
                    @keydown.enter="saveInlineEdit" @keydown.escape="cancelInlineEdit"
                    style="width: 100%; padding: .2rem .4rem; border: 2px solid #3b82f6; border-radius: 4px; font-size: .85rem;"
                  />
                </template>
                <template v-else>{{ r.owner }}</template>
              </td>
              <td>{{ r.department }}</td>
              <td>{{ r.category }}</td>
              <td><span :class="'badge badge-' + r.status">{{ r.status }}</span></td>
              <td><span :class="'badge badge-priority-' + r.priority">{{ r.priority }}</span></td>
              <td class="num">{{ formatAmount(r.amount, r.currency) }}</td>
              <td>{{ r.currency }}</td>
              <td>{{ r.tags }}</td>
              <td>{{ r.approvedBy || "—" }}</td>
              <td>{{ formatDate(r.updatedAt) }}</td>
            </tr>
            <tr v-if="reports.length === 0">
              <td colspan="12" class="empty-state">No reports found.</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="pagination">
        <button class="btn btn-secondary" data-testid="pagination-prev" :disabled="page <= 1" @click="page--">← Prev</button>
        <span data-testid="pagination-info">Page {{ page }} of {{ totalPages }}</span>
        <button class="btn btn-secondary" data-testid="pagination-next" :disabled="page >= totalPages" @click="page++">Next →</button>
      </div>
    </template>
  </div>

  <!-- Bulk Delete Modal -->
  <div v-if="showBulkDeleteModal" class="modal-overlay" data-testid="bulk-delete-modal" @click="showBulkDeleteModal = false">
    <div class="modal-content" @click.stop>
      <h3>Delete {{ selectedIds.size }} Report(s)</h3>
      <p>Are you sure you want to delete {{ selectedIds.size }} selected report(s)? This cannot be undone.</p>
      <div style="display: flex; gap: .5rem; margin-top: 1rem; justify-content: flex-end;">
        <button class="btn btn-secondary" data-testid="modal-cancel" @click="showBulkDeleteModal = false">Cancel</button>
        <button class="btn btn-danger" data-testid="modal-confirm"
          style="padding: .5rem 1rem; border-radius: 6px; font-size: .875rem; font-weight: 500; cursor: pointer;"
          @click="confirmBulkDelete">Delete</button>
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
import { ref, reactive, computed, watchEffect } from "vue";
import { useRouter } from "vue-router";
import { listReports, updateReport, bulkAction } from "../api/reportsApi";
import type { Report } from "../types/report";

const router = useRouter();

const search = ref("");
const status = ref("");
const sortDir = ref<"asc" | "desc">("desc");
const page = ref(1);
const pageSize = ref(10);

const colFilters = reactive({
  name: "", owner: "", department: "", category: "",
  status: "", priority: "", currency: "", tags: "", approvedBy: "",
});

const reports = ref<Report[]>([]);
const totalCount = ref(0);
const loading = ref(false);
const error = ref("");

const totalPages = computed(() => Math.max(1, Math.ceil(totalCount.value / pageSize.value)));

// ── Bulk selection ──
const selectedIds = ref<Set<number>>(new Set());
const bulkStatusAction = ref("");
const showBulkDeleteModal = ref(false);

const allSelected = computed(() =>
  reports.value.length > 0 && reports.value.every(r => selectedIds.value.has(r.id))
);

function toggleAll() {
  if (allSelected.value) {
    selectedIds.value = new Set();
  } else {
    selectedIds.value = new Set(reports.value.map(r => r.id));
  }
}

function toggleRow(id: number) {
  const next = new Set(selectedIds.value);
  if (next.has(id)) next.delete(id); else next.add(id);
  selectedIds.value = next;
}

async function doBulkStatus() {
  if (!bulkStatusAction.value || selectedIds.value.size === 0) return;
  try {
    await bulkAction([...selectedIds.value], "updateStatus", bulkStatusAction.value);
    addToast(`Updated ${selectedIds.value.size} report(s) to "${bulkStatusAction.value}".`);
    selectedIds.value = new Set();
    bulkStatusAction.value = "";
    await fetchData();
  } catch (err: any) {
    addToast(err.message || "Bulk status update failed", "error");
  }
}

async function confirmBulkDelete() {
  try {
    await bulkAction([...selectedIds.value], "delete");
    addToast(`Deleted ${selectedIds.value.size} report(s).`);
    selectedIds.value = new Set();
    await fetchData();
  } catch (err: any) {
    addToast(err.message || "Bulk delete failed", "error");
  } finally {
    showBulkDeleteModal.value = false;
  }
}

// ── Inline editing ──
const editingCell = ref<{ id: number; field: string } | null>(null);
const editValue = ref("");

function startInlineEdit(id: number, field: string, currentValue: string) {
  editingCell.value = { id, field };
  editValue.value = currentValue;
}

async function saveInlineEdit() {
  if (!editingCell.value) return;
  const { id, field } = editingCell.value;
  try {
    await updateReport(id, { [field]: editValue.value });
    const report = reports.value.find(r => r.id === id);
    if (report) (report as any)[field] = editValue.value;
    addToast("Field updated.");
  } catch (err: any) {
    addToast(err.message || "Inline edit failed", "error");
  }
  editingCell.value = null;
}

function cancelInlineEdit() {
  editingCell.value = null;
}

// ── Toast ──
const toasts = ref<{ id: number; message: string; type: "success" | "error" }[]>([]);
let toastIdCounter = 0;
function addToast(message: string, type: "success" | "error" = "success") {
  const id = toastIdCounter++;
  toasts.value.push({ id, message, type });
  setTimeout(() => { toasts.value = toasts.value.filter(t => t.id !== id); }, 3000);
}

// ── Debounced search ──
let debounceTimer: ReturnType<typeof setTimeout>;
function onSearchInput(e: Event) {
  const val = (e.target as HTMLInputElement).value;
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => { search.value = val; page.value = 1; }, 300);
}

let colDebounce: ReturnType<typeof setTimeout>;
function onColFilter(field: keyof typeof colFilters, e: Event) {
  const val = (e.target as HTMLInputElement | HTMLSelectElement).value;
  clearTimeout(colDebounce);
  colDebounce = setTimeout(() => { colFilters[field] = val; page.value = 1; }, 300);
}

function onStatusChange(e: Event) { status.value = (e.target as HTMLSelectElement).value; page.value = 1; }
function onPageSizeChange(e: Event) { pageSize.value = Number((e.target as HTMLSelectElement).value); page.value = 1; }
function toggleSort() { sortDir.value = sortDir.value === "desc" ? "asc" : "desc"; }

async function fetchData() {
  loading.value = true;
  error.value = "";
  try {
    const result = await listReports({
      page: page.value, pageSize: pageSize.value,
      q: search.value || undefined,
      status: (status.value || colFilters.status) as any || undefined,
      sort: `updatedAt:${sortDir.value}`,
      name: colFilters.name || undefined, owner: colFilters.owner || undefined,
      department: colFilters.department || undefined, category: colFilters.category || undefined,
      priority: colFilters.priority as any || undefined, tags: colFilters.tags || undefined,
      approvedBy: colFilters.approvedBy || undefined, currency: colFilters.currency || undefined,
    });
    reports.value = result.data;
    totalCount.value = result.totalCount;
  } catch (err: any) {
    error.value = err.message || "Failed to load reports";
  } finally {
    loading.value = false;
  }
}

watchEffect(() => {
  void (search.value, status.value, sortDir.value, page.value, pageSize.value,
    colFilters.name, colFilters.owner, colFilters.department, colFilters.category,
    colFilters.status, colFilters.priority, colFilters.currency, colFilters.tags,
    colFilters.approvedBy);
  fetchData();
});

let clickTimer: ReturnType<typeof setTimeout> | null = null;
function goToEdit(id: number) {
  if (clickTimer) clearTimeout(clickTimer);
  clickTimer = setTimeout(() => router.push(`/reports/${id}`), 250);
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
