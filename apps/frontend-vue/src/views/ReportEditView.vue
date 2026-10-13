<!--
  ReportEditView.vue – edit form with validation, line items, delete with modal, toast.
  In Svelte the equivalent is routes/reports/[id]/+page.svelte.
-->
<template>
  <div>
    <button class="btn btn-secondary" data-testid="back-button" @click="goBack">← Back to list</button>

    <h2 style="margin: 1rem 0">Edit Report #{{ reportId }}</h2>

    <div v-if="loading" class="loading">Loading report…</div>

    <div v-else-if="fetchError" class="msg-error" data-testid="error-message">{{ fetchError }}</div>

    <form v-else data-testid="report-form" class="card" @submit.prevent="onSubmit">
      <div v-if="successMsg" class="msg-success" data-testid="success-message">{{ successMsg }}</div>
      <div v-if="saveError" class="msg-error" data-testid="error-message">{{ saveError }}</div>

      <div class="form-grid">
        <div class="form-group">
          <label>ID</label>
          <input type="text" :value="form.id" disabled />
        </div>

        <div class="form-group">
          <label for="name">Name *</label>
          <input id="name" data-testid="name-input" type="text" v-model="form.name" />
          <span v-if="errors.name" class="field-error">{{ errors.name }}</span>
        </div>

        <div class="form-group">
          <label for="owner">Owner *</label>
          <input id="owner" data-testid="owner-input" type="text" v-model="form.owner" />
          <span v-if="errors.owner" class="field-error">{{ errors.owner }}</span>
        </div>

        <div class="form-group">
          <label for="status">Status *</label>
          <select id="status" data-testid="status-input" v-model="form.status">
            <option value="draft">Draft</option>
            <option value="published">Published</option>
            <option value="archived">Archived</option>
          </select>
        </div>

        <div class="form-group">
          <label for="amount">Amount *</label>
          <input id="amount" data-testid="amount-input" type="number" step="0.01" v-model.number="form.amount" />
          <span v-if="errors.amount" class="field-error">{{ errors.amount }}</span>
        </div>

        <div class="form-group">
          <label for="currency">Currency *</label>
          <select id="currency" data-testid="currency-input" v-model="form.currency">
            <option value="PLN">PLN</option>
            <option value="EUR">EUR</option>
            <option value="USD">USD</option>
            <option value="GBP">GBP</option>
            <option value="CHF">CHF</option>
          </select>
        </div>

        <div class="form-group">
          <label for="department">Department</label>
          <input id="department" data-testid="department-input" type="text" v-model="form.department" />
        </div>

        <div class="form-group">
          <label for="category">Category</label>
          <input id="category" data-testid="category-input" type="text" v-model="form.category" />
        </div>

        <div class="form-group">
          <label for="priority">Priority</label>
          <select id="priority" data-testid="priority-input" v-model="form.priority">
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
            <option value="critical">Critical</option>
          </select>
        </div>

        <div class="form-group">
          <label for="tags">Tags</label>
          <input id="tags" data-testid="tags-input" type="text" placeholder="comma-separated" v-model="form.tags" />
        </div>

        <div class="form-group">
          <label for="approvedBy">Approved By</label>
          <input id="approvedBy" data-testid="approvedBy-input" type="text" v-model="form.approvedBy" />
        </div>

        <div class="form-group">
          <label for="periodFrom">Period From *</label>
          <input id="periodFrom" data-testid="periodFrom-input" type="date" v-model="form.periodFrom" />
          <span v-if="errors.periodFrom" class="field-error">{{ errors.periodFrom }}</span>
        </div>

        <div class="form-group">
          <label for="periodTo">Period To *</label>
          <input id="periodTo" data-testid="periodTo-input" type="date" v-model="form.periodTo" />
          <span v-if="errors.periodTo" class="field-error">{{ errors.periodTo }}</span>
        </div>

        <div class="form-group">
          <label>Updated At</label>
          <input type="text" :value="form.updatedAt" disabled />
        </div>

        <div class="form-group full-width">
          <label for="description">Description</label>
          <textarea id="description" data-testid="description-input" rows="3" v-model="form.description"></textarea>
          <span v-if="errors.description" class="field-error">{{ errors.description }}</span>
        </div>
      </div>

      <!-- Line Items -->
      <div class="line-items" data-testid="line-items-section" style="margin-top: 1.5rem;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: .75rem;">
          <h3 style="font-size: .95rem; color: #374151;">Line Items</h3>
          <button type="button" class="btn btn-secondary" data-testid="add-line-item" @click="addLineItem">+ Add Item</button>
        </div>

        <table v-if="form.lineItems.length > 0" data-testid="line-items-table">
          <thead>
            <tr>
              <th>Description</th>
              <th>Quantity</th>
              <th>Unit Price</th>
              <th>Total</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(item, i) in form.lineItems" :key="item.id" :data-testid="'line-item-' + item.id">
              <td>
                <input :data-testid="'li-desc-' + item.id" type="text" v-model="item.description" placeholder="Item description"
                  style="width: 100%; padding: .3rem .5rem; border: 1px solid #d1d5db; border-radius: 4px; font-size: .85rem;" />
                <span v-if="errors['lineItem_' + i + '_desc']" class="field-error">{{ errors['lineItem_' + i + '_desc'] }}</span>
              </td>
              <td>
                <input :data-testid="'li-qty-' + item.id" type="number" min="1" v-model.number="item.quantity"
                  @input="updateLineItemTotal(item)"
                  style="width: 80px; padding: .3rem .5rem; border: 1px solid #d1d5db; border-radius: 4px; font-size: .85rem;" />
              </td>
              <td>
                <input :data-testid="'li-price-' + item.id" type="number" step="0.01" min="0" v-model.number="item.unitPrice"
                  @input="updateLineItemTotal(item)"
                  style="width: 100px; padding: .3rem .5rem; border: 1px solid #d1d5db; border-radius: 4px; font-size: .85rem;" />
              </td>
              <td class="num" style="font-weight: 600;">{{ item.total.toFixed(2) }}</td>
              <td>
                <button type="button" class="btn-sm btn-danger" :data-testid="'li-remove-' + item.id" @click="removeLineItem(item.id)">✕</button>
              </td>
            </tr>
          </tbody>
        </table>
        <p v-else style="color: #6b7280; font-size: .85rem;">No line items.</p>
      </div>

      <div style="margin-top: 1rem; display: flex; gap: .5rem;">
        <button type="submit" class="btn btn-primary" data-testid="save-button" :disabled="saving">
          {{ saving ? "Saving…" : "Save" }}
        </button>
        <button type="button" class="btn btn-secondary" @click="goBack">Cancel</button>
        <button type="button" class="btn btn-danger" data-testid="delete-button"
          style="margin-left: auto; padding: .5rem 1rem; border-radius: 6px; font-size: .875rem; font-weight: 500; cursor: pointer;"
          @click="showDeleteModal = true">
          Delete
        </button>
      </div>
    </form>
  </div>

  <!-- Delete Confirmation Modal -->
  <div v-if="showDeleteModal" class="modal-overlay" data-testid="delete-modal" @click="showDeleteModal = false">
    <div class="modal-content" @click.stop>
      <h3>Delete Report</h3>
      <p>Are you sure you want to delete report #{{ reportId }}? This action cannot be undone.</p>
      <div style="display: flex; gap: .5rem; margin-top: 1rem; justify-content: flex-end;">
        <button class="btn btn-secondary" data-testid="modal-cancel" @click="showDeleteModal = false">Cancel</button>
        <button class="btn btn-danger" data-testid="modal-confirm"
          style="padding: .5rem 1rem; border-radius: 6px; font-size: .875rem; font-weight: 500; cursor: pointer;"
          :disabled="deleting" @click="confirmDelete">
          {{ deleting ? "Deleting…" : "Delete" }}
        </button>
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
import { ref, reactive, onMounted } from "vue";
import { useRoute, useRouter } from "vue-router";
import { getReport, updateReport, deleteReport } from "../api/reportsApi";
import type { Report, LineItem, ValidationErrors } from "../types/report";

