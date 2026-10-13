<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { getCurrentPath, navigate, onPathChange } from "./lib/router";
  import "./app.css";

  import ReportsListPage from "./pages/ReportsListPage.svelte";
  import ReportCreatePage from "./pages/ReportCreatePage.svelte";
  import ReportEditPage from "./pages/ReportEditPage.svelte";
  import KanbanPage from "./pages/KanbanPage.svelte";
  import DashboardPage from "./pages/DashboardPage.svelte";
  import BenchmarkPage from "./pages/BenchmarkPage.svelte";
  import ChartsPage from "./pages/ChartsPage.svelte";

  let path = $state(getCurrentPath());

  const unsub = onPathChange(() => {
    path = getCurrentPath();
  });

  onMount(() => {
    if (path === "/") navigate("/reports");
  });

  onDestroy(unsub);

  const isActive = (prefix: string) => path.startsWith(prefix);

  // Extract route param for /reports/:id
  let reportId = $derived.by(() => {
    const match = path.match(/^\/reports\/(\d+)$/);
    return match ? Number(match[1]) : null;
  });

  function handleNavClick(e: MouseEvent, href: string) {
    e.preventDefault();
    navigate(href);
  }
</script>

<nav class="topbar">
  <h1>💰 Budget Reporting</h1>
  <div class="nav-links">
    <!-- svelte-ignore a11y_invalid_attribute -->
    <a href="/reports" class:active={isActive("/reports")} data-testid="nav-reports" onclick={(e) => handleNavClick(e, "/reports")}>Reports</a>
    <!-- svelte-ignore a11y_invalid_attribute -->
    <a href="/kanban" class:active={isActive("/kanban")} data-testid="nav-kanban" onclick={(e) => handleNavClick(e, "/kanban")}>Kanban</a>
    <!-- svelte-ignore a11y_invalid_attribute -->
    <a href="/dashboard" class:active={isActive("/dashboard")} data-testid="nav-dashboard" onclick={(e) => handleNavClick(e, "/dashboard")}>Dashboard</a>
    <!-- svelte-ignore a11y_invalid_attribute -->
    <a href="/benchmark" class:active={isActive("/benchmark")} data-testid="nav-benchmark" onclick={(e) => handleNavClick(e, "/benchmark")}>Benchmark</a>
    <!-- svelte-ignore a11y_invalid_attribute -->
    <a href="/charts" class:active={isActive("/charts")} data-testid="nav-charts" onclick={(e) => handleNavClick(e, "/charts")}>Charts</a>
  </div>
</nav>
<div class="container">
  {#if path === "/reports"}
    <ReportsListPage />
  {:else if path === "/reports/create"}
    <ReportCreatePage />
  {:else if reportId !== null}
    <ReportEditPage id={reportId} />
  {:else if path === "/kanban"}
    <KanbanPage />
  {:else if path === "/dashboard"}
    <DashboardPage />
  {:else if path === "/benchmark"}
    <BenchmarkPage />
  {:else if path === "/charts"}
    <ChartsPage />
  {:else}
    <p>Redirecting to reports…</p>
  {/if}
</div>
