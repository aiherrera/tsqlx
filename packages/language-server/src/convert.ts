import type { Diagnostic, Span } from "@tsqlx/core";
import {
  DiagnosticSeverity,
  type Diagnostic as LsDiagnostic,
  type Range as LsRange,
} from "vscode-languageserver";

/**
 * 1-based line / column in {@link Span} (TSQL-X) to LSP 0-based {@link LsRange}.
 */
export function spanToRange(s: Span): LsRange {
  return {
    start: { line: s.start.line - 1, character: s.start.col - 1 },
    end: { line: s.end.line - 1, character: s.end.col - 1 },
  };
}

function severity(s: string): LsDiagnostic["severity"] {
  switch (s) {
    case "error":
      return DiagnosticSeverity.Error;
    case "warning":
      return DiagnosticSeverity.Warning;
    default:
      return DiagnosticSeverity.Information;
  }
}

export function toLsDiagnostic(d: Diagnostic): LsDiagnostic {
  return {
    range: spanToRange(d.span),
    message: d.message,
    source: "tsqlx",
    code: d.code,
    severity: severity(d.severity),
  };
}