const route = useRoute();
const router = useRouter();
const reportId = Number(route.params.id);

const form = reactive<Report>({
  id: 0, name: "", owner: "", status: "draft",
  amount: 0, currency: "PLN", department: "", category: "",
  priority: "medium", tags: "", approvedBy: "",
  periodFrom: "", periodTo: "",
  updatedAt: "", description: "",
  lineItems: [],
});
const errors = reactive<ValidationErrors>({});
const loading = ref(true);
const fetchError = ref("");
const saving = ref(false);
const saveError = ref("");
const successMsg = ref("");

const showDeleteModal = ref(false);
const deleting = ref(false);

// Toast
const toasts = ref<{ id: number; message: string; type: "success" | "error" }[]>([]);
let toastIdCounter = 0;
function addToast(message: string, type: "success" | "error" = "success") {
  const id = toastIdCounter++;
  toasts.value.push({ id, message, type });
  setTimeout(() => {
    toasts.value = toasts.value.filter(t => t.id !== id);
  }, 3000);
}

// Line items
let nextLineItemId = 100;

function addLineItem() {
  form.lineItems.push({
    id: nextLineItemId++,
    description: "",
    quantity: 1,
    unitPrice: 0,
    total: 0,
  });
}

function removeLineItem(id: number) {
  form.lineItems = form.lineItems.filter(li => li.id !== id);
}

