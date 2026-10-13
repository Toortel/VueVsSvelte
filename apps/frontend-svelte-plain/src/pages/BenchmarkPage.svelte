<script lang="ts">
  // BenchmarkPage.svelte – framework performance stress-test view.
  // IDENTICAL operations to the Vue twin (views/BenchmarkView.vue); any edit
  // here must be mirrored there, otherwise the frameworks measure different work.
  //
  // Operations (each timed via performance.now() in timed()):
  //   - Create N rows / rows×cols grid with a selectable cell type
  //   - Append / prepend / mid-insert rows; add columns
  //   - Positional grid ops (@gridops): add/delete rows & cols, edit row/col,
  //     update/read a single cell at start | middle | end, sequential col edit
  //   - Update every / every 10th / single row; replace, swap, select, delete
  //   - Deeply nested tree (depth 5 × breadth 10)
  import { tick } from "svelte";
  import type { BenchmarkRow, TimingResult, CellType } from "$lib/types/benchmark";
  import {
    buildRows, buildCells, isImageCell, buildNestedTree, countNodes, resetId,
  } from "$lib/types/benchmark";

  // ── Reactive state ──
  let rows = $state<BenchmarkRow[]>([]);
  let nestedRows = $state<BenchmarkRow[]>([]);
  let timings = $state<TimingResult[]>([]);
  let selectedId = $state<number | null>(null);
  let gridRows = $state(1000);
  let gridCols = $state(5);
  let cellType = $state<CellType>("text");
  let addColsCount = $state(1);
  let opsCount = $state(1);
  let opsPosition = $state<"start" | "middle" | "end" | "random">("start");
  let lastReadCell = $state("");

  const nestedCount = $derived(countNodes(nestedRows));
  const extraColCount = $derived(rows[0]?.cells.length ?? 0);

  // ── Timing helper: the "in-app" measurement the E2E tests scrape ──
  // t0 → mutate $state → await tick() (Svelte has applied its fine-grained
  // updates to the real DOM, but the browser has not painted yet) → t1.
  // So durationMs = reactivity + DOM mutation, with no test harness or paint
  // overhead. Each entry renders as a row in the bench-timings table, where
  // Playwright's readLatestInAppTiming() reads it (in_app_ms).
  async function timed(operation: string, fn: () => void) {
    const t0 = performance.now();
    fn();
    await tick();
    const t1 = performance.now();
    timings = [...timings, { operation, durationMs: t1 - t0 }];
  }

  // ── Create N rows (cell type from the selector) ──
  function createN(n: number) { timed(`Create ${n.toLocaleString()} rows`, () => { rows = buildRows(n, 0, cellType); }); }

  // Create rows × cols grid (constant cell-budget benchmark)
  function createGrid() {
    const n = Math.max(1, Math.floor(gridRows) || 1);
    const c = Math.max(1, Math.floor(gridCols) || 1);
    timed(`Create ${n.toLocaleString()}×${c} grid`, () => {
      rows = buildRows(n, c - 1, cellType);
    });
  }

  // Add C columns to every existing row
  function addColumns() {
    const c = Math.max(1, Math.floor(addColsCount) || 1);
    timed(`Add ${c.toLocaleString()} columns`, () => {
      rows = rows.map((r) => ({ ...r, cells: [...r.cells, ...buildCells(c, cellType)] }));
    });
  }

  // Positional grid ops (start / middle / end / random)
  function opsN(): number { return Math.max(1, Math.floor(opsCount) || 1); }
  // RAND-MID strategy: random index within the middle third of the sequence
  function middleThirdRandom(len: number): number {
    const third = Math.max(1, Math.floor(len / 3));
    return Math.min(len - 1, third + Math.floor(Math.random() * third));
  }
  function insertIndex(len: number): number {
    if (opsPosition === "start") return 0;
    if (opsPosition === "middle") return Math.floor(len / 2);
    if (opsPosition === "end") return len;
    return middleThirdRandom(len);
  }
  // Centered removal for "middle" so the deleted block sits mid-grid
  function deleteIndex(len: number, n: number): number {
    if (opsPosition === "start") return 0;
    if (opsPosition === "middle") return Math.floor((len - n) / 2);
    if (opsPosition === "end") return len - n;
    return Math.min(middleThirdRandom(len), Math.max(0, len - n));
  }
  function targetIndex(len: number): number {
    if (opsPosition === "start") return 0;
    if (opsPosition === "middle") return Math.floor(len / 2);
    if (opsPosition === "end") return len - 1;
    return middleThirdRandom(len);
  }

  function addRowsAt() {
    const n = opsN();
    timed(`Add ${n.toLocaleString()} rows at ${opsPosition}`, () => {
      const next = [...rows];
      next.splice(insertIndex(next.length), 0, ...buildRows(n, extraColCount, cellType));
      rows = next;
    });
  }

  function deleteRowsAt() {
    const n = Math.min(opsN(), rows.length);
    timed(`Delete ${n.toLocaleString()} rows at ${opsPosition}`, () => {
      const next = [...rows];
      next.splice(deleteIndex(next.length, n), n);
      rows = next;
    });
  }

  function addColsAt() {
    const n = opsN();
    timed(`Add ${n.toLocaleString()} cols at ${opsPosition}`, () => {
      rows = rows.map((r) => {
        const cells = [...r.cells];
        cells.splice(insertIndex(cells.length), 0, ...buildCells(n, cellType));
        return { ...r, cells };
      });
    });
  }

  function deleteColsAt() {
    const n = Math.min(opsN(), extraColCount);
    timed(`Delete ${n.toLocaleString()} cols at ${opsPosition}`, () => {
      rows = rows.map((r) => {
        const cells = [...r.cells];
        cells.splice(deleteIndex(cells.length, n), n);
        return { ...r, cells };
      });
    });
  }

  function editRowAt() {
    timed(`Edit row at ${opsPosition}`, () => {
      if (rows.length === 0) return;
      const idx = targetIndex(rows.length);
      rows = rows.map((r, i) =>
        i === idx ? { ...r, cells: buildCells(r.cells.length, cellType) } : r
      );
    });
  }

  function editColAt() {
    timed(`Edit col at ${opsPosition}`, () => {
      if (extraColCount === 0) return;
      const idx = targetIndex(extraColCount);
      rows = rows.map((r) => {
        const cells = [...r.cells];
        cells[idx] = buildCells(1, cellType)[0];
        return { ...r, cells };
      });
    });
  }

  // Single-cell access: write / read at (rowPos, colPos) = (pos, pos)
  function updateCellAt() {
    timed(`Update cell at ${opsPosition}`, () => {
      if (rows.length === 0 || extraColCount === 0) return;
      const ri = targetIndex(rows.length);
      const ci = targetIndex(extraColCount);
      rows = rows.map((r, i) =>
        i === ri ? { ...r, cells: r.cells.map((c, j) => (j === ci ? buildCells(1, cellType)[0] : c)) } : r
      );
    });
  }

  function readCellAt() {
    timed(`Read cell at ${opsPosition}`, () => {
      if (rows.length === 0 || extraColCount === 0) return;
      const ri = targetIndex(rows.length);
      const ci = targetIndex(extraColCount);
      lastReadCell = String(rows[ri].cells[ci]);
    });
  }

  // H3 decomposition probe: r sequential single-cell updates, one render each
  async function updateColSequential() {
    if (rows.length === 0 || extraColCount === 0) return;
    const ci = targetIndex(extraColCount);
    const total = rows.length;
    const t0 = performance.now();
    for (let ri = 0; ri < total; ri++) {
      rows = rows.map((r, i) =>
        i === ri ? { ...r, cells: r.cells.map((c, j) => (j === ci ? buildCells(1, cellType)[0] : c)) } : r
      );
      await tick();
    }
    const t1 = performance.now();
    timings = [...timings, { operation: `Sequential edit col (${total} renders)`, durationMs: t1 - t0 }];
  }

  // ── Append rows at the end (keyed list grows in place) ──
  function append1k() { timed("Append 1,000 rows", () => { rows = [...rows, ...buildRows(1_000, extraColCount, cellType)]; }); }
  function appendOne() { timed("Append 1 row", () => { rows = [...rows, ...buildRows(1, extraColCount, cellType)]; }); }

  // Prepend N rows (insert at the beginning)
  function prependRows(n: number) {
    timed(`Prepend ${n.toLocaleString()} rows`, () => {
      rows = [...buildRows(n, extraColCount, cellType), ...rows];
    });
  }

  // Insert N rows at the middle
  function insertRowsMiddle(n: number) {
    timed(`Insert ${n.toLocaleString()} rows at middle`, () => {
      const mid = Math.floor(rows.length / 2);
      const next = [...rows];
      next.splice(mid, 0, ...buildRows(n, extraColCount, cellType));
      rows = next;
    });
  }

  // ── Update every 10th row (partial keyed update) ──
  function updateEvery10th() {
    timed("Update every 10th row", () => {
      rows = rows.map((r, i) =>
        i % 10 === 0
          ? { ...r, label: r.label + " !!!", cells: r.cells.map((c) => c + " !!!") }
          : r
      );
    });
  }

  // ── Update every row (full-table text mutation, keys unchanged) ──
  function updateEveryRow() {
    timed("Update every row", () => {
      rows = rows.map((r) => ({
        ...r,
        label: r.label + " !!!",
        cells: r.cells.map((c) => c + " !!!"),
      }));
    });
  }

  // ── Update a single row (first row) ──
  function updateSingleRow() {
    timed("Update single row", () => {
      if (rows.length === 0) return;
      rows = rows.map((r, i) =>
        i === 0
          ? { ...r, label: r.label + " !!!", cells: r.cells.map((c) => c + " !!!") }
          : r
      );
    });
  }

  // ── Delete first row (single unmount + list shift) ──
  function deleteFirstRow() {
    timed("Delete first row", () => {
      if (rows.length === 0) return;
      rows = rows.slice(1);
    });
  }

  // ── Replace all rows: same count, new data → every keyed row remounts ──
  function replaceAll() {
    timed(`Replace all ${rows.length} rows`, () => {
      rows = buildRows(rows.length, extraColCount, cellType);
    });
  }

  // ── Select / highlight a row (className change on every row) ──
  function selectRow(id: number) {
    timed(`Select row ${id}`, () => {
      selectedId = id;
      rows = rows.map((r) => ({
        ...r,
        className: r.id === id ? "highlight" : "",
      }));
    });
  }

  // ── Swap two rows (2nd ↔ second-to-last; keyed-reorder cost) ──
  function swapRows() {
    if (rows.length < 4) return;
    timed("Swap rows", () => {
      const next = [...rows];
      const a = 1;
      const b = next.length - 2;
      [next[a], next[b]] = [next[b], next[a]];
      rows = next;
    });
  }

  // ── Delete a single row by id ──
  function deleteRow(id: number) {
    timed(`Delete row ${id}`, () => {
      rows = rows.filter((r) => r.id !== id);
    });
  }

  // ── Clear all rows: one state update unmounts the whole grid subtree.
  // resetId() keeps generated ids comparable across tests. Used as teardown
  // by the E2E suites (bench-clear).
  function clearRows() {
    timed("Clear all rows", () => {
      rows = [];
      resetId();
    });
  }

  // ── Deeply nested tree: depth 5 × breadth 10 → 111,111 nodes ──
  function createNested() {
    timed("Create nested tree (5×10)", () => {
      nestedRows = buildNestedTree(5, 10);
    });
  }

  function clearNested() {
    timed("Clear nested tree", () => {
      nestedRows = [];
    });
  }

  function clearTimings() { timings = []; }
