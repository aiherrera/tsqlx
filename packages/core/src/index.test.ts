import * as assert from "node:assert/strict";
import { test } from "node:test";
import {
  FIXTURE_FULL,
  FIXTURE_IF_ON_REQUIRED,
  FIXTURE_MINIMAL,
  FIXTURE_NO_DRIVER,
  FIXTURE_TRANSACTION,
  FIXTURE_UNDECLARED_SLOT,
  FIXTURE_WITH_COMMENT,
} from "./fixtures.js";
import {
  Lexer,
  compile,
  findParamForSlotName,
  findSlotAtOffset,
  hasErrors,
  offsetInSpan,
} from "./index.js";

// ── Lexer ─────────────────────────────────────────────────────────────────────

test("lexer: tokenizes @driver directive", () => {
  const { tokens } = new Lexer("@driver postgres").tokenize();
  assert.equal(tokens[0].kind, "AT_DRIVER");
  assert.equal(tokens[1].kind, "IDENT");
  assert.equal(tokens[1].value, "postgres");
});

test("lexer: tokenizes {slot}", () => {
  const { tokens } = new Lexer("WHERE id = {userId}").tokenize();
  const slot = tokens.find((t) => t.kind === "SLOT");
  assert.ok(slot);
  assert.equal(slot!.value, "userId");
});

test("lexer: tokenizes [IF param] and [/IF]", () => {
  const { tokens } = new Lexer("[IF speciesId] AND x = 1 [/IF]").tokenize();
  assert.equal(tokens[0].kind, "IF_OPEN");
  assert.equal(tokens[0].value, "speciesId");
  const close = tokens.find((t) => t.kind === "IF_CLOSE");
  assert.ok(close);
});

test("lexer: strips line comments", () => {
  const { tokens } = new Lexer(
    "-- this is a comment\n@driver postgres",
  ).tokenize();
  assert.equal(tokens[0].kind, "NEWLINE");
  assert.equal(tokens[1].kind, "AT_DRIVER");
});

test("lexer: optional marker ?", () => {
  const { tokens } = new Lexer("speciesId? string").tokenize();
  assert.ok(tokens.some((t) => t.kind === "QUESTION"));
});

test("lexer: unknown directive yields L001 diagnostic and continues tokenization", () => {
  const { tokens, diagnostics } = new Lexer(
    "@unknown foo\n@driver postgres",
  ).tokenize();
  const d = diagnostics.find((x) => x.code === "L001");
  assert.ok(d, "L001 for unknown @");
  assert.match(d!.message, /Unknown directive/);
  const atDriver = tokens.find((t) => t.kind === "AT_DRIVER");
  assert.ok(atDriver, "second line still tokenized");
});

// ── Parser ────────────────────────────────────────────────────────────────────

test("parser: parses minimal fixture", () => {
  const { ast } = compile(FIXTURE_MINIMAL);
  assert.equal(ast.kind, "TsqFile");
  assert.equal(ast.driver?.driver, "postgres");
  assert.equal(ast.queries.length, 1);
  assert.equal(ast.queries[0].name, "getUser");
});

test("parser: parses @input params", () => {
  const { ast } = compile(FIXTURE_MINIMAL);
  const params = ast.input?.params ?? [];
  assert.equal(params.length, 1);
  assert.equal(params[0].name, "userId");
  assert.equal(params[0].type, "string");
  assert.equal(params[0].optional, false);
});

test("parser: parses optional param with default", () => {
  const { ast } = compile(FIXTURE_FULL);
  const params = ast.input?.params ?? [];
  const limit = params.find((p) => p.name === "limit");
  assert.ok(limit);
  assert.equal(limit!.optional, true);
  assert.equal(limit!.defaultValue, "100");
});

test("parser: parses @output columns", () => {
  const { ast } = compile(FIXTURE_MINIMAL);
  const output = ast.queries[0].output;
  assert.equal(output.length, 2);
  assert.equal(output[0].name, "id");
  assert.equal(output[0].type, "string");
});

test("parser: parses [IF] block inside query body", () => {
  const { ast } = compile(FIXTURE_FULL);
  const q = ast.queries[0];
  const ifBlock = q.body.find((n) => n.kind === "IfBlock");
  assert.ok(ifBlock);
  if (ifBlock?.kind === "IfBlock") {
    assert.equal(ifBlock.param, "speciesId");
  }
});

test("parser: parses multiple queries in one file", () => {
  const { ast } = compile(FIXTURE_FULL);
  assert.equal(ast.queries.length, 2);
  assert.equal(ast.queries[0].name, "getPestReport");
  assert.equal(ast.queries[1].name, "getRecentSightings");
});

test("parser: parses @transaction block", () => {
  const { ast } = compile(FIXTURE_TRANSACTION);
  assert.equal(ast.transactions.length, 1);
  assert.equal(ast.transactions[0].queries.length, 2);
  assert.equal(ast.transactions[0].queries[0].name, "debitAccount");
});

test("parser: parses @version", () => {
  const { ast } = compile(FIXTURE_FULL);
  assert.equal(ast.version?.version, 1);
});

test("parser: parses @table", () => {
  const { ast } = compile(FIXTURE_FULL);
  assert.equal(ast.table?.table, "pest_sightings");
});

test("parser: handles comments between params", () => {
  const { ast } = compile(FIXTURE_WITH_COMMENT);
  assert.equal(ast.driver?.driver, "postgres");
  assert.equal(ast.input?.params.length, 1);
});

