// ─── Positions ───────────────────────────────────────────────────────────────

export interface Position {
  line: number; // 1-based
  col: number; // 1-based
  offset: number; // byte offset from start of file
}

export interface Span {
  start: Position;
  end: Position;
}

// ─── Primitive types ─────────────────────────────────────────────────────────

export type TsqPrimitive = "string" | "number" | "boolean" | "Date" | "unknown";

export type Driver = "postgres" | "mysql" | "sqlite" | "supabase";

// ─── Param declaration (inside @input block) ─────────────────────────────────

export interface ParamDecl {
  kind: "ParamDecl";
  span: Span;
  name: string;
  type: TsqPrimitive;
  optional: boolean; // trailing ?
  defaultValue: string | null; // literal default, e.g. "100"
}

// ─── SQL body parts ──────────────────────────────────────────────────────────

/** Plain SQL text fragment — no interpolation */
export interface SqlText {
  kind: "SqlText";
  span: Span;
  value: string;
}

/** {paramName} slot interpolation */
export interface SlotExpr {
  kind: "SlotExpr";
  span: Span;
  name: string;
}

/** [IF paramName] ... [/IF] conditional block */
export interface IfBlock {
  kind: "IfBlock";
  span: Span;
  param: string;
  body: SqlBodyNode[];
}

export type SqlBodyNode = SqlText | SlotExpr | IfBlock;

// ─── @output column ──────────────────────────────────────────────────────────

export interface OutputColumn {
  kind: "OutputColumn";
  span: Span;
  name: string;
  type: TsqPrimitive;
}

// ─── @query block ────────────────────────────────────────────────────────────

export interface QueryBlock {
  kind: "QueryBlock";
  span: Span;
  name: string;
  body: SqlBodyNode[];
  output: OutputColumn[];
}

// ─── @transaction block ──────────────────────────────────────────────────────

export interface TransactionBlock {
  kind: "TransactionBlock";
  span: Span;
  queries: QueryBlock[];
}

// ─── Top-level directives ────────────────────────────────────────────────────

export interface DriverDirective {
  kind: "DriverDirective";
  span: Span;
  driver: Driver;
}

export interface TableDirective {
  kind: "TableDirective";
  span: Span;
  table: string;
}

export interface VersionDirective {
  kind: "VersionDirective";
  span: Span;
  version: number;
}

export interface InputBlock {
  kind: "InputBlock";
  span: Span;
  params: ParamDecl[];
}

// ─── Root file node ──────────────────────────────────────────────────────────

export interface TsqFile {
  kind: "TsqFile";
  span: Span;
  driver: DriverDirective | null;
  table: TableDirective | null;
  version: VersionDirective | null;
  input: InputBlock | null;
  queries: QueryBlock[];
  transactions: TransactionBlock[];
}

// ─── Union helpers ────────────────────────────────────────────────────────────

export type TsqNode =
  | TsqFile
  | DriverDirective
  | TableDirective
  | VersionDirective
  | InputBlock
  | ParamDecl
  | QueryBlock
  | TransactionBlock
  | OutputColumn
  | SqlText
  | SlotExpr
  | IfBlock;
