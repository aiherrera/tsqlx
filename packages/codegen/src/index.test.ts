import * as assert from "node:assert/strict";
import { test } from "node:test";
import { compile } from "@tsqlx/core";
import {
  FX_ALL_TARGETS,
  FX_INVALID,
  FX_MULTI_QUERY,
  FX_NO_PARAMS,
  FX_PEST_REPORT,
  FX_TRANSACTION,
} from "./fixtures.js";
import {
  emitFile,
  emitInputInterface,
  emitRowInterface,
  generate,
  SqlBuilder,
} from "./index.js";

test("generate: returns ok=false for invalid source with semantic errors", () => {
  const result = generate(FX_INVALID, "bad.tsq");
  assert.equal(result.ok, false);
  assert.ok(result.diagnostics.some((d) => d.severity === "error"));
  assert.ok(
    result.code.length > 0,
    "still emit codegen for structurally valid query",
  );
  assert.equal(result.functionCount, 1);
});

test("generate: returns ok=true for valid source", () => {
  const result = generate(FX_ALL_TARGETS, "find_user.tsq");
  assert.equal(result.ok, true);
  assert.ok(result.code.length > 0);
});

test("generate: functionCount matches query count", () => {
  const r1 = generate(FX_ALL_TARGETS, "f.tsq");
  assert.equal(r1.functionCount, 1);

  const r2 = generate(FX_MULTI_QUERY, "f.tsq");
  assert.equal(r2.functionCount, 2);
});

test("emitFile: banner contains filename", () => {
  const { ast } = compile(FX_ALL_TARGETS);
  const result = emitFile(ast, "find_user.tsq");
  assert.ok(result.code.includes("find_user.tsq"));
});

test("emitFile: banner suppressed when banner=false", () => {
  const { ast } = compile(FX_ALL_TARGETS);
  const result = emitFile(ast, "find_user.tsq", { banner: false });
  assert.ok(!result.code.includes("AUTO-GENERATED"));
});

test("emitFile: custom banner is used", () => {
  const { ast } = compile(FX_ALL_TARGETS);
  const result = emitFile(ast, "f.tsq", { banner: "// custom banner" });
  assert.ok(result.code.startsWith("// custom banner"));
});

test("emitFile: @driver supabase resolves to pg Pool import", () => {
  const { ast } = compile(FX_PEST_REPORT);
  const result = emitFile(ast, "pest.tsq");
  assert.equal(result.target, "pg");
  assert.ok(result.code.includes(`from "pg"`));
  assert.ok(!result.code.includes("supabase-js"));
});

test("emitFile: pg target imports Pool", () => {
  const { ast } = compile(FX_ALL_TARGETS);
  const result = emitFile(ast, "f.tsq", { target: "pg" });
  assert.ok(result.code.includes(`from "pg"`));
});

test("emitFile: raw target has no driver import", () => {
  const { ast } = compile(FX_ALL_TARGETS);
  const result = emitFile(ast, "f.tsq", { target: "raw" });
  assert.ok(!result.code.includes("import type"));
});

test("emitFile: drizzle target imports pg and drizzle hint", () => {
  const { ast } = compile(FX_ALL_TARGETS);
  const result = emitFile(ast, "f.tsq", { target: "drizzle" });
  assert.ok(result.code.includes(`from "pg"`));
  assert.ok(result.code.includes("drizzle-orm"));
});

test("emitFile: prisma target imports PrismaClient", () => {
  const { ast } = compile(FX_ALL_TARGETS);
  const result = emitFile(ast, "f.tsq", { target: "prisma" });
  assert.ok(result.code.includes("PrismaClient"));
});

test("emitInputInterface: emits correct interface name", () => {
  const iface = emitInputInterface(
    "findUser",
    [
      {
        kind: "ParamDecl",
        span: {
          start: { line: 1, col: 1, offset: 0 },
          end: { line: 1, col: 1, offset: 0 },
        },
        name: "userId",
        type: "string",
        optional: false,
        defaultValue: null,
      },
    ],
    "  ",
  );
  assert.ok(iface.includes("interface FindUserInput"));
});

test("emitInputInterface: optional param emits ?", () => {
  const iface = emitInputInterface(
    "q",
    [
      {
        kind: "ParamDecl",
        span: {
          start: { line: 1, col: 1, offset: 0 },
          end: { line: 1, col: 1, offset: 0 },
        },
        name: "limit",
        type: "number",
        optional: true,
        defaultValue: "100",
      },
    ],
    "  ",
  );
  assert.ok(iface.includes("limit?: number"));
});

test("emitInputInterface: default value appears as comment", () => {
  const iface = emitInputInterface(
    "q",
    [
      {
        kind: "ParamDecl",
        span: {
          start: { line: 1, col: 1, offset: 0 },
          end: { line: 1, col: 1, offset: 0 },
        },
        name: "limit",
        type: "number",
        optional: true,
        defaultValue: "100",
      },
    ],
    "  ",
  );
  assert.ok(iface.includes("default: 100"));
});

test("emitInputInterface: required param has no ?", () => {
  const iface = emitInputInterface(
    "q",
    [
      {
        kind: "ParamDecl",
        span: {
          start: { line: 1, col: 1, offset: 0 },
          end: { line: 1, col: 1, offset: 0 },
        },
        name: "id",
        type: "string",
        optional: false,
        defaultValue: null,
      },
    ],
    "  ",
  );
  assert.ok(iface.includes("id: string"));
  assert.ok(!iface.includes("id?: string"));
});

