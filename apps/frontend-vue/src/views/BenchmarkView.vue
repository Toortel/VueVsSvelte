<!--
  BenchmarkView.vue – framework performance stress-test view.
  Identical operations in Svelte (routes/benchmark/+page.svelte)
  and Solid (views/BenchmarkView.tsx).

  Operations (each timed via performance.now()):
  1.  Create 1,000 rows
  2.  Create 10,000 rows
  3.  Append 1,000 rows
  4.  Update every 10th row
  5.  Replace all rows (same count, new data)
  6.  Select / highlight a row
  7.  Swap two rows (2nd ↔ second-to-last)
  8.  Delete a single row
  9.  Clear all rows
  10. Render a deeply nested tree (depth=5, breadth=10 → 111,111 nodes)
-->
<template>
  <div>
    <h2>⚡ Performance Benchmark</h2>
    <p class="bench-subtitle">
      Rows: <strong data-testid="bench-row-count">{{ rows.length }}</strong>
      &nbsp;|&nbsp;Cols: <strong data-testid="bench-col-count">{{ 1 + extraColCount }}</strong>
      <template v-if="nestedCount > 0">
        &nbsp;|&nbsp;Nested nodes: <strong data-testid="bench-nested-count">{{ nestedCount }}</strong>
      </template>
    </p>

    <!-- Action buttons -->
    <div class="bench-buttons" data-testid="bench-controls">
      <button class="btn btn-primary" data-testid="bench-create-100" @click="createN(100)">Create 100 rows</button>
      <button class="btn btn-primary" data-testid="bench-create-500" @click="createN(500)">Create 500 rows</button>
      <button class="btn btn-primary" data-testid="bench-create-2500" @click="createN(2500)">Create 2,500 rows</button>
      <button class="btn btn-primary" data-testid="bench-create-12500" @click="createN(12500)">Create 12,500 rows</button>
      <button class="btn btn-secondary" data-testid="bench-append-1k" @click="append1k">Append 1,000 rows</button>
      <button class="btn btn-secondary" data-testid="bench-append-1" @click="appendOne">Append 1 row</button>
      <button class="btn btn-secondary" data-testid="bench-prepend-1k" @click="prependRows(1000)">Prepend 1,000 rows</button>
      <button class="btn btn-secondary" data-testid="bench-prepend-1" @click="prependRows(1)">Prepend 1 row</button>
      <button class="btn btn-secondary" data-testid="bench-insert-mid-1k" @click="insertRowsMiddle(1000)">Insert 1,000 rows mid</button>
      <button class="btn btn-secondary" data-testid="bench-insert-mid-1" @click="insertRowsMiddle(1)">Insert 1 row mid</button>
      <button class="btn btn-secondary" data-testid="bench-update-10th" @click="updateEvery10th">Update every 10th row</button>
      <button class="btn btn-secondary" data-testid="bench-update-all" @click="updateEveryRow">Update every row</button>
      <button class="btn btn-secondary" data-testid="bench-update-first" @click="updateSingleRow">Update single row</button>
      <button class="btn btn-secondary" data-testid="bench-delete-first" @click="deleteFirstRow">Delete first row</button>
      <button class="btn btn-secondary" data-testid="bench-replace" @click="replaceAll">Replace all rows</button>
      <button class="btn btn-secondary" data-testid="bench-swap" @click="swapRows">Swap rows</button>
      <button class="btn btn-secondary" data-testid="bench-clear" @click="clearRows">Clear all</button>
      <button class="btn btn-primary" data-testid="bench-nested" @click="createNested">Nested tree (depth 5 × 10)</button>
      <button class="btn btn-secondary" data-testid="bench-clear-nested" @click="clearNested">Clear nested</button>
    </div>

    <!-- Grid (rows × cols) controls – constant cell-budget benchmark -->
    <div class="bench-grid-controls" data-testid="bench-grid-controls">
      <label>Rows <input type="number" min="1" data-testid="bench-rows-input" v-model.number="gridRows" /></label>
      <label>Cols <input type="number" min="1" data-testid="bench-cols-input" v-model.number="gridCols" /></label>
      <button class="btn btn-primary" data-testid="bench-create-grid" @click="createGrid">Create rows × cols grid</button>
      <label>Cell type
        <select data-testid="bench-celltype-select" v-model="cellType">
          <option value="text">Text</option>
          <option value="integer">Integer</option>
          <option value="float">Float</option>
          <option value="image">Image (SVG)</option>
          <option value="image-png">Image (PNG)</option>
        </select>
      </label>
      <label>Add cols <input type="number" min="1" data-testid="bench-add-cols-input" v-model.number="addColsCount" /></label>
      <button class="btn btn-primary" data-testid="bench-add-cols" @click="addColumns">Add columns</button>
    </div>

    <!-- Positional grid ops – add/delete/edit rows & columns at start/middle/end -->
    <div class="bench-grid-controls" data-testid="bench-ops-controls">
      <label>Count <input type="number" min="1" data-testid="bench-ops-count-input" v-model.number="opsCount" /></label>
      <label>Position
        <select data-testid="bench-ops-position" v-model="opsPosition">
          <option value="start">start</option>
          <option value="middle">middle</option>
          <option value="end">end</option>
          <option value="random">random (mid ⅓)</option>
        </select>
      </label>
      <button class="btn btn-secondary" data-testid="bench-add-rows-at" @click="addRowsAt">Add rows @pos</button>
      <button class="btn btn-secondary" data-testid="bench-delete-rows-at" @click="deleteRowsAt">Delete rows @pos</button>
      <button class="btn btn-secondary" data-testid="bench-add-cols-at" @click="addColsAt">Add cols @pos</button>
      <button class="btn btn-secondary" data-testid="bench-delete-cols-at" @click="deleteColsAt">Delete cols @pos</button>
      <button class="btn btn-secondary" data-testid="bench-edit-row-at" @click="editRowAt">Edit row @pos</button>
      <button class="btn btn-secondary" data-testid="bench-edit-col-at" @click="editColAt">Edit col @pos</button>
      <button class="btn btn-secondary" data-testid="bench-update-cell" @click="updateCellAt">Update cell @pos</button>
      <button class="btn btn-secondary" data-testid="bench-read-cell" @click="readCellAt">Read cell @pos</button>
      <button class="btn btn-secondary" data-testid="bench-edit-col-seq" @click="updateColSequential">Seq edit col @pos</button>
      <span data-testid="bench-read-value">{{ lastReadCell.slice(0, 24) }}</span>
    </div>

    <!-- Timing results log -->
    <div v-if="timings.length > 0" class="bench-timings card" data-testid="bench-timings">
      <h3>Timing Results</h3>
      <table>
        <thead>
          <tr><th>#</th><th>Operation</th><th>Duration</th></tr>
        </thead>
        <tbody>
          <tr v-for="(t, idx) in timings" :key="idx">
            <td>{{ idx + 1 }}</td>
            <td>{{ t.operation }}</td>
            <td class="timing-value">{{ t.durationMs.toFixed(2) }} ms</td>
          </tr>
        </tbody>
      </table>
      <button class="btn btn-secondary" style="margin-top:.5rem" @click="timings = []">Clear log</button>
    </div>

    <!-- Flat rows table -->
    <table v-if="rows.length > 0" class="bench-table" data-testid="bench-table">
      <thead>
        <tr>
          <th style="width:80px">ID</th>
          <th>Label</th>
          <th v-for="i in extraColCount" :key="i">Col {{ i + 1 }}</th>
          <th style="width:120px">Actions</th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="row in rows"
          :key="row.id"
          :class="row.className"
          :data-testid="`bench-row-${row.id}`"
        >
          <td>{{ row.id }}</td>
          <td>
            <img v-if="isImageCell(row.label)" class="bench-cell-img" :src="row.label" width="16" height="16" loading="lazy" alt="cell" />
            <template v-else>{{ row.label }}</template>
          </td>
          <td v-for="(cell, ci) in row.cells" :key="ci">
            <img v-if="isImageCell(cell)" class="bench-cell-img" :src="cell" width="16" height="16" loading="lazy" alt="cell" />
            <template v-else>{{ cell }}</template>
          </td>
          <td>
            <button class="btn-sm btn-danger" :data-testid="`bench-delete-${row.id}`" @click="deleteRow(row.id)">Delete</button>
            <button class="btn-sm btn-select" :data-testid="`bench-select-${row.id}`" @click="selectRow(row.id)">Select</button>
          </td>
        </tr>
      </tbody>
    </table>

    <!-- Nested tree -->
    <div v-if="nestedRows.length > 0" class="bench-nested" data-testid="bench-nested-tree">
      <h3>Nested Tree</h3>
      <TreeNode v-for="node in nestedRows" :key="node.id" :node="node" :depth="0" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, nextTick, defineComponent, h } from "vue";