</script>

{#snippet treeNode(node: BenchmarkRow, depth: number)}
  <!-- Recursive tree renderer for the nested benchmark (Vue uses a render-fn component) -->
  <div class="tree-node" style="margin-left: {depth * 12}px">
    <span class="tree-label">[{node.id}] {node.label}</span>
    {#each node.children as child (child.id)}
      {@render treeNode(child, depth + 1)}
    {/each}
  </div>
{/snippet}

<div>
  <h2>⚡ Performance Benchmark</h2>
  <p class="bench-subtitle">
    Rows: <strong data-testid="bench-row-count">{rows.length}</strong>
    &nbsp;|&nbsp;Cols: <strong data-testid="bench-col-count">{1 + extraColCount}</strong>
    {#if nestedCount > 0}
      &nbsp;|&nbsp;Nested nodes: <strong data-testid="bench-nested-count">{nestedCount}</strong>
    {/if}
  </p>

  <div class="bench-buttons" data-testid="bench-controls">
    <button class="btn btn-primary" data-testid="bench-create-100" onclick={() => createN(100)}>Create 100 rows</button>
    <button class="btn btn-primary" data-testid="bench-create-500" onclick={() => createN(500)}>Create 500 rows</button>
    <button class="btn btn-primary" data-testid="bench-create-2500" onclick={() => createN(2500)}>Create 2,500 rows</button>
    <button class="btn btn-primary" data-testid="bench-create-12500" onclick={() => createN(12500)}>Create 12,500 rows</button>
    <button class="btn btn-secondary" data-testid="bench-append-1k" onclick={append1k}>Append 1,000 rows</button>
    <button class="btn btn-secondary" data-testid="bench-append-1" onclick={appendOne}>Append 1 row</button>
    <button class="btn btn-secondary" data-testid="bench-prepend-1k" onclick={() => prependRows(1000)}>Prepend 1,000 rows</button>
    <button class="btn btn-secondary" data-testid="bench-prepend-1" onclick={() => prependRows(1)}>Prepend 1 row</button>
    <button class="btn btn-secondary" data-testid="bench-insert-mid-1k" onclick={() => insertRowsMiddle(1000)}>Insert 1,000 rows mid</button>
    <button class="btn btn-secondary" data-testid="bench-insert-mid-1" onclick={() => insertRowsMiddle(1)}>Insert 1 row mid</button>
    <button class="btn btn-secondary" data-testid="bench-update-10th" onclick={updateEvery10th}>Update every 10th row</button>
    <button class="btn btn-secondary" data-testid="bench-update-all" onclick={updateEveryRow}>Update every row</button>
    <button class="btn btn-secondary" data-testid="bench-update-first" onclick={updateSingleRow}>Update single row</button>
    <button class="btn btn-secondary" data-testid="bench-delete-first" onclick={deleteFirstRow}>Delete first row</button>
    <button class="btn btn-secondary" data-testid="bench-replace" onclick={replaceAll}>Replace all rows</button>
    <button class="btn btn-secondary" data-testid="bench-swap" onclick={swapRows}>Swap rows</button>
    <button class="btn btn-secondary" data-testid="bench-clear" onclick={clearRows}>Clear all</button>
    <button class="btn btn-primary" data-testid="bench-nested" onclick={createNested}>Nested tree (depth 5 × 10)</button>
    <button class="btn btn-secondary" data-testid="bench-clear-nested" onclick={clearNested}>Clear nested</button>
  </div>

  <!-- Grid (rows × cols) controls – constant cell-budget benchmark -->
  <div class="bench-grid-controls" data-testid="bench-grid-controls">
    <label>Rows <input type="number" min="1" data-testid="bench-rows-input" bind:value={gridRows} /></label>
    <label>Cols <input type="number" min="1" data-testid="bench-cols-input" bind:value={gridCols} /></label>
    <button class="btn btn-primary" data-testid="bench-create-grid" onclick={createGrid}>Create rows × cols grid</button>
    <label>Cell type
      <select data-testid="bench-celltype-select" bind:value={cellType}>
        <option value="text">Text</option>
        <option value="integer">Integer</option>
        <option value="float">Float</option>
        <option value="image">Image (SVG)</option>
        <option value="image-png">Image (PNG)</option>
      </select>
    </label>
    <label>Add cols <input type="number" min="1" data-testid="bench-add-cols-input" bind:value={addColsCount} /></label>
    <button class="btn btn-primary" data-testid="bench-add-cols" onclick={addColumns}>Add columns</button>
  </div>

  <!-- Positional grid ops – add/delete/edit rows & columns at start/middle/end -->
  <div class="bench-grid-controls" data-testid="bench-ops-controls">
    <label>Count <input type="number" min="1" data-testid="bench-ops-count-input" bind:value={opsCount} /></label>
    <label>Position
      <select data-testid="bench-ops-position" bind:value={opsPosition}>
        <option value="start">start</option>
        <option value="middle">middle</option>
        <option value="end">end</option>
        <option value="random">random (mid ⅓)</option>
      </select>
    </label>
    <button class="btn btn-secondary" data-testid="bench-add-rows-at" onclick={addRowsAt}>Add rows @pos</button>
    <button class="btn btn-secondary" data-testid="bench-delete-rows-at" onclick={deleteRowsAt}>Delete rows @pos</button>
    <button class="btn btn-secondary" data-testid="bench-add-cols-at" onclick={addColsAt}>Add cols @pos</button>
    <button class="btn btn-secondary" data-testid="bench-delete-cols-at" onclick={deleteColsAt}>Delete cols @pos</button>
    <button class="btn btn-secondary" data-testid="bench-edit-row-at" onclick={editRowAt}>Edit row @pos</button>
    <button class="btn btn-secondary" data-testid="bench-edit-col-at" onclick={editColAt}>Edit col @pos</button>
    <button class="btn btn-secondary" data-testid="bench-update-cell" onclick={updateCellAt}>Update cell @pos</button>
    <button class="btn btn-secondary" data-testid="bench-read-cell" onclick={readCellAt}>Read cell @pos</button>
    <button class="btn btn-secondary" data-testid="bench-edit-col-seq" onclick={updateColSequential}>Seq edit col @pos</button>
    <span data-testid="bench-read-value">{lastReadCell.slice(0, 24)}</span>
  </div>

  {#if timings.length > 0}
    <div class="bench-timings card" data-testid="bench-timings">
      <h3>Timing Results</h3>
      <table>
        <thead>
          <tr><th>#</th><th>Operation</th><th>Duration</th></tr>
        </thead>
        <tbody>
          {#each timings as t, idx}
            <tr>
              <td>{idx + 1}</td>
              <td>{t.operation}</td>
              <td class="timing-value">{t.durationMs.toFixed(2)} ms</td>
            </tr>
          {/each}
        </tbody>
      </table>
      <button class="btn btn-secondary" style="margin-top:.5rem" onclick={clearTimings}>Clear log</button>
    </div>
  {/if}

  {#if rows.length > 0}
    <table class="bench-table" data-testid="bench-table">
      <thead>
        <tr>
          <th style="width:80px">ID</th>
          <th>Label</th>
          {#each { length: extraColCount } as _, i}
            <th>Col {i + 2}</th>
          {/each}
          <th style="width:120px">Actions</th>
        </tr>
      </thead>
      <tbody>
        {#each rows as row (row.id)}
          <tr class={row.className} data-testid="bench-row-{row.id}">
            <td>{row.id}</td>
            <td>
              {#if isImageCell(row.label)}
                <img class="bench-cell-img" src={row.label} width="16" height="16" loading="lazy" alt="cell" />
              {:else}
                {row.label}
              {/if}
            </td>
            {#each row.cells as cell, ci (ci)}
              <td>
                {#if isImageCell(cell)}
                  <img class="bench-cell-img" src={cell} width="16" height="16" loading="lazy" alt="cell" />
                {:else}
                  {cell}
                {/if}
              </td>
            {/each}
            <td>
              <button class="btn-sm btn-danger" data-testid="bench-delete-{row.id}" onclick={() => deleteRow(row.id)}>Delete</button>
              <button class="btn-sm btn-select" data-testid="bench-select-{row.id}" onclick={() => selectRow(row.id)}>Select</button>
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  {/if}

  {#if nestedRows.length > 0}
    <div class="bench-nested" data-testid="bench-nested-tree">
      <h3>Nested Tree</h3>
      {#each nestedRows as node (node.id)}
        {@render treeNode(node, 0)}
      {/each}
    </div>
  {/if}
</div>
