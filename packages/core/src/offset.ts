import type {
  ParamDecl,
  Position,
  SlotExpr,
  Span,
  SqlBodyNode,
  TsqFile,
} from "./ast.js";

// ─── Empty file (when lex/parse fail) ─────────────────────────────────────────

const ZERO: Position = { line: 1, col: 1, offset: 0 };

/** Build a 1-column span for a single lexer position (diagnostics / LSP). */
export function positionToErrorSpan(p: Position): Span {
  return {
    start: p,
    end: { line: p.line, col: p.col + 1, offset: p.offset + 1 },
  };
}

/** Minimal valid `TsqFile` used when lex/parse do not complete. */
export function emptyTsqFile(): TsqFile {
  return {
    kind: "TsqFile",
    span: { start: { ...ZERO }, end: { ...ZERO } },
    driver: null,
    table: null,
    version: null,
    input: null,
    queries: [],
    transactions: [],
  };
}

// ─── Span / offset helpers ───────────────────────────────────────────────────

/** True if `offset` falls inside [span.start, span.end) in byte offsets. */
export function offsetInSpan(offset: number, span: Span): boolean {
  return offset >= span.start.offset && offset < span.end.offset;
}

function findSlotInBody(body: SqlBodyNode[], offset: number): SlotExpr | null {
  for (const n of body) {
    if (n.kind === "SlotExpr" && offsetInSpan(offset, n.span)) return n;
    if (n.kind === "IfBlock") {
      const found = findSlotInBody(n.body, offset);
      if (found) return found;
    }
  }
  return null;
}

/**
 * If `offset` is inside a `{slot}` interpolation, return that `SlotExpr`.
 * Used for hovers in LSP/Monaco.
 */
export function findSlotAtOffset(
  file: TsqFile,
  offset: number,
): SlotExpr | null {
  for (const q of file.queries) {
    const s = findSlotInBody(q.body, offset);
    if (s) return s;
  }
  for (const tx of file.transactions) {
    for (const q of tx.queries) {
      const s = findSlotInBody(q.body, offset);
      if (s) return s;
    }
  }
  return null;
}

/**
 * Find `@input` declaration for a slot name, if any.
 */
export function findParamForSlotName(
  file: TsqFile,
  name: string,
): ParamDecl | null {
  const params = file.input?.params ?? [];
  const p = params.find((x) => x.name === name);
  return p ?? null;
}

/**
 * Human-readable one-line for hover: `` `id`: `string` `` or with optional/default.
 */
export function formatParamDeclMarkdown(p: ParamDecl): string {
  const opt = p.optional ? "optional" : "required";
  const def = p.defaultValue !== null ? `, default \`${p.defaultValue}\`` : "";
  return `\`${p.name}\`: \`${p.type}\` (${opt}${def})`;
}
