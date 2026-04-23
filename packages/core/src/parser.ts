import type { Diagnostic } from "./analyzer.js";
import type {
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
  TableDirective,
  TransactionBlock,
  TsqFile,
  TsqPrimitive,
  VersionDirective,
} from "./ast.js";
import type { Token, TokenKind } from "./lexer.js";

// ─── Parse error ─────────────────────────────────────────────────────────────

export class ParseError extends Error {
  constructor(
    message: string,
    public readonly span: Span,
  ) {
    super(
      `[ParseError] ${message} at line ${span.start.line}:${span.start.col}`,
    );
    this.name = "ParseError";
  }
}

// ─── Type helpers (parser resolves types with diagnostics, no top-level throw) ─

const PRIMITIVES = new Set<string>([
  "string",
  "number",
  "boolean",
  "Date",
  "unknown",
]);
const DRIVERS = new Set<string>(["postgres", "mysql", "sqlite", "supabase"]);

function stripParseErrorMessage(msg: string): string {
  return msg
    .replace(/^\[ParseError\]\s*/i, "")
    .replace(/\s*at line \d+:\d+\s*$/i, "");
}

export interface ParseResult {
  ast: TsqFile;
  /** Recoverable / structural parse issues (e.g. P001–P005) */
  diagnostics: Diagnostic[];
}

// ─── Parser ───────────────────────────────────────────────────────────────────

export class Parser {
  private pos = 0;
  private readonly diagnostics: Diagnostic[] = [];

  constructor(private readonly tokens: Token[]) {}

  // ── public entry point ────────────────────────────────────────────────────

  parse(): ParseResult {
    this.diagnostics.length = 0;
    const start = this.curSpan().start;

    let driver: DriverDirective | null = null;
    let table: TableDirective | null = null;
    let version: VersionDirective | null = null;
    let input: InputBlock | null = null;
    const queries: QueryBlock[] = [];
    const transactions: TransactionBlock[] = [];

    while (!this.isEOF()) {
      this.skipNewlines();
      if (this.isEOF()) break;

      const tok = this.cur();

      switch (tok.kind) {
        case "AT_DRIVER": {
          if (driver) {
            this.report("Duplicate @driver directive", tok.span, "P003");
            this.recoverSkipDuplicateAtDirective();
            break;
          }
          try {
            driver = this.parseDriver();
          } catch (e) {
            this.handleParseFailure(e, tok);
          }
          break;
        }

        case "AT_TABLE": {
          if (table) {
            this.report("Duplicate @table directive", tok.span, "P003");
            this.recoverSkipDuplicateAtDirective();
            break;
          }
          try {
            table = this.parseTable();
          } catch (e) {
            this.handleParseFailure(e, tok);
          }
          break;
        }

        case "AT_VERSION": {
          if (version) {
            this.report("Duplicate @version directive", tok.span, "P003");
            this.recoverSkipDuplicateAtDirective();
            break;
          }
          try {
            version = this.parseVersion();
          } catch (e) {
            this.handleParseFailure(e, tok);
          }
          break;
        }

        case "AT_INPUT": {
          if (input) {
            this.report("Duplicate @input block", tok.span, "P003");
            this.recoverSkipDuplicateAtDirective();
            break;
          }
          try {
            input = this.parseInput();
          } catch (e) {
            this.handleParseFailure(e, tok);
          }
          break;
        }

        case "AT_QUERY":
          try {
            queries.push(this.parseQuery());
          } catch (e) {
            this.handleParseFailure(e, tok);
          }
          break;

        case "AT_TRANSACTION":
          try {
            transactions.push(this.parseTransaction());
          } catch (e) {
            this.handleParseFailure(e, tok);
          }
          break;

        default:
          this.advance();
      }
    }

    const end = this.curSpan().end;
    const ast: TsqFile = {
      kind: "TsqFile",
      span: { start, end },
      driver,
      table,
      version,
      input,
      queries,
      transactions,
    };
    return { ast, diagnostics: [...this.diagnostics] };
  }

  // ── recovery + diagnostics ───────────────────────────────────────────────

  private report(msg: string, span: Span, code = "P001"): void {
    this.diagnostics.push({ severity: "error", message: msg, span, code });
  }

  private handleParseFailure(e: unknown, _atTok: Token): void {
    if (e instanceof ParseError) {
      this.diagnostics.push({
        severity: "error",
        message: stripParseErrorMessage(e.message),
        span: e.span,
        code: "P001",
      });
      this.recoverFromError();
    } else {
      throw e;
    }
  }

