import "dotenv/config";
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import type { Context } from "hono";
import pg from "pg";
import { getPestReport } from "../queries/report.tsq.js";

const { Pool } = pg;

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("Missing DATABASE_URL (see apps/demo/.env.example)");
  process.exit(1);
}

const pool = new Pool({ connectionString: databaseUrl });
const app = new Hono();

app.get("/health", (c: Context) => c.json({ ok: true }));

app.get("/report", async (c: Context) => {
  const companyId = c.req.query("companyId") ?? "acme";
  const speciesId = c.req.query("speciesId") ?? undefined;
  const fromRaw = c.req.query("from") ?? "2026-01-01T00:00:00Z";
  const toRaw = c.req.query("to") ?? "2026-12-31T23:59:59Z";

  const rows = await getPestReport(pool, {
    companyId,
    speciesId,
    from: new Date(fromRaw),
    to: new Date(toRaw),
  });

  return c.json({ companyId, rows });
});

const port = Number(process.env.PORT) || 3000;
console.log(`demo listening on http://127.0.0.1:${port}`);
serve({ fetch: app.fetch, port });
