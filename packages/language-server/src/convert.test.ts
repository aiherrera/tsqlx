import * as assert from "node:assert/strict";
import { test } from "node:test";
import type { Diagnostic } from "@tsqlx/core";
import { DiagnosticSeverity } from "vscode-languageserver";
import { spanToRange, toLsDiagnostic } from "./convert.js";

test("spanToRange: 1-based span to 0-based LSP range", () => {
  const r = spanToRange({
    start: { line: 2, col: 3, offset: 10 },
    end: { line: 2, col: 5, offset: 12 },
  });
  assert.equal(r.start.line, 1);
  assert.equal(r.start.character, 2);
  assert.equal(r.end.line, 1);
  assert.equal(r.end.character, 4);
});

test("toLsDiagnostic: maps severities and code", () => {
  const d: Diagnostic = {
    severity: "error",
    message: "x",
    span: {
      start: { line: 1, col: 1, offset: 0 },
      end: { line: 1, col: 2, offset: 1 },
    },
    code: "A010",
  };
  const ls = toLsDiagnostic(d);
  assert.equal(ls.severity, DiagnosticSeverity.Error);
  assert.equal(ls.code, "A010");
  assert.equal(ls.source, "tsqlx");
  assert.equal(ls.message, "x");
});

test("toLsDiagnostic: warning", () => {
  const d: Diagnostic = {
    severity: "warning",
    message: "w",
    span: {
      start: { line: 1, col: 1, offset: 0 },
      end: { line: 1, col: 1, offset: 0 },
    },
    code: "A001",
  };
  const ls = toLsDiagnostic(d);
  assert.equal(ls.severity, DiagnosticSeverity.Warning);
});