  /**
   * After a `ParseError`, move `pos` to a safe resync point. If the stream is
   * already on a file-level directive (e.g. `consume` failed because the next
   * line is `@query` while the previous `@query` had no name), do **not** advance —
   * the main `while` loop will re-dispatch on that same token. Otherwise, skip
   * forward to the next file-level directive.
   */
  private recoverFromError(): void {
    if (this.isFileLevelSync()) {
      return;
    }
    const mark = this.pos;
    while (!this.isEOF()) {
      this.advance();
      if (this.isFileLevelSync() && this.pos > mark) {
        return;
      }
    }
  }

  /**
   * Used when a duplicate file-level block is found: we must not stop on the
   * duplicate `@` token, so we advance and then resync to the *next* top-level
   * directive.
   */
  private recoverSkipDuplicateAtDirective(): void {
    const mark = this.pos;
    if (!this.isEOF()) {
      this.advance();
    }
    while (!this.isEOF()) {
      if (this.isFileLevelSync() && this.pos > mark) {
        return;
      }
      this.advance();
    }
  }

  private isFileLevelSync(): boolean {
    const k = this.cur().kind;
    return (
      k === "AT_DRIVER" ||
      k === "AT_TABLE" ||
      k === "AT_VERSION" ||
      k === "AT_INPUT" ||
      k === "AT_QUERY" ||
      k === "AT_TRANSACTION"
    );
  }

  private asPrimitive(value: string, span: Span): TsqPrimitive {
    if (PRIMITIVES.has(value)) return value as TsqPrimitive;
    this.diagnostics.push({
      severity: "error",
      message: `Unknown type '${value}'. Expected: string | number | boolean | Date | unknown`,
      span,
      code: "P002",
    });
    return "unknown";
  }

  private asDriver(value: string, span: Span): Driver {
    if (DRIVERS.has(value)) return value as Driver;
    this.diagnostics.push({
      severity: "error",
      message: `Unknown driver '${value}'. Expected: postgres | mysql | sqlite | supabase`,
      span,
      code: "P002",
    });
    return "postgres";
  }

  // ── @driver <name> ────────────────────────────────────────────────────────

  private parseDriver(): DriverDirective {
    const start = this.consume("AT_DRIVER").span.start;
    this.skipNewlines();
    const tok = this.consumeIdent("driver name");
    const driver = this.asDriver(tok.value, tok.span);
    return {
      kind: "DriverDirective",
      span: { start, end: tok.span.end },
      driver,
    };
  }

  // ── @table <name> ─────────────────────────────────────────────────────────

  private parseTable(): TableDirective {
    const start = this.consume("AT_TABLE").span.start;
    this.skipNewlines();
    const tok = this.consumeIdent("table name");
    return {
      kind: "TableDirective",
      span: { start, end: tok.span.end },
      table: tok.value,
    };
  }

  // ── @version <number> ─────────────────────────────────────────────────────

  private parseVersion(): VersionDirective {
    const start = this.consume("AT_VERSION").span.start;
    this.skipNewlines();
    const tok = this.consume("NUMBER", "version number");
    const version = Number.parseInt(tok.value, 10);
    if (Number.isNaN(version) || version < 1) {
      this.report("Version must be a positive integer", tok.span, "P002");
      return {
        kind: "VersionDirective",
        span: { start, end: tok.span.end },
        version: 1,
      };
    }
    return {
      kind: "VersionDirective",
      span: { start, end: tok.span.end },
      version,
    };
  }

  // ── @input block ──────────────────────────────────────────────────────────

  private parseInput(): InputBlock {
    const start = this.consume("AT_INPUT").span.start;
    const params: ParamDecl[] = [];

    // params are indented lines until we hit another @directive or EOF
    while (!this.isEOF() && !this.isDirective()) {
      this.skipNewlines();
      if (this.isEOF() || this.isDirective()) break;
      if (this.cur().kind === "IDENT") {
        params.push(this.parseParamDecl());
      } else {
        this.advance(); // skip unexpected tokens
      }
    }

    const end = params.at(-1)?.span.end ?? this.curSpan().end;
    return { kind: "InputBlock", span: { start, end }, params };
  }

  // ── param declaration: name[?] type [= default] ───────────────────────────

  private parseParamDecl(): ParamDecl {
    const nameTok = this.consumeIdent("parameter name");
    const start = nameTok.span.start;
    let optional = false;
    let defaultValue: string | null = null;

    // optional marker
    if (this.cur().kind === "QUESTION") {
      optional = true;
      this.advance();
    }

    // type
    this.skipSpacesInLine();
    const typeTok = this.consumeIdent("type name");
    const type = this.asPrimitive(typeTok.value, typeTok.span);

    // optional default: = <value>
    this.skipSpacesInLine();
    if (this.cur().kind === "EQUALS") {
      this.advance(); // consume =
      this.skipSpacesInLine();
      const defTok = this.cur();
      if (
        defTok.kind === "NUMBER" ||
        defTok.kind === "STRING" ||
        defTok.kind === "IDENT"
      ) {
        defaultValue = defTok.value;
        this.advance();
        if (!optional) optional = true; // params with defaults are implicitly optional
      } else {
        this.report("Expected default value after =", defTok.span, "P001");
      }
    }

    const end = this.tokens[this.pos - 1]?.span.end ?? typeTok.span.end;
    return {
      kind: "ParamDecl",
      span: { start, end },
      name: nameTok.value,
      type,
      optional,
      defaultValue,
    };
  }

