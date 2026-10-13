/** Shared Report type – identical in Vue and Svelte apps */

export type ReportStatus = "draft" | "published" | "archived";
export type Currency = "PLN" | "EUR" | "USD" | "GBP" | "CHF";
export type Priority = "low" | "medium" | "high" | "critical";

export interface LineItem {
  id: number;
  description: string;
  quantity: number;
  unitPrice: number;
  total: number;
}

export interface Report {
  id: number;
  name: string;
  owner: string;
  status: ReportStatus;
  amount: number;
  currency: Currency;
  department: string;
  category: string;
  priority: Priority;
  tags: string;          // comma-separated
  approvedBy: string;
  periodFrom: string;    // YYYY-MM-DD
  periodTo: string;      // YYYY-MM-DD
  updatedAt: string;     // ISO datetime
  description: string;
  lineItems: LineItem[];
}

export interface ReportListParams {
  page?: number;
  pageSize?: number;
  q?: string;
  status?: ReportStatus | "";
  sort?: string;
  // per-column search
  name?: string;
  owner?: string;
  department?: string;
  category?: string;
  priority?: Priority | "";
  tags?: string;
  approvedBy?: string;
  currency?: string;
}

export interface ReportListResult {
  data: Report[];
  totalCount: number;
}

export interface ValidationErrors {
  [field: string]: string;
}
