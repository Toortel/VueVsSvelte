import express from "express";
import cors from "cors";
import reportsRouter from "./routes/reports.js";

const app = express();
const PORT = parseInt(process.env.PORT || "3001", 10);

// ── Middleware ──────────────────────────────────────────────
app.use(cors({ exposedHeaders: ["X-Total-Count"] }));
app.use(express.json());

// ── Routes ─────────────────────────────────────────────────
app.use("/api/reports", reportsRouter);

// ── Health check ───────────────────────────────────────────
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// ── Start ──────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`✅ Budget Reporting API running at http://localhost:${PORT}`);
  console.log(`   Reports endpoint: http://localhost:${PORT}/api/reports`);
});
