<script lang="ts">
  import { onMount } from "svelte";
  import { navigate } from "$lib/router";
  import { getReport, updateReport, deleteReport } from "$lib/api/reportsApi";
  import type { Report, LineItem, ValidationErrors } from "$lib/types/report";

  let { id }: { id: number } = $props();

  // ── State ──
  let form = $state<Report>({
    id: 0, name: "", owner: "", status: "draft",
    amount: 0, currency: "PLN", department: "", category: "",
    priority: "medium", tags: "", approvedBy: "",
    periodFrom: "", periodTo: "",
    updatedAt: "", description: "",
    lineItems: [],
  });
  let errors = $state<ValidationErrors>({});
  let loading = $state(true);
  let fetchError = $state("");
  let saving = $state(false);
  let saveError = $state("");
  let successMsg = $state("");

  // ── Modal + Toast state ──
  let showDeleteModal = $state(false);
  let deleting = $state(false);
  let toasts = $state<{ id: number; message: string; type: "success" | "error" }[]>([]);
  let toastId = $state(0);

  function addToast(message: string, type: "success" | "error" = "success") {
    const tid = toastId++;
    toasts = [...toasts, { id: tid, message, type }];
    setTimeout(() => {
      toasts = toasts.filter(t => t.id !== tid);
    }, 3000);
  }

  // ── Line item helpers ──
  let nextLineItemId = $state(100);

  function addLineItem() {
    form.lineItems = [...form.lineItems, {
      id: nextLineItemId++,
      description: "",
      quantity: 1,
      unitPrice: 0,
      total: 0,
    }];
  }

  function removeLineItem(lid: number) {
    form.lineItems = form.lineItems.filter(li => li.id !== lid);
  }

  function updateLineItemTotal(item: LineItem) {
    item.total = Math.round(item.quantity * item.unitPrice * 100) / 100;
  }

  // ── Load report on mount ──
  onMount(async () => {
    try {
      const report = await getReport(id);
      form = { ...report, lineItems: report.lineItems || [] };
      nextLineItemId = Math.max(...form.lineItems.map(li => li.id), 0) + 1;
    } catch (err: any) {
      fetchError = err.message || "Failed to load report";
    } finally {
      loading = false;
    }
  });

  // ── Validation ──
  function validate(): boolean {
    const newErrors: ValidationErrors = {};

    if (!form.name || form.name.trim().length < 1) newErrors.name = "Name is required";
    if (!form.owner || form.owner.trim().length < 1) newErrors.owner = "Owner is required";
    if (form.amount == null || form.amount <= 0) newErrors.amount = "Amount must be greater than 0";
    if (!form.periodFrom) newErrors.periodFrom = "Period From is required";
    if (!form.periodTo) newErrors.periodTo = "Period To is required";
    if (form.periodFrom && form.periodTo && form.periodTo < form.periodFrom) {
      newErrors.periodTo = "Period To must be on or after Period From";
    }
    if (form.description && form.description.length > 500) {
      newErrors.description = "Description must be 500 characters or less";
    }
    for (let i = 0; i < form.lineItems.length; i++) {
      const li = form.lineItems[i];
      if (!li.description.trim()) newErrors[`lineItem_${i}_desc`] = "Description required";
      if (li.quantity <= 0) newErrors[`lineItem_${i}_qty`] = "Must be > 0";
      if (li.unitPrice <= 0) newErrors[`lineItem_${i}_price`] = "Must be > 0";
    }

    errors = newErrors;
    return Object.keys(newErrors).length === 0;
  }

  // ── Submit ──
  async function onSubmit(e: Event) {
    e.preventDefault();
    successMsg = "";
    saveError = "";
    if (!validate()) return;

    saving = true;
    try {
      const updated = await updateReport(id, {
        name: form.name,
        owner: form.owner,
        status: form.status,
        amount: form.amount,
        currency: form.currency,
        department: form.department,
        category: form.category,
        priority: form.priority,
        tags: form.tags,
        approvedBy: form.approvedBy,
        periodFrom: form.periodFrom,
        periodTo: form.periodTo,
        description: form.description,
        lineItems: form.lineItems,
      });
      form = { ...updated, lineItems: updated.lineItems || [] };
      addToast("Report saved successfully!");
    } catch (err: any) {
      saveError = err.message || "Failed to save report";
      addToast(saveError, "error");
    } finally {
      saving = false;
    }
  }

  // ── Delete ──
  async function confirmDelete() {
    deleting = true;
    try {
      await deleteReport(id);
      addToast("Report deleted.");
      navigate("/reports");
    } catch (err: any) {
      addToast(err.message || "Failed to delete report", "error");
    } finally {
      deleting = false;
      showDeleteModal = false;
    }
  }

  function goBack() {
    navigate("/reports");
  }
