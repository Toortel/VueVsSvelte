import type { Report, LineItem } from "../types/report.js";

// ── Helpers ────────────────────────────────────────────────
const statuses = ["draft", "published", "archived"] as const;
const priorities = ["low", "medium", "high", "critical"] as const;
const currencies = ["USD", "EUR", "PLN", "GBP", "CHF"];
const departments = [
  "Finance", "Marketing", "Engineering", "HR", "Operations",
  "Sales", "Legal", "R&D", "Support", "Executive",
];
const categories = [
  "Operating", "Capital", "Travel", "Payroll", "Marketing",
  "Infrastructure", "Training", "Consulting", "Licensing", "Miscellaneous",
];
const tagPool = [
  "Q1", "Q2", "Q3", "Q4", "review", "urgent", "approved",
  "pending", "recurring", "one-time", "external", "internal",
  "audit", "compliance", "forecast",
];
const approvers = [
  "Michael Torres", "Sarah Kim", "James O'Brien", "Priya Sharma",
  "Lukas Weber", "", "", "",   // some reports have no approver
];
const owners = [
  "Alice Johnson",
  "Bob Smith",
  "Carlos Rivera",
  "Diana Kowalski",
  "Ethan Müller",
  "Fatima Nowak",
  "George Tanaka",
  "Hanna Berg",
  "Ivan Petrov",
  "Julia Chen",
];
const adjectives = [
  "Annual", "Quarterly", "Monthly", "Regional", "Departmental",
  "Corporate", "Strategic", "Operational", "Projected", "Final",
];
const nouns = [
  "Budget Overview", "Expense Report", "Revenue Summary", "Cost Analysis",
  "Financial Review", "Spending Forecast", "Allocation Plan",
  "Investment Report", "Savings Tracker", "Audit Summary",
];

function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randAmount(): number {
  return Math.round((Math.random() * 500000 + 1000) * 100) / 100;
}

function isoDate(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function randomDateRange(): { periodFrom: string; periodTo: string } {
  const year = pick([2024, 2025]);
  const startMonth = randInt(1, 10);
  const endMonth = Math.min(startMonth + randInt(1, 3), 12);
  return {
    periodFrom: isoDate(year, startMonth, 1),
    periodTo: isoDate(year, endMonth, 28),
  };
}

function randomUpdatedAt(): string {
  const base = new Date("2025-01-01T00:00:00Z");
  base.setDate(base.getDate() + randInt(0, 400));
  base.setHours(randInt(6, 20), randInt(0, 59), randInt(0, 59));
  return base.toISOString();
}

const lineItemDescriptions = [
  "Software License", "Cloud Hosting", "Consulting Hours", "Hardware Purchase",
  "Travel Expenses", "Training Course", "Office Supplies", "Marketing Campaign",
  "Contractor Payment", "Maintenance Fee", "Insurance Premium", "Utilities",
];

function generateLineItems(): LineItem[] {
  const count = randInt(1, 5);
  const items: LineItem[] = [];
  for (let i = 1; i <= count; i++) {
    const quantity = randInt(1, 20);
    const unitPrice = Math.round((Math.random() * 5000 + 50) * 100) / 100;
    items.push({
      id: i,
      description: pick(lineItemDescriptions),
      quantity,
      unitPrice,
      total: Math.round(quantity * unitPrice * 100) / 100,
    });
  }
  return items;
}

// ── Generate 50 reports ────────────────────────────────────
function generateReports(count: number): Report[] {
  const reports: Report[] = [];
  for (let i = 1; i <= count; i++) {
    const { periodFrom, periodTo } = randomDateRange();
    // pick 1-3 random tags
    const numTags = randInt(1, 3);
    const shuffled = [...tagPool].sort(() => Math.random() - 0.5);
    const tags = shuffled.slice(0, numTags).join(",");

    reports.push({
      id: i,
      name: `${pick(adjectives)} ${pick(nouns)} #${i}`,
      owner: pick(owners),
      status: pick(statuses),
      amount: randAmount(),
      currency: pick(currencies),
      department: pick(departments),
      category: pick(categories),
      priority: pick(priorities),
      tags,
      approvedBy: pick(approvers),
      periodFrom,
      periodTo,
      updatedAt: randomUpdatedAt(),
      description: `Auto-generated report #${i}. Covers the period from ${periodFrom} to ${periodTo}.`,
      lineItems: generateLineItems(),
    });
  }
  return reports;
}

export const reports: Report[] = generateReports(50);
