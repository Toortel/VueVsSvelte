import { Router } from "express";
import { reports } from "../data/seed.js";
import type { Report, ReportListQuery, PaginatedResponse } from "../types/report.js";

const router = Router();

// ── GET /api/reports ─ List with pagination, filter, search, sort ──
router.get("/", (req, res) => {
  const {
    page = "1",
    pageSize = "10",
    q,
    status,
    sort = "updatedAt:desc",
    // per-column search params
    name: nameFilter,
    owner: ownerFilter,
    department,
    category,
    priority,
    tags,
    approvedBy,
    currency,
  } = req.query as Record<string, string>;

  let filtered: Report[] = [...reports];

  // Filter by status
  if (status && ["draft", "published", "archived"].includes(status)) {
    filtered = filtered.filter((r) => r.status === status);
  }

  // Global search by name (legacy)
  if (q) {
    const query = q.toLowerCase();
    filtered = filtered.filter((r) => r.name.toLowerCase().includes(query));
  }

  // Per-column text filters (case-insensitive contains)
  if (nameFilter) {
    const v = nameFilter.toLowerCase();
    filtered = filtered.filter((r) => r.name.toLowerCase().includes(v));
  }
  if (ownerFilter) {
    const v = ownerFilter.toLowerCase();
    filtered = filtered.filter((r) => r.owner.toLowerCase().includes(v));
  }
  if (department) {
    const v = department.toLowerCase();
    filtered = filtered.filter((r) => r.department.toLowerCase().includes(v));
  }
  if (category) {
    const v = category.toLowerCase();
    filtered = filtered.filter((r) => r.category.toLowerCase().includes(v));
  }
  if (priority) {
    filtered = filtered.filter((r) => r.priority === priority);
  }
  if (tags) {
    const v = tags.toLowerCase();
    filtered = filtered.filter((r) => r.tags.toLowerCase().includes(v));
  }
  if (approvedBy) {
    const v = approvedBy.toLowerCase();
    filtered = filtered.filter((r) => r.approvedBy.toLowerCase().includes(v));
  }
  if (currency) {
    const v = currency.toUpperCase();
    filtered = filtered.filter((r) => r.currency === v);
  }

  // Sort
  const [sortField, sortDir] = sort.split(":");
  const direction = sortDir === "asc" ? 1 : -1;
  filtered.sort((a, b) => {
    const aVal = a[sortField as keyof Report];
    const bVal = b[sortField as keyof Report];
    if (typeof aVal === "string" && typeof bVal === "string") {
      return aVal.localeCompare(bVal) * direction;
    }
    if (typeof aVal === "number" && typeof bVal === "number") {
      return (aVal - bVal) * direction;
    }
    return 0;
  });

  // Paginate
  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const size = Math.max(1, Math.min(100, parseInt(pageSize, 10) || 10));
  const totalItems = filtered.length;
  const totalPages = Math.ceil(totalItems / size);
  const start = (pageNum - 1) * size;
  const data = filtered.slice(start, start + size);

  // Set X-Total-Count header for frontend pagination
  res.set("X-Total-Count", String(totalItems));

  // Also return body with array + meta for flexibility
  res.json(data);
});

// ── GET /api/reports/:id ─ Single report ───────────────────
router.get("/:id", (req, res) => {
  const id = parseInt(req.params.id, 10);
  const report = reports.find((r) => r.id === id);
  if (!report) {
    res.status(404).json({ error: `Report with id ${id} not found` });
    return;
  }
  res.json(report);
});

// ── PUT /api/reports/:id ─ Update report ───────────────────
router.put("/:id", (req, res) => {
  const id = parseInt(req.params.id, 10);
  const index = reports.findIndex((r) => r.id === id);
  if (index === -1) {
    res.status(404).json({ error: `Report with id ${id} not found` });
    return;
  }

  const updated: Report = {
    ...reports[index],
    ...req.body,
    id, // protect id from overwrite
    updatedAt: new Date().toISOString(),
  };
  reports[index] = updated;
  res.json(updated);
});

// ── POST /api/reports ─ Create report ──────────────────────
router.post("/", (req, res) => {
  const maxId = reports.reduce((max, r) => Math.max(max, r.id), 0);
  const newReport: Report = {
    id: maxId + 1,
    name: req.body.name || "",
    owner: req.body.owner || "",
    status: req.body.status || "draft",
    amount: req.body.amount || 0,
    currency: req.body.currency || "PLN",
    department: req.body.department || "",
    category: req.body.category || "",
    priority: req.body.priority || "medium",
    tags: req.body.tags || "",
    approvedBy: req.body.approvedBy || "",
    periodFrom: req.body.periodFrom || "",
    periodTo: req.body.periodTo || "",
    updatedAt: new Date().toISOString(),
    description: req.body.description || "",
    lineItems: req.body.lineItems || [],
  };
  reports.push(newReport);
  res.status(201).json(newReport);
});

// ── DELETE /api/reports/:id ─ Delete report ────────────────
router.delete("/:id", (req, res) => {
  const id = parseInt(req.params.id, 10);
  const index = reports.findIndex((r) => r.id === id);
  if (index === -1) {
    res.status(404).json({ error: `Report with id ${id} not found` });
    return;
  }
  reports.splice(index, 1);
  res.status(204).send();
});

// ── PATCH /api/reports/bulk ─ Bulk status change / delete ──
router.patch("/bulk", (req, res) => {
  const { ids, action, status: newStatus } = req.body as {
    ids: number[];
    action: "updateStatus" | "delete";
    status?: string;
  };

  if (!ids || !Array.isArray(ids) || ids.length === 0) {
    res.status(400).json({ error: "ids array is required" });
    return;
  }

  if (action === "delete") {
    const deleted: number[] = [];
    for (const id of ids) {
      const index = reports.findIndex((r) => r.id === id);
      if (index !== -1) {
        reports.splice(index, 1);
        deleted.push(id);
      }
    }
    res.json({ deleted, count: deleted.length });
    return;
  }

  if (action === "updateStatus" && newStatus) {
    const updated: Report[] = [];
    for (const id of ids) {
      const index = reports.findIndex((r) => r.id === id);
      if (index !== -1) {
        reports[index] = {
          ...reports[index],
          status: newStatus as Report["status"],
          updatedAt: new Date().toISOString(),
        };
        updated.push(reports[index]);
      }
    }
    res.json({ updated, count: updated.length });
    return;
  }

  res.status(400).json({ error: "Invalid action. Use 'updateStatus' or 'delete'." });
});

export default router;