import type { BenchmarkRow, TimingResult, CellType } from "../types/benchmark";
import {
  buildRows, buildCells, isImageCell, buildNestedTree, countNodes, resetId,
} from "../types/benchmark";

// ── State ──
const rows = ref<BenchmarkRow[]>([]);
const nestedRows = ref<BenchmarkRow[]>([]);
const timings = ref<TimingResult[]>([]);
const selectedId = ref<number | null>(null);
const gridRows = ref(1000);
const gridCols = ref(5);
const cellType = ref<CellType>("text");
const addColsCount = ref(1);
const opsCount = ref(1);
const opsPosition = ref<"start" | "middle" | "end" | "random">("start");
const lastReadCell = ref("");

const nestedCount = computed(() => countNodes(nestedRows.value));
const extraColCount = computed(() => rows.value[0]?.cells.length ?? 0);

// ── Timing helper: the "in-app" measurement the E2E tests scrape ──
// t0 → mutate reactive state → await nextTick() (Vue has flushed its reactive
// queue and patched the real DOM, but the browser has not painted yet) → t1.
// So durationMs = reactivity + virtual-DOM diff + DOM mutation, with no test
// harness or paint overhead. Each entry renders as a row in the bench-timings
// table, where Playwright's readLatestInAppTiming() reads it (in_app_ms).
async function timed(operation: string, fn: () => void) {
  const t0 = performance.now();
  fn();
  await nextTick();
  const t1 = performance.now();
  timings.value = [...timings.value, { operation, durationMs: t1 - t0 }];
}

