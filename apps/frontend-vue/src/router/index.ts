/**
 * Vue Router – file-based equivalent in Svelte is SvelteKit's routes/ directory.
 * Vue uses explicit route definitions; SvelteKit infers them from folder structure.
 */
import { createRouter, createWebHistory } from "vue-router";

const routes = [
  { path: "/", redirect: "/reports" },
  {
    path: "/reports",
    name: "ReportsList",
    component: () => import("../views/ReportsListView.vue"),
  },
  {
    path: "/reports/create",
    name: "ReportCreate",
    component: () => import("../views/ReportCreateView.vue"),
  },
  {
    path: "/reports/:id",
    name: "ReportEdit",
    component: () => import("../views/ReportEditView.vue"),
  },
  {
    path: "/kanban",
    name: "Kanban",
    component: () => import("../views/KanbanView.vue"),
  },
  {
    path: "/dashboard",
    name: "Dashboard",
    component: () => import("../views/DashboardView.vue"),
  },
  {
    path: "/benchmark",
    name: "Benchmark",
    component: () => import("../views/BenchmarkView.vue"),
  },
  {
    path: "/charts",
    name: "Charts",
    component: () => import("../views/ChartsBenchmarkView.vue"),
  },
];

export const router = createRouter({
  history: createWebHistory(),
  routes,
});