</script>

<div>
  <button class="btn btn-secondary" data-testid="back-button" onclick={goBack}>← Back to list</button>

  <h2 style="margin: 1rem 0">Edit Report #{id}</h2>

  {#if loading}
    <div class="loading">Loading report…</div>
  {:else if fetchError}
    <div class="msg-error" data-testid="error-message">{fetchError}</div>
  {:else}
    <form data-testid="report-form" class="card" onsubmit={onSubmit}>
      {#if successMsg}
        <div class="msg-success" data-testid="success-message">{successMsg}</div>
      {/if}
      {#if saveError}
        <div class="msg-error" data-testid="error-message">{saveError}</div>
      {/if}

      <div class="form-grid">
        <div class="form-group">
          <label>ID</label>
          <input type="text" value={form.id} disabled />
        </div>

        <div class="form-group">
          <label for="name">Name *</label>
          <input id="name" data-testid="name-input" type="text" bind:value={form.name} />
          {#if errors.name}<span class="field-error">{errors.name}</span>{/if}
        </div>

        <div class="form-group">
          <label for="owner">Owner *</label>
          <input id="owner" data-testid="owner-input" type="text" bind:value={form.owner} />
          {#if errors.owner}<span class="field-error">{errors.owner}</span>{/if}
        </div>

        <div class="form-group">
          <label for="status">Status *</label>
          <select id="status" data-testid="status-input" bind:value={form.status}>
            <option value="draft">Draft</option>
            <option value="published">Published</option>
            <option value="archived">Archived</option>
          </select>
        </div>

        <div class="form-group">
          <label for="amount">Amount *</label>
          <input id="amount" data-testid="amount-input" type="number" step="0.01" bind:value={form.amount} />
          {#if errors.amount}<span class="field-error">{errors.amount}</span>{/if}
        </div>

        <div class="form-group">
          <label for="currency">Currency *</label>
          <select id="currency" data-testid="currency-input" bind:value={form.currency}>
            <option value="PLN">PLN</option>
            <option value="EUR">EUR</option>
            <option value="USD">USD</option>
            <option value="GBP">GBP</option>
            <option value="CHF">CHF</option>
          </select>
        </div>

        <div class="form-group">
          <label for="department">Department</label>
          <input id="department" data-testid="department-input" type="text" bind:value={form.department} />
        </div>

        <div class="form-group">
          <label for="category">Category</label>
          <input id="category" data-testid="category-input" type="text" bind:value={form.category} />
        </div>

        <div class="form-group">
          <label for="priority">Priority</label>
          <select id="priority" data-testid="priority-input" bind:value={form.priority}>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
            <option value="critical">Critical</option>
          </select>
        </div>

        <div class="form-group">
          <label for="tags">Tags</label>
          <input id="tags" data-testid="tags-input" type="text" placeholder="comma-separated" bind:value={form.tags} />
        </div>

        <div class="form-group">
          <label for="approvedBy">Approved By</label>
          <input id="approvedBy" data-testid="approvedBy-input" type="text" bind:value={form.approvedBy} />
        </div>

        <div class="form-group">
          <label for="periodFrom">Period From *</label>
          <input id="periodFrom" data-testid="periodFrom-input" type="date" bind:value={form.periodFrom} />
          {#if errors.periodFrom}<span class="field-error">{errors.periodFrom}</span>{/if}
        </div>

        <div class="form-group">
          <label for="periodTo">Period To *</label>
          <input id="periodTo" data-testid="periodTo-input" type="date" bind:value={form.periodTo} />
          {#if errors.periodTo}<span class="field-error">{errors.periodTo}</span>{/if}
        </div>

        <div class="form-group">
          <label>Updated At</label>
          <input type="text" value={form.updatedAt} disabled />
        </div>

        <div class="form-group full-width">
          <label for="description">Description</label>
          <textarea id="description" data-testid="description-input" rows="3" bind:value={form.description}></textarea>
          {#if errors.description}<span class="field-error">{errors.description}</span>{/if}
        </div>
      </div>

      <!-- Line Items -->
      <div class="line-items" data-testid="line-items-section" style="margin-top: 1.5rem;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: .75rem;">
          <h3 style="font-size: .95rem; color: #374151;">Line Items</h3>
          <button type="button" class="btn btn-secondary" data-testid="add-line-item" onclick={addLineItem}>+ Add Item</button>
        </div>

        {#if form.lineItems.length > 0}
          <table data-testid="line-items-table">
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
              {#each form.lineItems as item, i (item.id)}
                <tr data-testid="line-item-{item.id}">
                  <td>
                    <input data-testid="li-desc-{item.id}" type="text" bind:value={item.description} placeholder="Item description"
                      style="width: 100%; padding: .3rem .5rem; border: 1px solid #d1d5db; border-radius: 4px; font-size: .85rem;" />
                    {#if errors[`lineItem_${i}_desc`]}<span class="field-error">{errors[`lineItem_${i}_desc`]}</span>{/if}
                  </td>
                  <td>
                    <input data-testid="li-qty-{item.id}" type="number" min="1" bind:value={item.quantity}
                      oninput={() => updateLineItemTotal(item)}
                      style="width: 80px; padding: .3rem .5rem; border: 1px solid #d1d5db; border-radius: 4px; font-size: .85rem;" />
                  </td>
                  <td>
                    <input data-testid="li-price-{item.id}" type="number" step="0.01" min="0" bind:value={item.unitPrice}
                      oninput={() => updateLineItemTotal(item)}
                      style="width: 100px; padding: .3rem .5rem; border: 1px solid #d1d5db; border-radius: 4px; font-size: .85rem;" />
                  </td>
                  <td class="num" style="font-weight: 600;">{item.total.toFixed(2)}</td>
                  <td>
                    <button type="button" class="btn-sm btn-danger" data-testid="li-remove-{item.id}" onclick={() => removeLineItem(item.id)}>✕</button>
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        {:else}
          <p style="color: #6b7280; font-size: .85rem;">No line items.</p>
        {/if}
      </div>

      <div style="margin-top: 1rem; display: flex; gap: .5rem;">
        <button type="submit" class="btn btn-primary" data-testid="save-button" disabled={saving}>
          {saving ? "Saving…" : "Save"}
        </button>
        <button type="button" class="btn btn-secondary" onclick={goBack}>Cancel</button>
        <button type="button" class="btn btn-danger" data-testid="delete-button" style="margin-left: auto; padding: .5rem 1rem; border-radius: 6px; font-size: .875rem; font-weight: 500; cursor: pointer;" onclick={() => showDeleteModal = true}>
          Delete
        </button>
      </div>
    </form>
  {/if}
</div>

<!-- Delete Confirmation Modal -->
{#if showDeleteModal}
  <div class="modal-overlay" data-testid="delete-modal" onclick={() => showDeleteModal = false}>
    <div class="modal-content" onclick={(e) => e.stopPropagation()}>
      <h3>Delete Report</h3>
      <p>Are you sure you want to delete report #{id}? This action cannot be undone.</p>
      <div style="display: flex; gap: .5rem; margin-top: 1rem; justify-content: flex-end;">
        <button class="btn btn-secondary" data-testid="modal-cancel" onclick={() => showDeleteModal = false}>Cancel</button>
        <button class="btn btn-danger" data-testid="modal-confirm" style="padding: .5rem 1rem; border-radius: 6px; font-size: .875rem; font-weight: 500; cursor: pointer;" disabled={deleting} onclick={confirmDelete}>
          {deleting ? "Deleting…" : "Delete"}
        </button>
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
