/**
 * API client for Budget Reporting – Svelte version (plain Vite).
 * Identical to the SvelteKit version.
 */
import type { Report, ReportListParams, ReportListResult } from "../types/report";

const BASE = "/api/reports";

/** Build query string from params, omitting empty values */
function toQuery(params: Record<string, string | number | undefined>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== "") sp.set(k, String(v));
  }
  return sp.toString();
}

/** GET /api/reports – paginated list, returns data[] + totalCount from X-Total-Count */
export async function listReports(params: ReportListParams = {}): Promise<ReportListResult> {
  const qs = toQuery({
    page: params.page,
    pageSize: params.pageSize,
    q: params.q,
    status: params.status || undefined,
    sort: params.sort,
    name: params.name || undefined,
    owner: params.owner || undefined,
    department: params.department || undefined,
    category: params.category || undefined,
    priority: params.priority || undefined,
    tags: params.tags || undefined,
    approvedBy: params.approvedBy || undefined,
    currency: params.currency || undefined,
  });
  const res = await fetch(`${BASE}?${qs}`);
  if (!res.ok) throw new Error(`Failed to fetch reports: ${res.status}`);
  const totalCount = parseInt(res.headers.get("X-Total-Count") ?? "0", 10);
  const data: Report[] = await res.json();
  return { data, totalCount };
}

/** GET /api/reports/:id – single report */
export async function getReport(id: number): Promise<Report> {
  const res = await fetch(`${BASE}/${id}`);
  if (!res.ok) throw new Error(`Failed to fetch report ${id}: ${res.status}`);
  return res.json();
}

/** PUT /api/reports/:id – update report, returns updated object */
export async function updateReport(id: number, body: Partial<Report>): Promise<Report> {
  const res = await fetch(`${BASE}/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Failed to update report ${id}: ${res.status}`);
  return res.json();
}

/** POST /api/reports – create new report, returns created object */
export async function createReport(body: Partial<Report>): Promise<Report> {
  const res = await fetch(BASE, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Failed to create report: ${res.status}`);
  return res.json();
}

/** DELETE /api/reports/:id – delete report */
export async function deleteReport(id: number): Promise<void> {
  const res = await fetch(`${BASE}/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error(`Failed to delete report ${id}: ${res.status}`);
}

/** PATCH /api/reports/bulk – bulk action (updateStatus or delete) */
export async function bulkAction(
  ids: number[],
  action: "updateStatus" | "delete",
  status?: string,
): Promise<{ count: number }> {
  const res = await fetch(`${BASE}/bulk`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ids, action, status }),
  });
  if (!res.ok) throw new Error(`Bulk action failed: ${res.status}`);
  return res.json();
}