// ── Create N rows ──
function createN(n: number) { timed(`Create ${n.toLocaleString()} rows`, () => { rows.value = buildRows(n, 0, cellType.value); }); }

// ── Create rows × cols grid (constant cell-budget benchmark) ──
function createGrid() {
  const n = Math.max(1, Math.floor(gridRows.value) || 1);
  const c = Math.max(1, Math.floor(gridCols.value) || 1);
  timed(`Create ${n.toLocaleString()}×${c} grid`, () => {
    rows.value = buildRows(n, c - 1, cellType.value);
  });
}

// ── Add C columns to every existing row ──
function addColumns() {
  const c = Math.max(1, Math.floor(addColsCount.value) || 1);
  timed(`Add ${c.toLocaleString()} columns`, () => {
    rows.value = rows.value.map((r) => ({ ...r, cells: [...r.cells, ...buildCells(c, cellType.value)] }));
  });
}

// ── Positional grid ops (start / middle / end / random) ──
function opsN(): number { return Math.max(1, Math.floor(opsCount.value) || 1); }
// RAND-MID strategy: random index within the middle third of the sequence
function middleThirdRandom(len: number): number {
  const third = Math.max(1, Math.floor(len / 3));
  return Math.min(len - 1, third + Math.floor(Math.random() * third));
}
function insertIndex(len: number): number {
  if (opsPosition.value === "start") return 0;
  if (opsPosition.value === "middle") return Math.floor(len / 2);
  if (opsPosition.value === "end") return len;
  return middleThirdRandom(len);
}
// Centered removal for "middle" so the deleted block sits mid-grid
function deleteIndex(len: number, n: number): number {
  if (opsPosition.value === "start") return 0;
  if (opsPosition.value === "middle") return Math.floor((len - n) / 2);
  if (opsPosition.value === "end") return len - n;
  return Math.min(middleThirdRandom(len), Math.max(0, len - n));
}
function targetIndex(len: number): number {
  if (opsPosition.value === "start") return 0;
  if (opsPosition.value === "middle") return Math.floor(len / 2);
  if (opsPosition.value === "end") return len - 1;
  return middleThirdRandom(len);
}

