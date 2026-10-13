<!--
  AppLayout.vue – global navigation bar.
  In Svelte the equivalent is +layout.svelte with <nav> + {@render children()}.
  Active link detection: Vue uses router-link + isActive; Svelte uses $page.url.pathname.
-->
<template>
  <nav class="topbar">
    <h1>💰 Budget Reporting</h1>
    <div class="nav-links">
      <RouterLink to="/reports" data-testid="nav-reports">Reports</RouterLink>
      <RouterLink to="/kanban" data-testid="nav-kanban">Kanban</RouterLink>
      <RouterLink to="/dashboard" data-testid="nav-dashboard">Dashboard</RouterLink>
      <RouterLink to="/benchmark" data-testid="nav-benchmark">Benchmark</RouterLink>
      <RouterLink to="/charts" data-testid="nav-charts">Charts</RouterLink>
    </div>
  </nav>
  <div class="container">
    <slot />
  </div>
</template>

<script setup lang="ts">
import { RouterLink } from "vue-router";
</script>