  // ── @query <name> ─────────────────────────────────────────────────────────

  private parseQuery(): QueryBlock {
    const start = this.consume("AT_QUERY").span.start;
    this.skipNewlines();
    const nameTok = this.consumeIdent("query name");

    const body = this.parseSqlBody();
    const output = this.parseOutputBlock();

    const end = output.at(-1)?.span.end ?? nameTok.span.end;
    return {
      kind: "QueryBlock",
      span: { start, end },
      name: nameTok.value,
      body,
      output,
    };
  }

  // ── SQL body — everything until @output/@query/@transaction/EOF ───────────

  private parseSqlBody(): SqlBodyNode[] {
    const nodes: SqlBodyNode[] = [];

    while (!this.isEOF()) {
      const tok = this.cur();

      if (tok.kind === "AT_OUTPUT") break;
      if (tok.kind === "AT_QUERY") break;
      if (tok.kind === "AT_TRANSACTION") break;
      if (tok.kind === "AT_INPUT") break;

      if (tok.kind === "SLOT") {
        nodes.push(this.parseSlot());
      } else if (tok.kind === "IF_OPEN") {
        nodes.push(this.parseIfBlock());
      } else if (tok.kind === "IF_CLOSE") {
        break; // let parseIfBlock consume this
      } else if (tok.kind === "NEWLINE") {
        nodes.push({ kind: "SqlText", span: tok.span, value: "\n" });
        this.advance();
      } else {
        // accumulate consecutive SQL text tokens (lexer skips spaces between tokens)
        const textStart = tok.span.start;
        let text = tok.value;
        this.advance();

        while (
          !this.isEOF() &&
          this.cur().kind !== "SLOT" &&
          this.cur().kind !== "IF_OPEN" &&
          this.cur().kind !== "IF_CLOSE" &&
          this.cur().kind !== "NEWLINE" &&
          this.cur().kind !== "AT_OUTPUT" &&
          this.cur().kind !== "AT_QUERY" &&
          this.cur().kind !== "AT_TRANSACTION" &&
          this.cur().kind !== "AT_INPUT" &&
          this.cur().kind !== "EOF"
        ) {
          text = this.concatSqlText(text, this.cur().value);
          this.advance();
        }

        const textEnd =
          this.tokens[this.pos - 1]?.span.end ?? this.curSpan().end;
        nodes.push({
          kind: "SqlText",
          span: { start: textStart, end: textEnd },
          value: text,
        });
      }
    }

    return nodes;
  }

  // ── {slot} ────────────────────────────────────────────────────────────────

  private parseSlot(): SlotExpr {
    const tok = this.consume("SLOT", "slot expression");
    return { kind: "SlotExpr", span: tok.span, name: tok.value };
  }

  // ── [IF param] ... [/IF] ──────────────────────────────────────────────────

  private parseIfBlock(): IfBlock {
    const openTok = this.consume("IF_OPEN", "[IF ...]");
    const param = openTok.value;
    const body = this.parseSqlBody();

    if (this.cur().kind !== "IF_CLOSE") {
      const endPos =
        this.tokens[Math.max(0, this.pos - 1)]?.span.end ?? this.curSpan().end;
      this.report(
        `Expected [/IF] to close [IF ${param}]`,
        this.curSpan(),
        "P005",
      );
      return {
        kind: "IfBlock",
        span: { start: openTok.span.start, end: endPos },
        param,
        body,
      };
    }
    const closeTok = this.consume("IF_CLOSE");
    return {
      kind: "IfBlock",
      span: { start: openTok.span.start, end: closeTok.span.end },
      param,
      body,
    };
  }

  // ── @output block ─────────────────────────────────────────────────────────

  private parseOutputBlock(): OutputColumn[] {
    if (this.cur().kind !== "AT_OUTPUT") return [];
    this.consume("AT_OUTPUT");
    const cols: OutputColumn[] = [];

    while (!this.isEOF() && !this.isDirective()) {
      this.skipNewlines();
      if (this.isEOF() || this.isDirective()) break;
      if (this.cur().kind === "IDENT") {
        cols.push(this.parseOutputColumn());
      } else {
        this.advance();
      }
    }

    return cols;
  }