function addRowsAt() {
  const n = opsN();
  timed(`Add ${n.toLocaleString()} rows at ${opsPosition.value}`, () => {
    const next = [...rows.value];
    next.splice(insertIndex(next.length), 0, ...buildRows(n, extraColCount.value, cellType.value));
    rows.value = next;
  });
}

function deleteRowsAt() {
  const n = Math.min(opsN(), rows.value.length);
  timed(`Delete ${n.toLocaleString()} rows at ${opsPosition.value}`, () => {
    const next = [...rows.value];
    next.splice(deleteIndex(next.length, n), n);
    rows.value = next;
  });
}

function addColsAt() {
  const n = opsN();
  timed(`Add ${n.toLocaleString()} cols at ${opsPosition.value}`, () => {
    rows.value = rows.value.map((r) => {
      const cells = [...r.cells];
      cells.splice(insertIndex(cells.length), 0, ...buildCells(n, cellType.value));
      return { ...r, cells };
    });
  });
}

function deleteColsAt() {
  const n = Math.min(opsN(), extraColCount.value);
  timed(`Delete ${n.toLocaleString()} cols at ${opsPosition.value}`, () => {
    rows.value = rows.value.map((r) => {
      const cells = [...r.cells];
      cells.splice(deleteIndex(cells.length, n), n);
      return { ...r, cells };
    });
  });
}

function editRowAt() {
  timed(`Edit row at ${opsPosition.value}`, () => {
    if (rows.value.length === 0) return;
    const idx = targetIndex(rows.value.length);
    rows.value = rows.value.map((r, i) =>
      i === idx ? { ...r, cells: buildCells(r.cells.length, cellType.value) } : r
    );
  });
}

function editColAt() {
  timed(`Edit col at ${opsPosition.value}`, () => {
    if (extraColCount.value === 0) return;
    const idx = targetIndex(extraColCount.value);
    rows.value = rows.value.map((r) => {
      const cells = [...r.cells];
      cells[idx] = buildCells(1, cellType.value)[0];
      return { ...r, cells };
    });
  });
}

// ── Single-cell access: write / read at (rowPos, colPos) = (pos, pos) ──
function updateCellAt() {
  timed(`Update cell at ${opsPosition.value}`, () => {
    if (rows.value.length === 0 || extraColCount.value === 0) return;
    const ri = targetIndex(rows.value.length);
    const ci = targetIndex(extraColCount.value);
    rows.value = rows.value.map((r, i) =>
      i === ri ? { ...r, cells: r.cells.map((c, j) => (j === ci ? buildCells(1, cellType.value)[0] : c)) } : r
    );
  });
}

function readCellAt() {
  timed(`Read cell at ${opsPosition.value}`, () => {
    if (rows.value.length === 0 || extraColCount.value === 0) return;
    const ri = targetIndex(rows.value.length);
    const ci = targetIndex(extraColCount.value);
    lastReadCell.value = String(rows.value[ri].cells[ci]);
  });
}

// ── H3 decomposition probe: r sequential single-cell updates, one render each ──
async function updateColSequential() {
  if (rows.value.length === 0 || extraColCount.value === 0) return;
  const ci = targetIndex(extraColCount.value);
  const total = rows.value.length;
  const t0 = performance.now();
  for (let ri = 0; ri < total; ri++) {
    rows.value = rows.value.map((r, i) =>
      i === ri ? { ...r, cells: r.cells.map((c, j) => (j === ci ? buildCells(1, cellType.value)[0] : c)) } : r
    );
    await nextTick();
  }
  const t1 = performance.now();
  timings.value = [...timings.value, { operation: `Sequential edit col (${total} renders)`, durationMs: t1 - t0 }];
}

// ── 3. Append 1,000 rows ──
function append1k() { timed("Append 1,000 rows", () => { rows.value = [...rows.value, ...buildRows(1_000, extraColCount.value, cellType.value)]; }); }

// ── 3b. Append 1 row ──
function appendOne() { timed("Append 1 row", () => { rows.value = [...rows.value, ...buildRows(1, extraColCount.value, cellType.value)]; }); }

