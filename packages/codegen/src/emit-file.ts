import type { Diagnostic, ParamDecl, QueryBlock, TsqFile } from "@tsqlx/core";
import { emitFunction, TARGET_IMPORTS } from "./emit-function.js";
import type { CodegenOptions, EmitTarget } from "./options.js";
import { DEFAULT_BANNER, resolveTarget } from "./options.js";
import { SqlBuilder } from "./sql-builder.js";
import { emitInputInterface, emitRowInterface } from "./types.js";

// ─── Result ───────────────────────────────────────────────────────────────────

export interface FileEmitResult {
  /** Full text of the generated .tsq.ts file */
  code: string;
  /** Target that was used */
  target: EmitTarget;
  /** Number of functions emitted */
  functionCount: number;
  /**
   * Queries skipped because `@output` was missing or empty (e.g. half-parsed
   * after a recoverable parse error).
   */
  warnings: Diagnostic[];
}

// ─── File emitter ─────────────────────────────────────────────────────────────

export function emitFile(
  file: TsqFile,
  filename: string,
  opts: CodegenOptions = {},
): FileEmitResult {
  const indent = opts.indent ?? "  ";
  const exportSqlStrings = opts.exportSqlStrings ?? false;
  const target = resolveTarget(file.driver?.driver, opts.target);

  const sections: string[] = [];

  if (opts.banner !== false) {
    const banner = (opts.banner ?? DEFAULT_BANNER)
      .replace("{filename}", filename)
      .replace("{target}", target);
    sections.push(banner);
  }

  const importLine = TARGET_IMPORTS[target];
  if (importLine) sections.push(importLine);

  const allQueries: QueryBlock[] = [
    ...file.queries,
    ...file.transactions.flatMap((tx) => tx.queries),
  ];

  const params: ParamDecl[] = file.input?.params ?? [];
  const warnings: Diagnostic[] = [];

  for (const query of allQueries) {
    if (query.output.length === 0) {
      warnings.push({
        severity: "warning",
        message: `Skipped codegen for query '${query.name}': no @output columns (incomplete or empty query).`,
        span: query.span,
        code: "C001",
      });
      continue;
    }

    const queryParts: string[] = [];

    const usedParamNames = collectUsedSlots(query);
    const usedParams = params.filter((p) => usedParamNames.has(p.name));

    if (usedParams.length > 0) {
      queryParts.push(emitInputInterface(query.name, usedParams, indent));
    }

    queryParts.push(emitRowInterface(query.name, query.output, indent));

    const builder = new SqlBuilder(usedParams);
    const sqlResult = builder.build(query.body);

    queryParts.push(
      emitFunction(query, usedParams, target, sqlResult, {
        indent,
        exportSqlStrings,
      }),
    );

    sections.push(queryParts.join("\n\n"));
  }

  const code = `${sections.join("\n\n")}\n`;

  const emitted = allQueries.filter((q) => q.output.length > 0);

  return {
    code,
    target,
    functionCount: emitted.length,
    warnings,
  };
}

function collectUsedSlots(query: QueryBlock): Set<string> {
  const names = new Set<string>();

  function walk(body: typeof query.body): void {
    for (const node of body) {
      if (node.kind === "SlotExpr") names.add(node.name);
      else if (node.kind === "IfBlock") {
        names.add(node.param);
        walk(node.body);
      }
    }
  }

  walk(query.body);
  return names;
}
