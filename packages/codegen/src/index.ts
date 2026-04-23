export type { FileEmitResult } from "./emit-file.js";
export { emitFile } from "./emit-file.js";
export { emitFunction, TARGET_IMPORTS } from "./emit-function.js";
export type { CodegenOptions, EmitTarget } from "./options.js";
export { DEFAULT_BANNER, resolveTarget } from "./options.js";
export type { SqlBuildResult, SqlSegment } from "./sql-builder.js";
export { parseConditionalSegments, SqlBuilder } from "./sql-builder.js";
export {
  emitInputInterface,
  emitPrimitive,
  emitReturnType,
  emitRowInterface,
  inputInterfaceName,
  pascalCase,
  rowInterfaceName,
  screamingSnake,
  sqlConstName,
} from "./types.js";

import type { Diagnostic } from "@tsqlx/core";
import { compile } from "@tsqlx/core";
import type { FileEmitResult } from "./emit-file.js";
import { emitFile } from "./emit-file.js";
import type { CodegenOptions } from "./options.js";

export interface GenerateResult extends Omit<FileEmitResult, "warnings"> {
  diagnostics: Diagnostic[];
  ok: boolean;
}

/**
 * Parse + analyze + emit in a single call. Emits code for every query that has
 * at least one `@output` column; incomplete queries produce `C001` warnings
 * and are skipped. `ok` is false if any diagnostic has `severity: "error"`.
 */
export function generate(
  source: string,
  filename: string,
  opts: CodegenOptions = {},
): GenerateResult {
  const { ast, diagnostics: compileDiagnostics } = compile(source);
  const { warnings: emitWarnings, ...emitted } = emitFile(ast, filename, opts);
  const diagnostics = [...compileDiagnostics, ...emitWarnings];
  const ok = !diagnostics.some((d) => d.severity === "error");
  return { ...emitted, diagnostics, ok };
}