test("parser: slot expressions have correct names", () => {
  const { ast } = compile(FIXTURE_FULL);
  const q = ast.queries[0];
  const slots = q.body
    .filter((n) => n.kind === "SlotExpr")
    .map((n) => (n as { kind: "SlotExpr"; name: string }).name);
  assert.ok(slots.includes("companyId"));
  assert.ok(slots.includes("from"));
  assert.ok(slots.includes("to"));
  assert.ok(slots.includes("limit"));
});

// ── Analyzer ──────────────────────────────────────────────────────────────────

test("analyzer: full fixture produces no errors", () => {
  const { diagnostics } = compile(FIXTURE_FULL);
  const errors = diagnostics.filter((d) => d.severity === "error");
  assert.equal(errors.length, 0);
});

test("analyzer: undeclared slot produces A010 error", () => {
  const { diagnostics } = compile(FIXTURE_UNDECLARED_SLOT);
  const err = diagnostics.find((d) => d.code === "A010");
  assert.ok(err, "Expected A010 diagnostic");
  assert.match(err!.message, /undeclaredParam/);
});

test("analyzer: [IF] on required param produces A011 error", () => {
  const { diagnostics } = compile(FIXTURE_IF_ON_REQUIRED);
  const err = diagnostics.find((d) => d.code === "A011");
  assert.ok(err, "Expected A011 diagnostic");
  assert.match(err!.message, /userId/);
});

test("analyzer: missing @driver produces A001 warning", () => {
  const { diagnostics } = compile(FIXTURE_NO_DRIVER);
  const warn = diagnostics.find((d) => d.code === "A001");
  assert.ok(warn);
  assert.equal(warn!.severity, "warning");
});

test("analyzer: hasErrors returns false for clean file", () => {
  const { diagnostics } = compile(FIXTURE_FULL);
  assert.equal(hasErrors(diagnostics), false);
});

test("analyzer: hasErrors returns true when errors exist", () => {
  const { diagnostics } = compile(FIXTURE_UNDECLARED_SLOT);
  assert.equal(hasErrors(diagnostics), true);
});

test("analyzer: duplicate query names produce A004 error", () => {
  const src = `
@driver postgres
@input
  id string
@query getUser
  SELECT id FROM users WHERE id = {id}
@output
  id string
@query getUser
  SELECT id FROM users WHERE id = {id}
@output
  id string
`;
  const { diagnostics } = compile(src);
  const err = diagnostics.find((d) => d.code === "A004");
  assert.ok(err);
});

// ── Span positions ────────────────────────────────────────────────────────────

test("positions: query name span has correct line", () => {
  const { ast } = compile(FIXTURE_MINIMAL);
  const q = ast.queries[0];
  assert.ok(q.span.start.line > 1, "Query should not start on line 1");
});

test("positions: slot span points to correct offset", () => {
  const src =
    "@driver postgres\n@input\n  id string\n@query q\n  SELECT {id}\n@output\n  id string\n";
  const { ast } = compile(src);
  const slot = ast.queries[0].body.find((n) => n.kind === "SlotExpr");
  assert.ok(slot);
  assert.ok(slot!.span.start.offset > 0);
});

// ── compile: syntactic errors as diagnostics (no throw) ─────────────────────

test("compile: lex error on unknown @ yields L001; following directives still parse", () => {
  const { ast, diagnostics, ok } = compile(
    "@unknown foo\n@driver postgres\n@input\n  x string",
  );
  assert.equal(ok, false);
  assert.equal(
    diagnostics.some((d) => d.code === "L001" && d.severity === "error"),
    true,
  );
  assert.equal(ast.driver?.driver, "postgres");
  assert.equal(ast.input?.params.length, 1);
  assert.equal(ast.input?.params[0].name, "x");
});

test("compile: invalid driver yields P002 and fallback driver for analysis", () => {
  const { ok, diagnostics, ast } = compile(
    "@driver not_a_driver_ever\n@input\n  id string\n@query q\n  SELECT 1\n@output\n  n number",
  );
  assert.equal(ok, false);
  const d = diagnostics.find((x) => x.code === "P002");
  assert.ok(d, "expected P002 for bad driver name");
  assert.equal(d!.severity, "error");
  assert.equal(ast.driver?.driver, "postgres");
  assert.equal(ast.queries.length, 1);
});

test("compile: first query broken, second query still gets analyzer diagnostics", () => {
  // First @query has no name (immediately @query again) — parse error, then recovery.
  const src = `
@driver postgres
@input
  id string
@query
@query good
  SELECT {missingSlot}
@output
  x string
`;
  const { diagnostics } = compile(src);
  const a010 = diagnostics.find((d) => d.code === "A010");
  assert.ok(
    a010,
    "analyzer should see second query and report undeclared slot",
  );
  assert.match(a010!.message, /missingSlot/);
  assert.equal(
    diagnostics.some((d) => d.code === "P001"),
    true,
  );
});

test("offset: findSlotAtOffset and findParamForSlotName", () => {
  const src =
    "@driver postgres\n@input\n  x string\n@query q\n  SELECT {x}\n@output\n  x string\n";
  const { ast } = compile(src);
  const slot = ast.queries[0].body.find((n) => n.kind === "SlotExpr");
  assert.ok(slot);
  const mid = slot!.span.start.offset + 1;
  assert.equal(findSlotAtOffset(ast, mid)?.name, "x");
  const p = findParamForSlotName(ast, "x");
  assert.ok(p);
  assert.equal(p!.type, "string");
});

test("offset: offsetInSpan", () => {
  const src = "hi";
  const span = {
    start: { line: 1, col: 1, offset: 0 },
    end: { line: 1, col: 3, offset: 2 },
  };
  assert.equal(offsetInSpan(0, span), true);
  assert.equal(offsetInSpan(1, span), true);
  assert.equal(offsetInSpan(2, span), false);
});