// ── 3c. Prepend N rows (insert at the beginning) ──
function prependRows(n: number) {
  timed(`Prepend ${n.toLocaleString()} rows`, () => {
    rows.value = [...buildRows(n, extraColCount.value, cellType.value), ...rows.value];
  });
}

// ── 3d. Insert N rows at the middle ──
function insertRowsMiddle(n: number) {
  timed(`Insert ${n.toLocaleString()} rows at middle`, () => {
    const mid = Math.floor(rows.value.length / 2);
    const next = [...rows.value];
    next.splice(mid, 0, ...buildRows(n, extraColCount.value, cellType.value));
    rows.value = next;
  });
}

// ── 4. Update every 10th row ──
function updateEvery10th() {
  timed("Update every 10th row", () => {
    rows.value = rows.value.map((r, i) =>
      i % 10 === 0
        ? { ...r, label: r.label + " !!!", cells: r.cells.map((c) => c + " !!!") }
        : r
    );
  });
}

// ── 4a. Update every row ──
function updateEveryRow() {
  timed("Update every row", () => {
    rows.value = rows.value.map((r) => ({
      ...r,
      label: r.label + " !!!",
      cells: r.cells.map((c) => c + " !!!"),
    }));
  });
}

// ── 4b. Update a single row (first row) ──
function updateSingleRow() {
  timed("Update single row", () => {
    if (rows.value.length === 0) return;
    rows.value = rows.value.map((r, i) =>
      i === 0
        ? { ...r, label: r.label + " !!!", cells: r.cells.map((c) => c + " !!!") }
        : r
    );
  });
}

// ── 4c. Delete first row ──
function deleteFirstRow() {
  timed("Delete first row", () => {
    if (rows.value.length === 0) return;
    rows.value = rows.value.slice(1);
  });
}

// ── 5. Replace all rows (same count, new data) ──
function replaceAll() {
  timed(`Replace all ${rows.value.length} rows`, () => {
    rows.value = buildRows(rows.value.length, extraColCount.value, cellType.value);
  });
}

// ── 6. Select / highlight a row ──
function selectRow(id: number) {
  timed(`Select row ${id}`, () => {
    selectedId.value = id;
    rows.value = rows.value.map((r) => ({
      ...r,
      className: r.id === id ? "highlight" : "",
    }));
  });
}

// ── 7. Swap two rows (2nd ↔ second-to-last) ──
function swapRows() {
  if (rows.value.length < 4) return;
  timed("Swap rows", () => {
    const next = [...rows.value];
    const a = 1;
    const b = next.length - 2;
    [next[a], next[b]] = [next[b], next[a]];
    rows.value = next;
  });
}

// ── 8. Delete a single row ──
function deleteRow(id: number) {
  timed(`Delete row ${id}`, () => {
    rows.value = rows.value.filter((r) => r.id !== id);
  });
}

// ── 9. Clear all rows ──
function clearRows() {
  timed("Clear all rows", () => {
    rows.value = [];
    resetId();
  });
}

// ── 10. Render deeply nested tree (depth=5, breadth=10 → 111,111 nodes) ──
function createNested() {
  timed("Create nested tree (5×10)", () => {
    nestedRows.value = buildNestedTree(5, 10);
  });
}

function clearNested() {
  timed("Clear nested tree", () => {
    nestedRows.value = [];
  });
}

// ── Recursive tree-node component (inline) ──
// Explicit VNode return type avoids recursive inference error
const TreeNode: ReturnType<typeof defineComponent> = defineComponent({
  name: "TreeNode",
  props: {
    node: { type: Object as () => BenchmarkRow, required: true },
    depth: { type: Number, required: true },
  },
  setup(props): () => ReturnType<typeof h> {
    return () =>
      h("div", { class: "tree-node", style: `margin-left: ${props.depth * 12}px` }, [
        h("span", { class: "tree-label" }, `[${props.node.id}] ${props.node.label}`),
        ...(props.node.children || []).map((child: BenchmarkRow) =>
          h(TreeNode, { node: child, depth: props.depth + 1, key: child.id })
        ),
      ]);
  },
});
</script>
