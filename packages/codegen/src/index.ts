export type { CodegenOptions, EmitTarget } from "./options.js";
export { resolveTarget, DEFAULT_BANNER } from "./options.js";

export type { FileEmitResult } from "./emit-file.js";
export { emitFile } from "./emit-file.js";

export { SqlBuilder } from "./sql-builder.js";
export type { SqlBuildResult, SqlSegment } from "./sql-builder.js";
export { parseConditionalSegments } from "./sql-builder.js";

export {
  emitInputInterface,
  emitRowInterface,
  emitPrimitive,
  emitReturnType,
  inputInterfaceName,
  rowInterfaceName,
  sqlConstName,
  pascalCase,
  screamingSnake,
} from "./types.js";

export { emitFunction, TARGET_IMPORTS } from "./emit-function.js";

import { compile } from "@tsqlx/core";
import type { Diagnostic } from "@tsqlx/core";
import { emitFile } from "./emit-file.js";
import type { FileEmitResult } from "./emit-file.js";
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