function updateLineItemTotal(item: LineItem) {
  item.total = Math.round(item.quantity * item.unitPrice * 100) / 100;
}

onMounted(async () => {
  try {
    const report = await getReport(reportId);
    Object.assign(form, { ...report, lineItems: report.lineItems || [] });
    nextLineItemId = Math.max(...form.lineItems.map(li => li.id), 0) + 1;
  } catch (err: any) {
    fetchError.value = err.message || "Failed to load report";
  } finally {
    loading.value = false;
  }
});

function validate(): boolean {
  for (const key of Object.keys(errors)) delete errors[key];

  if (!form.name || form.name.trim().length < 1) errors.name = "Name is required";
  if (!form.owner || form.owner.trim().length < 1) errors.owner = "Owner is required";
  if (form.amount == null || form.amount <= 0) errors.amount = "Amount must be greater than 0";
  if (!form.periodFrom) errors.periodFrom = "Period From is required";
  if (!form.periodTo) errors.periodTo = "Period To is required";
  if (form.periodFrom && form.periodTo && form.periodTo < form.periodFrom) {
    errors.periodTo = "Period To must be on or after Period From";
  }
  if (form.description && form.description.length > 500) {
    errors.description = "Description must be 500 characters or less";
  }
  for (let i = 0; i < form.lineItems.length; i++) {
    const li = form.lineItems[i];
    if (!li.description.trim()) errors[`lineItem_${i}_desc`] = "Description required";
    if (li.quantity <= 0) errors[`lineItem_${i}_qty`] = "Must be > 0";
    if (li.unitPrice <= 0) errors[`lineItem_${i}_price`] = "Must be > 0";
  }
  return Object.keys(errors).length === 0;
}

async function onSubmit() {
  successMsg.value = "";
  saveError.value = "";
  if (!validate()) return;

  saving.value = true;
  try {
    const updated = await updateReport(reportId, {
      name: form.name, owner: form.owner, status: form.status,
      amount: form.amount, currency: form.currency, department: form.department,
      category: form.category, priority: form.priority, tags: form.tags,
      approvedBy: form.approvedBy, periodFrom: form.periodFrom, periodTo: form.periodTo,
      description: form.description, lineItems: form.lineItems,
    });
    Object.assign(form, { ...updated, lineItems: updated.lineItems || [] });
    addToast("Report saved successfully!");
  } catch (err: any) {
    saveError.value = err.message || "Failed to save report";
    addToast(saveError.value, "error");
  } finally {
    saving.value = false;
  }
}

async function confirmDelete() {
  deleting.value = true;
  try {
    await deleteReport(reportId);
    addToast("Report deleted.");
    router.push("/reports");
  } catch (err: any) {
    addToast(err.message || "Failed to delete report", "error");
  } finally {
    deleting.value = false;
    showDeleteModal.value = false;
  }
}

function goBack() {
  router.push("/reports");
}
</script>
