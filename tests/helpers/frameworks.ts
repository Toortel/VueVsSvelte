/**
 * frameworks.ts – framework configuration for benchmark tests.
 * Single source of truth for URLs and names.
 */
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export interface FrameworkConfig {
  name: string;
  baseUrl: string;
  benchmarkPath: string;
  chartsPath: string;
  kanbanPath: string;
  reportsPath: string;
  reportsCreatePath: string;
  /** Absolute path to the framework project directory */
  projectDir: string;
  /** Build command to run inside projectDir */
  buildCommand: string;
  /** Relative path (from projectDir) to the production build output */
  distDir: string;
}

export const FRAMEWORKS: FrameworkConfig[] = [
  {
    name: "Vue",
    baseUrl: "http://localhost:5173",
    benchmarkPath: "/benchmark",
    chartsPath: "/charts",
    kanbanPath: "/kanban",
    reportsPath: "/reports",
    reportsCreatePath: "/reports/create",
    projectDir: path.resolve(__dirname, "../../apps/frontend-vue"),
    buildCommand: "npm run build",
    distDir: "dist",
  },
  {
    name: "Svelte",
    baseUrl: "http://localhost:5174",
    benchmarkPath: "/benchmark",
    chartsPath: "/charts",
    kanbanPath: "/kanban",
    reportsPath: "/reports",
    reportsCreatePath: "/reports/create",
    projectDir: path.resolve(__dirname, "../../apps/frontend-svelte-plain"),
    buildCommand: "npm run build",
    distDir: "dist",
  },
];
