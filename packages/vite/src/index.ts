import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import type { EmitTarget } from "@tsqlx/codegen";
import { generate } from "@tsqlx/codegen";
import type { HmrContext, ModuleNode, Plugin } from "vite";
import { isTsqModuleId } from "./tsq-id.js";

export { isTsqModuleId } from "./tsq-id.js";

export interface TsqlxViteOptions {
  /**
   * SQL driver target for generated code. Defaults to `pg` when unset.
   */
  target?: EmitTarget;
}

/**
 * Vite plugin: `import { fn } from "./queries/report.tsq"` compiles the `.tsq` file
 * to TypeScript. Changes to `.tsq` files trigger HMR for the compiled module and importers.
 */
export function tsqlx(options: TsqlxViteOptions = {}): Plugin {
  const target = options.target ?? "pg";

  return {
    name: "tsqlx",
    enforce: "pre",
    async load(id) {
      if (!isTsqModuleId(id)) return;

      const source = await readFile(id, "utf-8");
      const out = generate(source, basename(id), { target });
      if (!out.ok) {
        const lines = out.diagnostics
          .map(
            (d) =>
              `${d.code} (${d.severity}): ${d.message} @ ${d.span.start.line}:${d.span.start.col}`,
          )
          .join("\n");
        this.error(`tsqlx: compile failed for ${id}\n${lines}`);
      }
      return out.code;
    },
    handleHotUpdate(ctx: HmrContext): ModuleNode[] | undefined {
      if (!ctx.file.endsWith(".tsq")) return;
      return [...ctx.modules];
    },
  };
}

export default tsqlx;
