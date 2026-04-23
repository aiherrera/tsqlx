export type { Diagnostic, DiagnosticSeverity } from "./analyzer.js";
export { Analyzer, hasErrors } from "./analyzer.js";
export type {
  Driver,
  DriverDirective,
  IfBlock,
  InputBlock,
  OutputColumn,
  ParamDecl,
  Position,
  QueryBlock,
  SlotExpr,
  Span,
  SqlBodyNode,
  SqlText,
  TableDirective,
  TransactionBlock,
  // AST nodes
  TsqFile,
  TsqNode,
  TsqPrimitive,
  VersionDirective,
} from "./ast.js";
export type { Token, TokenizeResult, TokenKind } from "./lexer.js";
export { LexError, Lexer } from "./lexer.js";
export {
  emptyTsqFile,
  findParamForSlotName,
  findSlotAtOffset,
  formatParamDeclMarkdown,
  offsetInSpan,
  positionToErrorSpan,
} from "./offset.js";
export type { ParseResult } from "./parser.js";
export { ParseError, Parser } from "./parser.js";
export type { Visitor } from "./walker.js";
export { collectSlots, renderSqlBody, walk } from "./walker.js";

// ─── High-level compile() ─────────────────────────────────────────────────────

import type { Diagnostic } from "./analyzer.js";
import { Analyzer } from "./analyzer.js";
import type { TsqFile } from "./ast.js";
import { LexError, Lexer } from "./lexer.js";
import { emptyTsqFile, positionToErrorSpan } from "./offset.js";
import { ParseError, Parser } from "./parser.js";

export interface CompileResult {
  ast: TsqFile;
  diagnostics: Diagnostic[];
  /** true if any diagnostic has severity === "error" */
  ok: boolean;
}

function lexErrorToDiagnostic(e: LexError): Diagnostic {
  const span = positionToErrorSpan(e.position);
  return {
    severity: "error",
    message: stripErrorPrefix(e.message, "LexError"),
    span,
    code: "L001",
  };
}

function parseErrorToDiagnostic(e: ParseError): Diagnostic {
  return {
    severity: "error",
    message: stripErrorPrefix(e.message, "ParseError"),
    span: e.span,
    code: "P001",
  };
}

function stripErrorPrefix(
  msg: string,
  name: "LexError" | "ParseError",
): string {
  const re = new RegExp(`^\\[${name}\\]\\s*`);
  return msg.replace(re, "").replace(/\s*at line \d+:\d+\s*$/, "");
}

/**
 * Lex → parse → analyze a .tsq source string.
 * Lexer and parser use error recovery: multiple diagnostics (L001–L003, P001–P005, …) and a
 * best-effort partial `TsqFile` so the analyzer can still run on valid regions. Never throws
 * for recoverable user errors.
 */
export function compile(source: string): CompileResult {
  try {
    const { tokens, diagnostics: lexDiagnostics } = new Lexer(
      source,
    ).tokenize();
    const { ast, diagnostics: parseDiagnostics } = new Parser(tokens).parse();
    const semanticDiagnostics = new Analyzer().analyze(ast);
    const diagnostics = [
      ...lexDiagnostics,
      ...parseDiagnostics,
      ...semanticDiagnostics,
    ];
    const ok = diagnostics.every((d) => d.severity !== "error");
    return { ast, diagnostics, ok };
  } catch (e) {
    if (e instanceof LexError) {
      return {
        ast: emptyTsqFile(),
        diagnostics: [lexErrorToDiagnostic(e)],
        ok: false,
      };
    }
    if (e instanceof ParseError) {
      return {
        ast: emptyTsqFile(),
        diagnostics: [parseErrorToDiagnostic(e)],
        ok: false,
      };
    }
    throw e;
  }
}
