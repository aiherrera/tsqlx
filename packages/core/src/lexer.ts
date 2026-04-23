import type { Diagnostic } from "./analyzer.js";
import type { Position, Span } from "./ast.js";

// ─── Token kinds ─────────────────────────────────────────────────────────────

export type TokenKind =
  // Directives
  | "AT_DRIVER"
  | "AT_TABLE"
  | "AT_VERSION"
  | "AT_INPUT"
  | "AT_QUERY"
  | "AT_OUTPUT"
  | "AT_TRANSACTION"
  // SQL conditional blocks
  | "IF_OPEN" // [IF ident]
  | "IF_CLOSE" // [/IF]
  // Interpolation
  | "SLOT" // {ident}
  // Primitives
  | "IDENT"
  | "NUMBER"
  | "STRING" // quoted string literal for defaults
  // Misc
  | "NEWLINE"
  | "QUESTION" // ?
  | "EQUALS" // =
  | "EOF";

export interface Token {
  kind: TokenKind;
  value: string;
  span: Span;
}

// ─── Directive keyword map ────────────────────────────────────────────────────

const DIRECTIVE_MAP: Record<string, TokenKind> = {
  driver: "AT_DRIVER",
  table: "AT_TABLE",
  version: "AT_VERSION",
  input: "AT_INPUT",
  query: "AT_QUERY",
  output: "AT_OUTPUT",
  transaction: "AT_TRANSACTION",
};

// ─── Lexer ────────────────────────────────────────────────────────────────────

export interface TokenizeResult {
  tokens: Token[];
  /** Lexer recoverable issues (unknown `@`, bad `{slot}` / `[IF`, etc.) */
  diagnostics: Diagnostic[];
}

export class Lexer {
  private pos = 0;
  private line = 1;
  private col = 1;
  private readonly diagnostics: Diagnostic[] = [];

  constructor(private readonly src: string) {}

  /**
   * Full tokenization with error recovery: lex errors become diagnostics; token stream
   * continues so the parser can process the rest of the file.
   */
  tokenize(): TokenizeResult {
    this.diagnostics.length = 0;
    const tokens: Token[] = [];
    while (this.pos < this.src.length) {
      const tok = this.next();
      if (tok) tokens.push(tok);
    }
    const endPos = this.position();
    tokens.push(this.makeToken("EOF", "", endPos, endPos));
    return { tokens, diagnostics: [...this.diagnostics] };
  }

  // ── internal helpers ───────────────────────────────────────────────────────

  private position(): Position {
    return { line: this.line, col: this.col, offset: this.pos };
  }

  private makeToken(
    kind: TokenKind,
    value: string,
    start: Position,
    end: Position,
  ): Token {
    return { kind, value, span: { start, end } };
  }

  private advance(n = 1): string {
    let result = "";
    for (let i = 0; i < n; i++) {
      const ch = this.src[this.pos++];
      result += ch;
      if (ch === "\n") {
        this.line++;
        this.col = 1;
      } else {
        this.col++;
      }
    }
    return result;
  }

  private peek(offset = 0): string {
    return this.src[this.pos + offset] ?? "";
  }

  private match(str: string): boolean {
    return this.src.startsWith(str, this.pos);
  }

  // ── skip inline whitespace (not newlines) ──────────────────────────────────

  private skipSpaces(): void {
    while (this.pos < this.src.length) {
      const ch = this.peek();
      if (ch === " " || ch === "\t" || ch === "\r") {
        this.advance();
      } else {
        break;
      }
    }
  }

  // ── skip line comment (-- ...) ────────────────────────────────────────────

  private skipLineComment(): void {
    while (this.pos < this.src.length && this.peek() !== "\n") {
      this.advance();
    }
  }

  /** Skip to end of line (after unknown directive, etc.) */
  private skipToEndOfLine(): void {
    while (this.pos < this.src.length && this.peek() !== "\n") {
      this.advance();
    }
  }

  // ── read identifier or keyword ────────────────────────────────────────────

  private readIdent(): string {
    let ident = "";
    while (this.pos < this.src.length) {
      const ch = this.peek();
      if (/[\w$]/.test(ch)) {
        ident += this.advance();
      } else {
        break;
      }
    }
    return ident;
  }

  // ── read number literal ───────────────────────────────────────────────────

  private readNumber(): string {
    let num = "";
    while (this.pos < this.src.length && /[\d.]/.test(this.peek())) {
      num += this.advance();
    }
    return num;
  }

  // ── read quoted string ────────────────────────────────────────────────────

  private readString(quote: string): string {
    this.advance(); // consume opening quote
    let str = "";
    while (this.pos < this.src.length && this.peek() !== quote) {
      if (this.peek() === "\\") {
        this.advance();
        str += this.advance();
      } else {
        str += this.advance();
      }
    }
    if (this.pos < this.src.length) this.advance(); // consume closing quote
    return str;
  }

