/**
 * global-setup.ts – runs once per Playwright invocation (before any worker).
 * Clears result spill files so a run never inherits results from a previous run.
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RESULTS_DIR = path.resolve(__dirname, "benchmark-results");

export default function globalSetup(): void {
  if (!fs.existsSync(RESULTS_DIR)) return;
  for (const f of fs.readdirSync(RESULTS_DIR)) {
    if (f.startsWith(".spill-") && f.endsWith(".jsonl")) {
      fs.rmSync(path.join(RESULTS_DIR, f));
    }
  }
}
