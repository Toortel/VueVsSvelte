<script lang="ts">
  import { navigate } from "$lib/router";
  import { createReport } from "$lib/api/reportsApi";
  import type { Report, LineItem, ValidationErrors } from "$lib/types/report";

  let form = $state<Omit<Report, "id" | "updatedAt">>({
    name: "", owner: "", status: "draft",
    amount: 0, currency: "PLN", department: "", category: "",
    priority: "medium", tags: "", approvedBy: "",
    periodFrom: "", periodTo: "", description: "",
    lineItems: [],
  });

  let errors = $state<ValidationErrors>({});
  let saving = $state(false);
  let saveError = $state("");

  // ── Line items management ──
  let nextLineItemId = $state(1);

  function addLineItem() {
    form.lineItems = [...form.lineItems, {
      id: nextLineItemId++,
      description: "",
      quantity: 1,
      unitPrice: 0,
      total: 0,
    }];
  }

  function removeLineItem(id: number) {
    form.lineItems = form.lineItems.filter(li => li.id !== id);
  }

  function updateLineItemTotal(item: LineItem) {
    item.total = Math.round(item.quantity * item.unitPrice * 100) / 100;
  }

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

  async function onSubmit(e: Event) {
    e.preventDefault();
    saveError = "";
    if (!validate()) return;

    saving = true;
    try {
      const created = await createReport({
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
      navigate(`/reports/${created.id}`);
    } catch (err: any) {
      saveError = err.message || "Failed to create report";
    } finally {
      saving = false;
    }
  }

  function goBack() {
    navigate("/reports");
  }
</script>

<div>
  <button class="btn btn-secondary" data-testid="back-button" onclick={goBack}>← Back to list</button>

  <h2 style="margin: 1rem 0">Create New Report</h2>

  <form data-testid="report-form" class="card" onsubmit={onSubmit}>
    {#if saveError}
      <div class="msg-error" data-testid="error-message">{saveError}</div>
    {/if}

    <div class="form-grid">
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
                  <input
                    data-testid="li-desc-{item.id}"
                    type="text"
                    bind:value={item.description}
                    placeholder="Item description"
                    style="width: 100%; padding: .3rem .5rem; border: 1px solid #d1d5db; border-radius: 4px; font-size: .85rem;"
                  />
                  {#if errors[`lineItem_${i}_desc`]}<span class="field-error">{errors[`lineItem_${i}_desc`]}</span>{/if}
                </td>
                <td>
                  <input
                    data-testid="li-qty-{item.id}"
                    type="number"
                    min="1"
                    bind:value={item.quantity}
                    oninput={() => updateLineItemTotal(item)}
                    style="width: 80px; padding: .3rem .5rem; border: 1px solid #d1d5db; border-radius: 4px; font-size: .85rem;"
                  />
                  {#if errors[`lineItem_${i}_qty`]}<span class="field-error">{errors[`lineItem_${i}_qty`]}</span>{/if}
                </td>
                <td>
                  <input
                    data-testid="li-price-{item.id}"
                    type="number"
                    step="0.01"
                    min="0"
                    bind:value={item.unitPrice}
                    oninput={() => updateLineItemTotal(item)}
                    style="width: 100px; padding: .3rem .5rem; border: 1px solid #d1d5db; border-radius: 4px; font-size: .85rem;"
                  />
                  {#if errors[`lineItem_${i}_price`]}<span class="field-error">{errors[`lineItem_${i}_price`]}</span>{/if}
                </td>
                <td class="num" style="font-weight: 600;">{item.total.toFixed(2)}</td>
                <td>
                  <button
                    type="button"
                    class="btn-sm btn-danger"
                    data-testid="li-remove-{item.id}"
                    onclick={() => removeLineItem(item.id)}
                  >✕</button>
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      {:else}
        <p style="color: #6b7280; font-size: .85rem;">No line items added yet.</p>
      {/if}
    </div>

    <div style="margin-top: 1rem; display: flex; gap: .5rem;">
      <button type="submit" class="btn btn-primary" data-testid="save-button" disabled={saving}>
        {saving ? "Creating…" : "Create Report"}
      </button>
      <button type="button" class="btn btn-secondary" onclick={goBack}>Cancel</button>
    </div>
  </form>
</div>
