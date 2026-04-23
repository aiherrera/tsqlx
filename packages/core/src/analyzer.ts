import type {
  QueryBlock,
  Span,
  SqlBodyNode,
  TransactionBlock,
  TsqFile,
} from "./ast.js";

// ─── Diagnostic types ─────────────────────────────────────────────────────────

export type DiagnosticSeverity = "error" | "warning" | "info";

export interface Diagnostic {
  severity: DiagnosticSeverity;
  message: string;
  span: Span;
  code: string; // e.g. "A001"
}

// ─── Analyzer ─────────────────────────────────────────────────────────────────

export class Analyzer {
  private diagnostics: Diagnostic[] = [];

  analyze(file: TsqFile): Diagnostic[] {
    this.diagnostics = [];

    this.checkDriverPresent(file);
    this.checkInputPresent(file);
    this.checkQueriesPresent(file);
    this.checkDuplicateQueryNames(file);

    for (const q of file.queries) {
      this.analyzeQuery(q, file);
    }

    for (const tx of file.transactions) {
      this.analyzeTransaction(tx, file);
    }

    return this.diagnostics;
  }

  // ── file-level checks ────────────────────────────────────────────────────

  private checkDriverPresent(file: TsqFile): void {
    if (!file.driver) {
      this.warn(
        "No @driver directive found. Compiler will use default driver.",
        file.span,
        "A001",
      );
    }
  }

  private checkInputPresent(file: TsqFile): void {
    if (!file.input && file.queries.length > 0) {
      // Only an info: queries may legitimately have no params
      this.info(
        "No @input block declared. All queries will take no parameters.",
        file.span,
        "A002",
      );
    }
  }

  private checkQueriesPresent(file: TsqFile): void {
    if (file.queries.length === 0 && file.transactions.length === 0) {
      this.warn(
        "File has no @query or @transaction blocks.",
        file.span,
        "A003",
      );
    }
  }

  private checkDuplicateQueryNames(file: TsqFile): void {
    const seen = new Map<string, Span>();
    const allQueries = [
      ...file.queries,
      ...file.transactions.flatMap((tx) => tx.queries),
    ];
    for (const q of allQueries) {
      const prev = seen.get(q.name);
      if (prev) {
        this.error(
          `Duplicate query name '${q.name}'. Each query must have a unique name.`,
          q.span,
          "A004",
        );
      } else {
        seen.set(q.name, q.span);
      }
    }
  }

  // ── query-level checks ────────────────────────────────────────────────────

  private analyzeQuery(q: QueryBlock, file: TsqFile): void {
    const declaredParams = new Set<string>(
      file.input?.params.map((p) => p.name) ?? [],
    );
    const optionalParams = new Set<string>(
      file.input?.params.filter((p) => p.optional).map((p) => p.name) ?? [],
    );

    this.checkSlotsInBody(q.body, declaredParams, q);
    this.checkIfConditionsOptional(q.body, optionalParams, q);
    this.checkOutputNotEmpty(q);
    this.checkOutputColumnNames(q);
    this.checkQueryBodyNotEmpty(q);
  }

  private analyzeTransaction(tx: TransactionBlock, file: TsqFile): void {
    for (const q of tx.queries) {
      this.analyzeQuery(q, file);
    }
  }

  // ── A010: every {slot} must be declared in @input ────────────────────────

  private checkSlotsInBody(
    body: SqlBodyNode[],
    declared: Set<string>,
    q: QueryBlock,
  ): void {
    for (const node of body) {
      if (node.kind === "SlotExpr") {
        if (!declared.has(node.name)) {
          this.error(
            `Slot '{${node.name}}' used in query '${q.name}' is not declared in @input.`,
            node.span,
            "A010",
          );
        }
      } else if (node.kind === "IfBlock") {
        this.checkSlotsInBody(node.body, declared, q);
      }
    }
  }

  // ── A011: [IF param] must reference an optional (?) param ────────────────

  private checkIfConditionsOptional(
    body: SqlBodyNode[],
    optional: Set<string>,
    q: QueryBlock,
  ): void {
    for (const node of body) {
      if (node.kind === "IfBlock") {
        if (!optional.has(node.param)) {
          this.error(
            `[IF ${node.param}] in query '${q.name}': '${node.param}' must be declared as optional (with ?) in @input.`,
            node.span,
            "A011",
          );
        }
        this.checkIfConditionsOptional(node.body, optional, q);
      }
    }
  }

  // ── A012: @output block should not be empty ───────────────────────────────

  private checkOutputNotEmpty(q: QueryBlock): void {
    if (q.output.length === 0) {
      this.warn(
        `Query '${q.name}' has no @output block. Return type will be 'unknown[]'.`,
        q.span,
        "A012",
      );
    }
  }

  // ── A013: output column names must be valid camelCase identifiers ─────────

  private checkOutputColumnNames(q: QueryBlock): void {
    for (const col of q.output) {
      if (!/^[a-z][a-zA-Z0-9_]*$/.test(col.name)) {
        this.warn(
          `Output column '${col.name}' in query '${q.name}' should be camelCase.`,
          col.span,
          "A013",
        );
      }
    }
  }

  // ── A014: query body must not be empty ────────────────────────────────────

  private checkQueryBodyNotEmpty(q: QueryBlock): void {
    const hasContent = q.body.some(
      (n) => n.kind !== "SqlText" || n.value.trim() !== "",
    );
    if (!hasContent) {
      this.error(`Query '${q.name}' has an empty SQL body.`, q.span, "A014");
    }
  }

  // ── helpers ───────────────────────────────────────────────────────────────

  private error(message: string, span: Span, code: string): void {
    this.diagnostics.push({ severity: "error", message, span, code });
  }

  private warn(message: string, span: Span, code: string): void {
    this.diagnostics.push({ severity: "warning", message, span, code });
  }

  private info(message: string, span: Span, code: string): void {
    this.diagnostics.push({ severity: "info", message, span, code });
  }
}

// ─── Convenience ─────────────────────────────────────────────────────────────

export function hasErrors(diagnostics: Diagnostic[]): boolean {
  return diagnostics.some((d) => d.severity === "error");
}
