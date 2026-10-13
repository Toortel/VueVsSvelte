export type ReportStatus = "draft" | "published" | "archived";
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
  currency: string;
  department: string;
  category: string;
  priority: Priority;
  tags: string;          // comma-separated
  approvedBy: string;    // can be empty
  periodFrom: string;    // ISO date  YYYY-MM-DD
  periodTo: string;      // ISO date  YYYY-MM-DD
  updatedAt: string;     // ISO datetime
  description: string;
  lineItems: LineItem[];
}

export interface PaginatedResponse<T> {
  data: T[];
  meta: {
    page: number;
    pageSize: number;
    totalItems: number;
    totalPages: number;
  };
}

export interface ReportListQuery {
  page?: number;
  pageSize?: number;
  q?: string;
  status?: ReportStatus;
  sort?: string;          // e.g. "updatedAt:desc"
  // per-column search filters
  name?: string;
  owner?: string;
  department?: string;
  category?: string;
  priority?: Priority;
  tags?: string;
  approvedBy?: string;
  currency?: string;
}