  // ── main dispatch ─────────────────────────────────────────────────────────

  private next(): Token | null {
    this.skipSpaces();
    if (this.pos >= this.src.length) return null;

    const start = this.position();
    const ch = this.peek();

    // ── line comment ────────────────────────────────────────────────────────
    if (this.match("--")) {
      this.skipLineComment();
      return null;
    }

    // ── newline ─────────────────────────────────────────────────────────────
    if (ch === "\n") {
      this.advance();
      const end = this.position();
      return this.makeToken("NEWLINE", "\n", start, end);
    }

    // ── @directive ───────────────────────────────────────────────────────────
    if (ch === "@") {
      this.advance(); // consume @
      const name = this.readIdent().toLowerCase();
      const kind = DIRECTIVE_MAP[name];
      if (!kind) {
        const end = this.position();
        this.diagnostics.push({
          severity: "error",
          message: `Unknown directive @${name}`,
          span: { start, end },
          code: "L001",
        });
        this.skipToEndOfLine();
        return null;
      }
      const end = this.position();
      return this.makeToken(kind, name, start, end);
    }

    // ── {slot} ───────────────────────────────────────────────────────────────
    if (ch === "{") {
      this.advance(); // consume {
      const name = this.readIdent();
      if (this.peek() !== "}") {
        const errEnd = this.position();
        this.diagnostics.push({
          severity: "error",
          message: `Expected } after slot name '${name}'`,
          span: { start, end: errEnd },
          code: "L002",
        });
        while (
          this.pos < this.src.length &&
          this.peek() !== "}" &&
          this.peek() !== "\n"
        ) {
          this.advance();
        }
        if (this.peek() === "}") {
          this.advance();
        }
        return null;
      }
      this.advance(); // consume }
      const end = this.position();
      return this.makeToken("SLOT", name, start, end);
    }

    // ── [IF ident] or [/IF] ──────────────────────────────────────────────────
    if (ch === "[") {
      if (this.match("[/IF]") || this.match("[/if]")) {
        this.advance(5);
        const end = this.position();
        return this.makeToken("IF_CLOSE", "[/IF]", start, end);
      }
      if (this.match("[IF ") || this.match("[if ")) {
        this.advance(4); // consume [IF<space>
        const name = this.readIdent();
        if (this.peek() !== "]") {
          const errEnd = this.position();
          this.diagnostics.push({
            severity: "error",
            message: `Expected ] after IF condition '${name}'`,
            span: { start, end: errEnd },
            code: "L003",
          });
          while (
            this.pos < this.src.length &&
            this.peek() !== "]" &&
            this.peek() !== "\n"
          ) {
            this.advance();
          }
          if (this.peek() === "]") {
            this.advance();
          }
          return null;
        }
        this.advance(); // consume ]
        const end = this.position();
        return this.makeToken("IF_OPEN", name, start, end);
      }
      // Plain [ in SQL — treat as SQL text, fall through to ident
    }

    // ── ? ────────────────────────────────────────────────────────────────────
    if (ch === "?") {
      this.advance();
      return this.makeToken("QUESTION", "?", start, this.position());
    }

    // ── = ────────────────────────────────────────────────────────────────────
    if (ch === "=") {
      this.advance();
      this.skipSpaces();
      return this.makeToken("EQUALS", "=", start, this.position());
    }

    // ── quoted string (default values) ───────────────────────────────────────
    if (ch === '"' || ch === "'") {
      const str = this.readString(ch);
      return this.makeToken("STRING", str, start, this.position());
    }

    // ── number ───────────────────────────────────────────────────────────────
    if (/\d/.test(ch)) {
      const num = this.readNumber();
      return this.makeToken("NUMBER", num, start, this.position());
    }

    // ── identifier ───────────────────────────────────────────────────────────
    if (/[a-zA-Z_$]/.test(ch)) {
      const ident = this.readIdent();
      return this.makeToken("IDENT", ident, start, this.position());
    }

    // ── anything else: SQL punctuation, operators, etc. ───────────────────────
    // Accumulate a run of SQL non-special chars into a single IDENT token
    // so that SQL keywords (SELECT, FROM, etc.) pass through as IDENT
    let text = this.advance();
    while (
      this.pos < this.src.length &&
      !/[@{[\n?="']/.test(this.peek()) &&
      !this.match("--")
    ) {
      text += this.advance();
    }
    return this.makeToken("IDENT", text, start, this.position());
  }
}

// ─── Lex error ────────────────────────────────────────────────────────────────

export class LexError extends Error {
  constructor(
    message: string,
    public readonly position: Position,
  ) {
    super(`[LexError] ${message} at line ${position.line}:${position.col}`);
    this.name = "LexError";
  }
}
