import type { OutputColumn, ParamDecl, TsqPrimitive } from "@tsqlx/core";

// ─── Primitive mapping ────────────────────────────────────────────────────────

const PRIMITIVE_MAP: Record<TsqPrimitive, string> = {
  string: "string",
  number: "number",
  boolean: "boolean",
  Date: "Date",
  unknown: "unknown",
};

export function emitPrimitive(p: TsqPrimitive): string {
  return PRIMITIVE_MAP[p];
}

// ─── Naming conventions ───────────────────────────────────────────────────────

/** getPestReport → GetPestReport */
export function pascalCase(name: string): string {
  return name.charAt(0).toUpperCase() + name.slice(1);
}

/** getPestReport → GET_PEST_REPORT */
export function screamingSnake(name: string): string {
  return name
    .replace(/([A-Z])/g, "_$1")
    .toUpperCase()
    .replace(/^_/, "");
}

/** input interface name for a query */
export function inputInterfaceName(queryName: string): string {
  return `${pascalCase(queryName)}Input`;
}

/** row interface name for a query */
export function rowInterfaceName(queryName: string): string {
  return `${pascalCase(queryName)}Row`;
}

/** SQL constant name for a query */
export function sqlConstName(queryName: string): string {
  return `${screamingSnake(queryName)}_SQL`;
}

// ─── @input interface ─────────────────────────────────────────────────────────

export function emitInputInterface(
  queryName: string,
  params: ParamDecl[],
  indent: string,
): string {
  if (params.length === 0) return "";

  const name = inputInterfaceName(queryName);
  const lines: string[] = [`export interface ${name} {`];

  for (const p of params) {
    const tsType = emitPrimitive(p.type);
    const optional = p.optional ? "?" : "";
    const defaultNote =
      p.defaultValue != null ? ` // default: ${p.defaultValue}` : "";
    lines.push(`${indent}${p.name}${optional}: ${tsType};${defaultNote}`);
  }

  lines.push("}");
  return lines.join("\n");
}

// ─── @output interface ────────────────────────────────────────────────────────

export function emitRowInterface(
  queryName: string,
  columns: OutputColumn[],
  indent: string,
): string {
  const name = rowInterfaceName(queryName);

  if (columns.length === 0) {
    return `export type ${name} = unknown;`;
  }

  const lines: string[] = [`export interface ${name} {`];
  for (const col of columns) {
    lines.push(`${indent}${col.name}: ${emitPrimitive(col.type)};`);
  }
  lines.push("}");
  return lines.join("\n");
}

// ─── Helper: return type annotation ──────────────────────────────────────────

export function emitReturnType(queryName: string): string {
  return `Promise<${rowInterfaceName(queryName)}[]>`;
}

// ─── Helper: function param list ─────────────────────────────────────────────

export function emitFunctionParams(
  queryName: string,
  params: ParamDecl[],
  clientParam: string | null, // e.g. "db: SupabaseClient" or null
  indent: string,
): string {
  const parts: string[] = [];
  if (clientParam) parts.push(clientParam);
  if (params.length > 0) {
    parts.push(`input: ${inputInterfaceName(queryName)}`);
  }
  if (parts.length === 0) return "()";
  if (parts.length === 1) return `(\n${indent}${parts[0]}\n)`;
  return `(\n${parts.map((p) => `${indent}${p}`).join(",\n")}\n)`;
}
