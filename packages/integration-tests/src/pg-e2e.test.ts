import * as assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { pathToFileURL } from "node:url";
import { PostgreSqlContainer } from "@testcontainers/postgresql";
import { generate } from "@tsqlx/codegen";
import pg from "pg";
import ts from "typescript";

const FIXTURE_TSQ = `@driver postgres

@input
  id string

@query getRow
  SELECT v FROM e2e_t WHERE id = {id}

@output
  v number
`;

test("e2e: generated pg query runs against Postgres and returns expected rows", {
  skip: process.env.SKIP_PG_E2E === "1",
}, async () => {
  const container = await new PostgreSqlContainer("postgres:16-alpine").start();
  try {
    const pool = new pg.Pool({
      connectionString: container.getConnectionUri(),
    });
    try {
      await pool.query(`
          CREATE TABLE e2e_t (id text PRIMARY KEY, v int NOT NULL);
          INSERT INTO e2e_t (id, v) VALUES ('a', 42);
        `);

      const gen = generate(FIXTURE_TSQ, "fixture.tsq", { target: "pg" });
      assert.equal(
        gen.ok,
        true,
        gen.diagnostics.map((d) => d.message).join("; "),
      );

      const dir = mkdtempSync(join(tmpdir(), "tsqlx-e2e-"));
      const js = ts.transpileModule(gen.code, {
        compilerOptions: {
          target: ts.ScriptTarget.ES2022,
          module: ts.ModuleKind.ESNext,
          esModuleInterop: true,
          strict: true,
        },
        fileName: "fixture.tsq.ts",
      }).outputText;
      const outPath = join(dir, "fixture.tsq.js");
      writeFileSync(outPath, js, "utf-8");

      const mod = (await import(pathToFileURL(outPath).href)) as {
        getRow: (
          db: pg.Pool | pg.PoolClient,
          input: { id: string },
        ) => Promise<{ v: number }[]>;
      };

      const rows = await mod.getRow(pool, { id: "a" });
      assert.deepEqual(rows, [{ v: 42 }]);
      rmSync(dir, { recursive: true, force: true });
    } finally {
      await pool.end();
    }
  } finally {
    await container.stop();
  }
});