test("emitRowInterface: emits correct interface name", () => {
  const iface = emitRowInterface(
    "findUser",
    [
      {
        kind: "OutputColumn",
        span: {
          start: { line: 1, col: 1, offset: 0 },
          end: { line: 1, col: 1, offset: 0 },
        },
        name: "id",
        type: "string",
      },
    ],
    "  ",
  );
  assert.ok(iface.includes("interface FindUserRow"));
});

test("emitRowInterface: empty output emits unknown type alias", () => {
  const iface = emitRowInterface("q", [], "  ");
  assert.ok(iface.includes("type QRow = unknown"));
});

test("emitRowInterface: Date column emits Date type", () => {
  const iface = emitRowInterface(
    "q",
    [
      {
        kind: "OutputColumn",
        span: {
          start: { line: 1, col: 1, offset: 0 },
          end: { line: 1, col: 1, offset: 0 },
        },
        name: "createdAt",
        type: "Date",
      },
    ],
    "  ",
  );
  assert.ok(iface.includes("createdAt: Date"));
});

test("SqlBuilder: replaces slots with $N for pg target", () => {
  const { ast } = compile(FX_ALL_TARGETS);
  const query = ast.queries[0];
  const params = ast.input?.params ?? [];
  const builder = new SqlBuilder(params);
  const result = builder.build(query.body);
  assert.ok(result.sqlTemplate.includes("$1"));
  assert.ok(result.paramOrder.includes("userId"));
});

test("SqlBuilder: prisma target uses $N placeholders", () => {
  const { ast } = compile(FX_ALL_TARGETS);
  const query = ast.queries[0];
  const params = ast.input?.params ?? [];
  const builder = new SqlBuilder(params);
  const result = builder.build(query.body);
  assert.ok(result.sqlTemplate.includes("$1"));
});

test("SqlBuilder: hasConditionals=false for simple query", () => {
  const { ast } = compile(FX_ALL_TARGETS);
  const query = ast.queries[0];
  const params = ast.input?.params ?? [];
  const builder = new SqlBuilder(params);
  const result = builder.build(query.body);
  assert.equal(result.hasConditionals, false);
});

test("SqlBuilder: hasConditionals=true when [IF] present", () => {
  const { ast } = compile(FX_PEST_REPORT);
  const query = ast.queries[0];
  const params = ast.input?.params ?? [];
  const builder = new SqlBuilder(params);
  const result = builder.build(query.body);
  assert.equal(result.hasConditionals, true);
});

test("SqlBuilder: param order matches slot order in body", () => {
  const { ast } = compile(FX_ALL_TARGETS);
  const query = ast.queries[0];
  const params = ast.input?.params ?? [];
  const builder = new SqlBuilder(params);
  const result = builder.build(query.body);
  assert.equal(result.paramOrder[0], "userId");
});

test("output: exports async function with correct name", () => {
  const result = generate(FX_ALL_TARGETS, "f.tsq", { target: "pg" });
  assert.ok(result.code.includes("export async function findUser("));
});

test("output: function returns Promise<FindUserRow[]>", () => {
  const result = generate(FX_ALL_TARGETS, "f.tsq", { target: "pg" });
  assert.ok(result.code.includes("Promise<FindUserRow[]>"));
});

test("output: conditional pest report uses db.query not rpc", () => {
  const result = generate(FX_PEST_REPORT, "pest.tsq");
  assert.ok(result.code.includes("db.query"));
  assert.ok(!result.code.includes("db.rpc"));
});

test("output: pg body uses db.query", () => {
  const result = generate(FX_ALL_TARGETS, "f.tsq", { target: "pg" });
  assert.ok(result.code.includes("db.query"));
});

test("output: prisma body uses $queryRawUnsafe", () => {
  const result = generate(FX_ALL_TARGETS, "f.tsq", { target: "prisma" });
  assert.ok(result.code.includes("$queryRawUnsafe"));
});

test("output: no-params query omits input interface", () => {
  const result = generate(FX_NO_PARAMS, "species.tsq", { target: "pg" });
  assert.ok(!result.code.includes("interface GetAllSpeciesInput"));
});

test("output: multi-query file emits two functions", () => {
  const result = generate(FX_MULTI_QUERY, "multi.tsq", { target: "pg" });
  assert.ok(result.code.includes("export async function getUsers("));
  assert.ok(result.code.includes("export async function getAdmins("));
});

test("output: transaction queries are emitted as top-level functions", () => {
  const result = generate(FX_TRANSACTION, "tx.tsq", { target: "pg" });
  assert.ok(result.code.includes("export async function debitAccount("));
  assert.ok(result.code.includes("export async function logTransaction("));
});

test("output: exportSqlStrings emits SQL constant", () => {
  const result = generate(FX_ALL_TARGETS, "f.tsq", {
    target: "pg",
    exportSqlStrings: true,
  });
  assert.ok(result.code.includes("_SQL = `"));
});

test("output: target prisma explicit", () => {
  const r2 = generate(FX_ALL_TARGETS, "f.tsq", { target: "prisma" });
  assert.equal(r2.target, "prisma");
});

test("output: conditional append does not duplicate placeholder suffix", () => {
  const result = generate(FX_PEST_REPORT, "pest.tsq", { target: "pg" });
  assert.ok(result.code.includes("_sql +="));
  assert.ok(!result.code.match(/_params\.length\}`;$/m));
});