  // ── output column: name type ──────────────────────────────────────────────

  private parseOutputColumn(): OutputColumn {
    const nameTok = this.consumeIdent("output column name");
    const start = nameTok.span.start;
    this.skipSpacesInLine();
    const typeTok = this.consumeIdent("output column type");
    const type = this.asPrimitive(typeTok.value, typeTok.span);
    return {
      kind: "OutputColumn",
      span: { start, end: typeTok.span.end },
      name: nameTok.value,
      type,
    };
  }

  // ── @transaction block ────────────────────────────────────────────────────

  private parseTransaction(): TransactionBlock {
    const start = this.consume("AT_TRANSACTION").span.start;
    const queries: QueryBlock[] = [];

    while (!this.isEOF()) {
      this.skipNewlines();
      if (this.isEOF()) break;
      if (this.cur().kind === "AT_QUERY") {
        try {
          queries.push(this.parseQuery());
        } catch (e) {
          this.handleParseFailure(e, this.cur());
        }
      } else if (this.isTopLevelDirective()) {
        break;
      } else {
        this.advance();
      }
    }

    if (queries.length === 0) {
      this.report(
        "@transaction block must contain at least one @query",
        { start, end: this.curSpan().end },
        "P004",
      );
    }

    const end = queries.at(-1)?.span.end ?? this.curSpan().end;
    return { kind: "TransactionBlock", span: { start, end }, queries };
  }

  // ── token stream helpers ──────────────────────────────────────────────────

  private cur(): Token {
    return this.tokens[this.pos] ?? this.eofToken();
  }

  private curSpan(): Span {
    return this.cur().span;
  }

  private advance(): Token {
    const tok = this.cur();
    if (tok.kind !== "EOF") this.pos++;
    return tok;
  }

  private consume(kind: TokenKind, expected?: string): Token {
    const tok = this.cur();
    if (tok.kind !== kind) {
      throw new ParseError(
        `Expected ${expected ?? kind} but got '${tok.value}' (${tok.kind})`,
        tok.span,
      );
    }
    return this.advance();
  }

  private consumeIdent(expected: string): Token {
    const tok = this.cur();
    if (tok.kind !== "IDENT") {
      throw new ParseError(
        `Expected ${expected} but got '${tok.value}' (${tok.kind})`,
        tok.span,
      );
    }
    return this.advance();
  }

  private skipNewlines(): void {
    while (!this.isEOF() && this.cur().kind === "NEWLINE") this.advance();
  }

  private skipSpacesInLine(): void {
    // newlines are separate tokens, so this is a no-op in most cases
    // but some single-line constructs need to skip NEWLINE as separator
    while (!this.isEOF() && this.cur().kind === "NEWLINE") {
      // peek: if next is an ident on a new indented line, keep going
      break;
    }
  }

  private isEOF(): boolean {
    return this.cur().kind === "EOF";
  }

  private isDirective(): boolean {
    const k = this.cur().kind;
    return (
      k === "AT_DRIVER" ||
      k === "AT_TABLE" ||
      k === "AT_VERSION" ||
      k === "AT_INPUT" ||
      k === "AT_QUERY" ||
      k === "AT_OUTPUT" ||
      k === "AT_TRANSACTION"
    );
  }

  private isTopLevelDirective(): boolean {
    const k = this.cur().kind;
    return (
      k === "AT_DRIVER" ||
      k === "AT_TABLE" ||
      k === "AT_VERSION" ||
      k === "AT_INPUT" ||
      k === "AT_TRANSACTION"
    );
  }

  private eofToken(): Token {
    const last = this.tokens[this.tokens.length - 1];
    const pos: Position = last?.span.end ?? { line: 1, col: 1, offset: 0 };
    return { kind: "EOF", value: "", span: { start: pos, end: pos } };
  }

  /**
   * The lexer skips horizontal space between tokens; re-insert a space when
   * gluing would merge SQL words (e.g. AND + ps → AND ps).
   */
  private concatSqlText(a: string, b: string): string {
    if (!a) return b;
    if (!b) return a;
    const la = a[a.length - 1]!;
    const fb = b[0]!;
    if (la === ")" && fb === "(") return a + b;
    if (la === "," && /[\w$]/.test(fb)) return `${a} ${b}`;
    if ((la === "=" || la === ">" || la === "<") && /[\w$]/.test(fb))
      return `${a} ${b}`;
    if (la === "=" && fb === "$") return `${a} ${b}`;
    if (/[\w$)]/.test(la) && /[\w(]/.test(fb)) return `${a} ${b}`;
    return a + b;
  }
}
