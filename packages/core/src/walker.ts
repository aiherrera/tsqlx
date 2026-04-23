import type {
  IfBlock,
  InputBlock,
  QueryBlock,
  SqlBodyNode,
  TransactionBlock,
  TsqFile,
  TsqNode,
} from "./ast.js";

// ─── Visitor interface ────────────────────────────────────────────────────────
// Each method is optional; return false from any to skip children.

export interface Visitor {
  visitFile?(node: TsqFile): boolean | undefined;
  visitInputBlock?(node: InputBlock): boolean | undefined;
  visitQueryBlock?(node: QueryBlock): boolean | undefined;
  visitTransactionBlock?(node: TransactionBlock): boolean | undefined;
  visitIfBlock?(node: IfBlock): boolean | undefined;
  visitNode?(node: TsqNode): boolean | undefined;
}

// ─── Walk ─────────────────────────────────────────────────────────────────────

export function walk(node: TsqNode, visitor: Visitor): void {
  const cont = visitor.visitNode?.(node);
  if (cont === false) return;

  switch (node.kind) {
    case "TsqFile": {
      const r = visitor.visitFile?.(node);
      if (r === false) return;
      if (node.input) walk(node.input, visitor);
      for (const q of node.queries) walk(q, visitor);
      for (const tx of node.transactions) walk(tx, visitor);
      break;
    }

    case "InputBlock": {
      const r = visitor.visitInputBlock?.(node);
      if (r === false) return;
      for (const p of node.params) walk(p, visitor);
      break;
    }

    case "QueryBlock": {
      const r = visitor.visitQueryBlock?.(node);
      if (r === false) return;
      walkSqlBody(node.body, visitor);
      for (const col of node.output) walk(col, visitor);
      break;
    }

    case "TransactionBlock": {
      const r = visitor.visitTransactionBlock?.(node);
      if (r === false) return;
      for (const q of node.queries) walk(q, visitor);
      break;
    }

    case "IfBlock": {
      const r = visitor.visitIfBlock?.(node);
      if (r === false) return;
      walkSqlBody(node.body, visitor);
      break;
    }

    // leaf nodes — no children
    case "DriverDirective":
    case "TableDirective":
    case "VersionDirective":
    case "ParamDecl":
    case "OutputColumn":
    case "SqlText":
    case "SlotExpr":
      break;
  }
}

function walkSqlBody(body: SqlBodyNode[], visitor: Visitor): void {
  for (const node of body) walk(node, visitor);
}

// ─── Collect all slot names used in a query ───────────────────────────────────

export function collectSlots(body: SqlBodyNode[]): string[] {
  const slots: string[] = [];
  for (const node of body) {
    if (node.kind === "SlotExpr") slots.push(node.name);
    else if (node.kind === "IfBlock") slots.push(...collectSlots(node.body));
  }
  return slots;
}

// ─── Render SQL body back to a string (for display/debug) ────────────────────

export function renderSqlBody(body: SqlBodyNode[]): string {
  return body
    .map((n) => {
      if (n.kind === "SqlText") return n.value;
      if (n.kind === "SlotExpr") return `{${n.name}}`;
      if (n.kind === "IfBlock") {
        return `[IF ${n.param}]${renderSqlBody(n.body)}[/IF]`;
      }
      return "";
    })
    .join("");
}
