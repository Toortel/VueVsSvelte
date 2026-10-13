/**
 * enterprise.spec.ts – E2E benchmarks for enterprise CRUD workflows,
 * bulk operations, inline editing, line items, and kanban.
 *
 * Measures both **individual actions** (granular) and **end-to-end workflows**
 * (realistic user flows) so we can compare the overhead of each framework
 * on a complete working process versus isolated micro-operations.
 *
 * Tagged @enterprise so you can run: npx playwright test --grep @enterprise
 */
import { test, expect, type Page } from "@playwright/test";
import { FRAMEWORKS } from "../helpers/frameworks";
import {
  saveReport,
  generateHtmlReport,
  generateExcelReport,
  type BenchmarkResult,
  type BenchmarkReport,
} from "../helpers/results";

const allResults: BenchmarkResult[] = [];
const runId = `enterprise-${new Date().toISOString().replace(/[:.]/g, "-")}`;
let userAgent = "";

function record(framework: string, operation: string, e2eMs: number, inAppMs: number | null) {
  allResults.push({
    framework,
    operation,
    e2eMs,
    inAppMs,
    timestamp: new Date().toISOString(),
  });
}

for (const fw of FRAMEWORKS) {
  // ───────────────────────────────────────────────
  // Workflow: Create New Report (end-to-end + granular)
  // Simulates a user navigating to the create form, filling all fields,
  // adding line items, and submitting. Measures each phase separately
  // plus the complete workflow time.
  // ───────────────────────────────────────────────
  test.describe(`${fw.name} Create Workflow @enterprise`, () => {
    let page: Page;

    test.beforeAll(async ({ browser }) => {
      page = await browser.newPage();
      userAgent = await page.evaluate(() => navigator.userAgent);
    });

    test.afterAll(async () => {
      await page.close();
    });

    test("Create report: full workflow (navigate → fill → line items → submit)", async () => {
      let navigateMs = 0, fillMs = 0, lineItemsMs = 0, submitMs = 0, workflowMs = 0;
      try {
      // ── E2E start ──
      const tWorkflowStart = await page.evaluate(() => performance.now());

      // Phase 1: Navigate to create form
      const t0 = await page.evaluate(() => performance.now());
      await page.goto(`${fw.baseUrl}${fw.reportsCreatePath}`, { waitUntil: "networkidle" });
      await expect(page.getByTestId("report-form")).toBeVisible();
      const t1 = await page.evaluate(() => performance.now());
      navigateMs = t1 - t0;

      // Phase 2: Fill form fields
      const t2 = await page.evaluate(() => performance.now());
      await page.getByTestId("name-input").fill("Q4 2025 Budget Review");
      await page.getByTestId("owner-input").fill("Jan Kowalski");
      await page.getByTestId("amount-input").fill("125000");
      await page.getByTestId("department-input").fill("Finance");
      await page.getByTestId("category-input").fill("Quarterly");
      await page.getByTestId("status-input").selectOption("draft");
      await page.getByTestId("priority-input").selectOption("high");
      await page.getByTestId("currency-input").selectOption("PLN");
      await page.getByTestId("periodFrom-input").fill("2025-10-01");
      await page.getByTestId("periodTo-input").fill("2025-12-31");
      await page.getByTestId("description-input").fill("Quarterly budget review for the finance department including all sub-units.");
      const t3 = await page.evaluate(() => performance.now());
      fillMs = t3 - t2;

      // Phase 3: Add 5 line items with data
      const t4 = await page.evaluate(() => performance.now());
      for (let i = 0; i < 5; i++) {
        await page.getByTestId("add-line-item").click();
      }
      // Fill all line items so validation passes
      const descInputs = page.locator('[data-testid^="li-desc-"]');
      const qtyInputs = page.locator('[data-testid^="li-qty-"]');
      const priceInputs = page.locator('[data-testid^="li-price-"]');
      const itemCount = await descInputs.count();
      for (let i = 0; i < itemCount; i++) {
        await descInputs.nth(i).fill(`Item ${i + 1}`);
        await qtyInputs.nth(i).fill(String(10 + i));
        await priceInputs.nth(i).fill(String(250 + i * 50));
      }
      const t5 = await page.evaluate(() => performance.now());
      lineItemsMs = t5 - t4;

      // Phase 4: Submit form
      const t6 = await page.evaluate(() => performance.now());
      await page.getByTestId("save-button").click();
      await page.waitForURL(/\/reports\/\d+/, { timeout: 30000 });
      const t7 = await page.evaluate(() => performance.now());
      submitMs = t7 - t6;

      // ── E2E end ──
      const tWorkflowEnd = await page.evaluate(() => performance.now());
      workflowMs = tWorkflowEnd - tWorkflowStart;
      } catch (err) {
        console.warn(`  [${fw.name}] Create workflow failed: ${(err as Error).message}`);
      }

      // Record whatever we measured (even partial)
      if (navigateMs) record(fw.name, "Create: Navigate to form", navigateMs, null);
      if (fillMs) record(fw.name, "Create: Fill all fields", fillMs, null);
      if (lineItemsMs) record(fw.name, "Create: Add 5 line items + fill", lineItemsMs, null);
      if (submitMs) record(fw.name, "Create: Submit + redirect", submitMs, null);
      if (workflowMs) record(fw.name, "Create: E2E workflow", workflowMs, null);

      console.log(`  [${fw.name}] CREATE WORKFLOW:`);
      console.log(`    Navigate: ${navigateMs.toFixed(1)}ms | Fill: ${fillMs.toFixed(1)}ms | Line items: ${lineItemsMs.toFixed(1)}ms | Submit: ${submitMs.toFixed(1)}ms`);
      console.log(`    E2E total: ${workflowMs.toFixed(1)}ms`);
    });
  });

  // ───────────────────────────────────────────────
  // Workflow: Edit Existing Report (end-to-end + granular)
  // Simulates a user opening the list, navigating to a report,
  // modifying fields, managing line items, and saving.
  // ───────────────────────────────────────────────
  test.describe(`${fw.name} Edit Workflow @enterprise`, () => {
    let page: Page;

    test.beforeAll(async ({ browser }) => {
      page = await browser.newPage();
    });

    test.afterAll(async () => {
      await page.close();
    });

    test("Edit report: full workflow (list → open → modify → line items → save)", async () => {
      let listLoadMs = 0, openFormMs = 0, modifyMs = 0, addLineItemsMs = 0, removeLineItemMs = 0, saveMs = 0, workflowMs = 0;
      let removeCount = 0;
      try {
      // ── E2E start ──
      const tWorkflowStart = await page.evaluate(() => performance.now());

      // Phase 1: Load reports list
      const t0 = await page.evaluate(() => performance.now());
      await page.goto(`${fw.baseUrl}${fw.reportsPath}`, { waitUntil: "networkidle" });
      await expect(page.getByTestId("reports-table")).toBeVisible();
      const t1 = await page.evaluate(() => performance.now());
      listLoadMs = t1 - t0;

      // Phase 2: Navigate to edit page (click first report name)
      const t2 = await page.evaluate(() => performance.now());
      await page.locator('[data-testid^="row-"] td:nth-child(2) span').first().click();
      await expect(page.getByTestId("report-form")).toBeVisible();
      const t3 = await page.evaluate(() => performance.now());
      openFormMs = t3 - t2;

      // Phase 3: Modify multiple fields
      const t4 = await page.evaluate(() => performance.now());
      await page.getByTestId("name-input").fill("Updated Q4 Budget Review");
      await page.getByTestId("owner-input").fill("Anna Nowak");
      await page.getByTestId("amount-input").fill("150000");
      await page.getByTestId("status-input").selectOption("published");
      await page.getByTestId("priority-input").selectOption("critical");
      await page.getByTestId("description-input").fill("Updated quarterly budget with revised projections and additional allocations.");
      const t5 = await page.evaluate(() => performance.now());
      modifyMs = t5 - t4;

      // Phase 4: Add 3 line items
      const t6 = await page.evaluate(() => performance.now());
      for (let i = 0; i < 3; i++) {
        await page.getByTestId("add-line-item").click();
      }
      // Fill all line items so validation passes
      const liDescs = page.locator('[data-testid^="li-desc-"]');
      const liQtys = page.locator('[data-testid^="li-qty-"]');
      const liPrices = page.locator('[data-testid^="li-price-"]');
      const liCount = await liDescs.count();
      for (let i = 0; i < liCount; i++) {
        const desc = await liDescs.nth(i).inputValue();
        if (!desc.trim()) {
          await liDescs.nth(i).fill(`Edit item ${i + 1}`);
          await liQtys.nth(i).fill(String(5 + i));
          await liPrices.nth(i).fill(String(100 + i * 25));
        }
      }
      const t7 = await page.evaluate(() => performance.now());
      addLineItemsMs = t7 - t6;

      // Phase 5: Remove first line item (if any existed before)
      const removeButtons = page.locator('[data-testid^="li-remove-"]');
      removeCount = await removeButtons.count();
      if (removeCount > 0) {
        const t8 = await page.evaluate(() => performance.now());
        await removeButtons.first().click();
        const t9 = await page.evaluate(() => performance.now());
        removeLineItemMs = t9 - t8;
      }

      // Phase 6: Save
      const t10 = await page.evaluate(() => performance.now());
      await page.getByTestId("save-button").click();
      await expect(page.getByTestId("toast-success")).toBeVisible({ timeout: 30000 });
      const t11 = await page.evaluate(() => performance.now());
      saveMs = t11 - t10;

      // ── E2E end ──
      const tWorkflowEnd = await page.evaluate(() => performance.now());
      workflowMs = tWorkflowEnd - tWorkflowStart;
      } catch (err) {
        console.warn(`  [${fw.name}] Edit workflow failed: ${(err as Error).message}`);
      }

      // Record whatever we measured (even partial)
      if (listLoadMs) record(fw.name, "Edit: Load list", listLoadMs, null);
      if (openFormMs) record(fw.name, "Edit: Open form", openFormMs, null);
      if (modifyMs) record(fw.name, "Edit: Modify fields", modifyMs, null);
      if (addLineItemsMs) record(fw.name, "Edit: Add 3 line items", addLineItemsMs, null);
      if (removeCount > 0 && removeLineItemMs) record(fw.name, "Edit: Remove 1 line item", removeLineItemMs, null);
      if (saveMs) record(fw.name, "Edit: Save", saveMs, null);
      if (workflowMs) record(fw.name, "Edit: E2E workflow", workflowMs, null);

      console.log(`  [${fw.name}] EDIT WORKFLOW:`);
      console.log(`    List: ${listLoadMs.toFixed(1)}ms | Open: ${openFormMs.toFixed(1)}ms | Modify: ${modifyMs.toFixed(1)}ms | +3 items: ${addLineItemsMs.toFixed(1)}ms | Save: ${saveMs.toFixed(1)}ms`);
      console.log(`    E2E total: ${workflowMs.toFixed(1)}ms`);
    });
  });

  // ───────────────────────────────────────────────
  // Workflow: Delete Report (end-to-end + granular)
  // ───────────────────────────────────────────────
  test.describe(`${fw.name} Delete Workflow @enterprise`, () => {
    let page: Page;

    test.beforeAll(async ({ browser }) => {
      page = await browser.newPage();
    });

    test.afterAll(async () => {
      await page.close();
    });

    test("Delete report: full workflow (list → open → delete modal → confirm → redirect)", async () => {
      let listLoadMs = 0, openFormMs = 0, modalMs = 0, confirmMs = 0, workflowMs = 0;
      try {
      const tWorkflowStart = await page.evaluate(() => performance.now());

      // Phase 1: Navigate to list
      const t0 = await page.evaluate(() => performance.now());
      await page.goto(`${fw.baseUrl}${fw.reportsPath}`, { waitUntil: "networkidle" });
      await expect(page.getByTestId("reports-table")).toBeVisible();
      const t1 = await page.evaluate(() => performance.now());
      listLoadMs = t1 - t0;

      // Phase 2: Open first report
      const t2 = await page.evaluate(() => performance.now());
      await page.locator('[data-testid^="row-"] td:nth-child(2) span').first().click();
      await expect(page.getByTestId("report-form")).toBeVisible();
      const t3 = await page.evaluate(() => performance.now());
      openFormMs = t3 - t2;

      // Phase 3: Click delete → modal appears
      const t4 = await page.evaluate(() => performance.now());
      await page.getByTestId("delete-button").click();
      await expect(page.getByTestId("delete-modal")).toBeVisible();
      const t5 = await page.evaluate(() => performance.now());
      modalMs = t5 - t4;

      // Phase 4: Confirm delete → redirect to list
      const t6 = await page.evaluate(() => performance.now());
      await page.getByTestId("modal-confirm").click();
      await page.waitForURL(/\/reports$/, { timeout: 30000 });
      const t7 = await page.evaluate(() => performance.now());
      confirmMs = t7 - t6;

      const tWorkflowEnd = await page.evaluate(() => performance.now());
      workflowMs = tWorkflowEnd - tWorkflowStart;
      } catch (err) {
        console.warn(`  [${fw.name}] Delete workflow failed: ${(err as Error).message}`);
      }

      if (listLoadMs) record(fw.name, "Delete: Load list", listLoadMs, null);
      if (openFormMs) record(fw.name, "Delete: Open form", openFormMs, null);
      if (modalMs) record(fw.name, "Delete: Modal open", modalMs, null);
      if (confirmMs) record(fw.name, "Delete: Confirm + redirect", confirmMs, null);
      if (workflowMs) record(fw.name, "Delete: E2E workflow", workflowMs, null);

      console.log(`  [${fw.name}] DELETE WORKFLOW:`);
      console.log(`    List: ${listLoadMs.toFixed(1)}ms | Open: ${openFormMs.toFixed(1)}ms | Modal: ${modalMs.toFixed(1)}ms | Confirm: ${confirmMs.toFixed(1)}ms`);
      console.log(`    E2E total: ${workflowMs.toFixed(1)}ms`);
    });
  });

  // ───────────────────────────────────────────────
  // Bulk Operations
  // ───────────────────────────────────────────────
  test.describe(`${fw.name} Bulk Operations @enterprise`, () => {
    let page: Page;

    test.beforeAll(async ({ browser }) => {
      page = await browser.newPage();
      await page.goto(`${fw.baseUrl}${fw.reportsPath}`, { waitUntil: "networkidle" });
      await expect(page.getByTestId("reports-table")).toBeVisible();
    });

    test.afterAll(async () => {
      await page.close();
    });

    test("Select all rows", async () => {
      try {
      const t0 = await page.evaluate(() => performance.now());
      await page.getByTestId("select-all").click();
      await expect(page.getByTestId("bulk-actions")).toBeVisible();
      const t1 = await page.evaluate(() => performance.now());

      record(fw.name, "Bulk: Select all rows", t1 - t0, null);
      console.log(`  [${fw.name}] Select all: ${(t1 - t0).toFixed(1)}ms`);
      } catch (err) {
        console.warn(`  [${fw.name}] Select all failed: ${(err as Error).message}`);
      }
    });

    test("Bulk status change", async () => {
      try {
      const bulkBar = page.getByTestId("bulk-actions");
      if (!await bulkBar.isVisible()) {
        await page.getByTestId("select-all").click();
      }

      await page.getByTestId("bulk-status-select").selectOption("archived");

      const t0 = await page.evaluate(() => performance.now());
      await page.getByTestId("bulk-status-apply").click();
      await expect(page.getByTestId("toast-success")).toBeVisible({ timeout: 30000 });
      const t1 = await page.evaluate(() => performance.now());

      record(fw.name, "Bulk: Status change", t1 - t0, null);
      console.log(`  [${fw.name}] Bulk status change: ${(t1 - t0).toFixed(1)}ms`);
      } catch (err) {
        console.warn(`  [${fw.name}] Bulk status change failed: ${(err as Error).message}`);
      }
    });
  });

  // ───────────────────────────────────────────────
  // Inline Editing
  // ───────────────────────────────────────────────
  test.describe(`${fw.name} Inline Editing @enterprise`, () => {
    let page: Page;

    test.beforeAll(async ({ browser }) => {
      page = await browser.newPage();
      await page.goto(`${fw.baseUrl}${fw.reportsPath}`, { waitUntil: "networkidle" });
      await expect(page.getByTestId("reports-table")).toBeVisible();
    });

    test.afterAll(async () => {
      await page.close();
    });

    test("Inline edit name (dblclick → save)", async () => {
      try {
      const firstNameCell = page.locator('[data-testid^="row-"] td:nth-child(2)').first();

      const t0 = await page.evaluate(() => performance.now());
      await firstNameCell.dblclick();
      const inlineInput = page.locator('[data-testid^="inline-name-"]').first();
      await expect(inlineInput).toBeVisible({ timeout: 5000 });
      const t1 = await page.evaluate(() => performance.now());

      await inlineInput.fill("Inline Edited Name");
      await inlineInput.press("Enter");
      await expect(page.getByTestId("toast-success")).toBeVisible({ timeout: 30000 });
      const t2 = await page.evaluate(() => performance.now());

      record(fw.name, "Inline: Activate edit", t1 - t0, null);
      record(fw.name, "Inline: Save", t2 - t1, null);
      console.log(`  [${fw.name}] Inline activate: ${(t1 - t0).toFixed(1)}ms, save: ${(t2 - t1).toFixed(1)}ms`);
      } catch (err) {
        console.warn(`  [${fw.name}] Inline edit failed: ${(err as Error).message}`);
      }
    });
  });

  // ───────────────────────────────────────────────
  // Dynamic Line Items (stress test)
  // ───────────────────────────────────────────────
  test.describe(`${fw.name} Line Items @enterprise`, () => {
    let page: Page;

    test.beforeAll(async ({ browser }) => {
      page = await browser.newPage();
      await page.goto(`${fw.baseUrl}${fw.reportsCreatePath}`, { waitUntil: "networkidle" });
      await expect(page.getByTestId("report-form")).toBeVisible();
    });

    test.afterAll(async () => {
      await page.close();
    });

    test("Add 10 line items", async () => {
      try {
      const t0 = await page.evaluate(() => performance.now());
      for (let i = 0; i < 10; i++) {
        await page.getByTestId("add-line-item").click();
      }
      await expect(page.getByTestId("line-items-table")).toBeVisible();
      const t1 = await page.evaluate(() => performance.now());

      record(fw.name, "Line items: Add 10", t1 - t0, null);
      console.log(`  [${fw.name}] Add 10 line items: ${(t1 - t0).toFixed(1)}ms`);
      } catch (err) {
        console.warn(`  [${fw.name}] Add 10 line items failed: ${(err as Error).message}`);
      }
    });

    test("Add 50 line items", async () => {
      try {
      await page.goto(`${fw.baseUrl}${fw.reportsCreatePath}`, { waitUntil: "networkidle" });
      await expect(page.getByTestId("report-form")).toBeVisible();

      const t0 = await page.evaluate(() => performance.now());
      for (let i = 0; i < 50; i++) {
        await page.getByTestId("add-line-item").click();
      }
      const t1 = await page.evaluate(() => performance.now());

      record(fw.name, "Line items: Add 50", t1 - t0, null);
      console.log(`  [${fw.name}] Add 50 line items: ${(t1 - t0).toFixed(1)}ms`);
      } catch (err) {
        console.warn(`  [${fw.name}] Add 50 line items failed: ${(err as Error).message}`);
      }
    });

    test("Remove all line items one by one", async () => {
      try {
      const t0 = await page.evaluate(() => performance.now());
      const removeButtons = page.locator('[data-testid^="li-remove-"]');
      const count = await removeButtons.count();
      for (let i = count - 1; i >= 0; i--) {
        await removeButtons.nth(i).click();
      }
      const t1 = await page.evaluate(() => performance.now());

      record(fw.name, `Line items: Remove ${count}`, t1 - t0, null);
      console.log(`  [${fw.name}] Remove ${count} line items: ${(t1 - t0).toFixed(1)}ms`);
      } catch (err) {
        console.warn(`  [${fw.name}] Remove line items failed: ${(err as Error).message}`);
      }
    });
  });

  // ───────────────────────────────────────────────
  // Kanban Board
  // ───────────────────────────────────────────────
  test.describe(`${fw.name} Kanban @enterprise`, () => {
    let page: Page;

    test.beforeAll(async ({ browser }) => {
      page = await browser.newPage();
    });

    test.afterAll(async () => {
      await page.close();
    });

    test("Kanban board load", async () => {
      try {
      const t0 = await page.evaluate(() => performance.now());
      await page.goto(`${fw.baseUrl}${fw.kanbanPath}`, { waitUntil: "networkidle" });
      await expect(page.getByTestId("kanban-board")).toBeVisible();
      const t1 = await page.evaluate(() => performance.now());

      record(fw.name, "Kanban: Board load", t1 - t0, null);
      console.log(`  [${fw.name}] Kanban load: ${(t1 - t0).toFixed(1)}ms`);
      } catch (err) {
        console.warn(`  [${fw.name}] Kanban load failed: ${(err as Error).message}`);
      }
    });

    test("Kanban drag-and-drop", async () => {
      try {
      await expect(page.getByTestId("kanban-board")).toBeVisible();

      const draftCards = page.locator('[data-testid="kanban-col-draft"] [data-testid^="kanban-card-"]');
      const publishedCol = page.getByTestId("kanban-col-published");

      const cardCount = await draftCards.count();
      if (cardCount > 0) {
        const card = draftCards.first();
        const t0 = await page.evaluate(() => performance.now());
        await card.dragTo(publishedCol);
        try {
          await expect(page.getByTestId("toast-success")).toBeVisible({ timeout: 5000 });
        } catch {
          // Toast may have disappeared
        }
        const t1 = await page.evaluate(() => performance.now());

        record(fw.name, "Kanban: Drag & Drop", t1 - t0, null);
        console.log(`  [${fw.name}] Kanban drag: ${(t1 - t0).toFixed(1)}ms`);
      } else {
        console.log(`  [${fw.name}] Kanban drag: skipped (no draft cards)`);
        record(fw.name, "Kanban: Drag & Drop", 0, null);
      }
      } catch (err) {
        console.warn(`  [${fw.name}] Kanban drag failed: ${(err as Error).message}`);
      }
    });
  });
}

/* ── Generate report ── */
test.describe("Generate enterprise comparison report @enterprise", () => {
  test("Save JSON + HTML + Excel report", async () => {
    const report: BenchmarkReport = {
      runId,
      timestamp: new Date().toISOString(),
      userAgent,
      results: allResults,
    };

    const jsonPath = saveReport(report, false);
    const htmlPath = generateHtmlReport(report);
    const xlsxPath = await generateExcelReport(report, "enterprise-results");

    console.log(`\n✅ Enterprise benchmark report saved:`);
    console.log(`   JSON:  ${jsonPath}`);
    console.log(`   HTML:  ${htmlPath}`);
    console.log(`   Excel: ${xlsxPath}`);

    const operations = [...new Set(allResults.map((r) => r.operation))];
    for (const op of operations) {
      const line = FRAMEWORKS.map((fw) => {
        const entry = allResults.find(
          (r) => r.framework === fw.name && r.operation === op
        );
        return `${fw.name}: ${entry ? entry.e2eMs.toFixed(1) : "–"}ms`;
      }).join("  |  ");
      console.log(`   ${op.padEnd(40)} ${line}`);
    }
  });
});
