import type { ParamDecl, SqlBodyNode } from "@tsqlx/core";

// ─── SQL build result ─────────────────────────────────────────────────────────

export interface SqlBuildResult {
  /** The parameterised SQL template string (multi-line, with $1/$2/? placeholders) */
  sqlTemplate: string;
  /**
   * Ordered list of slot names in the order they appear as positional params.
   * Duplicates are included (same slot used twice = appears twice in params array).
   */
  paramOrder: string[];
  /**
   * The JS expression that constructs the params array at runtime.
   * e.g. `[input.companyId, input.from, input.to, input.limit ?? 100]`
   */
  paramsExpr: string;
  /**
   * Whether conditional [IF] params are present, requiring runtime array mutation.
   */
  hasConditionals: boolean;
}

// ─── Builder ──────────────────────────────────────────────────────────────────

export class SqlBuilder {
  private paramIndex = 0;
  private paramOrder: string[] = [];
  private hasConditionals = false;

  constructor(private readonly params: ParamDecl[]) {}

  build(body: SqlBodyNode[]): SqlBuildResult {
    const sqlTemplate = this.buildBody(body);
    const paramsExpr = this.buildParamsExpr();
    return {
      sqlTemplate,
      paramOrder: [...this.paramOrder],
      paramsExpr,
      hasConditionals: this.hasConditionals,
    };
  }

  // ── body → SQL string ─────────────────────────────────────────────────────

  private buildBody(body: SqlBodyNode[]): string {
    let out = "";
    for (const n of body) {
      if (n.kind === "SqlText") {
        const v = n.value;
        if (
          out.length > 0 &&
          /[\w)]$/.test(out) &&
          v.length > 0 &&
          /^[A-Za-z]/.test(v)
        ) {
          out += " ";
        }
        out += v;
      } else if (n.kind === "SlotExpr") {
        if (out.length > 0) {
          const la = out[out.length - 1]!;
          const needsSpaceBeforePlaceholder =
            la === "=" ||
            la === "<" ||
            la === ">" ||
            (/[A-Za-z0-9)]/.test(la) && la !== "(");
          if (needsSpaceBeforePlaceholder && !out.endsWith(" ")) out += " ";
        }
        out += this.addParam(n.name);
      } else if (n.kind === "IfBlock") {
        out += this.buildIfBlock(n.param, n.body);
      }
    }
    return out;
  }

  // ── slot → placeholder ────────────────────────────────────────────────────

  /** Postgres-style $n for all current emit targets. */
  private addParam(name: string): string {
    this.paramOrder.push(name);
    this.paramIndex++;
    return `$${this.paramIndex}`;
  }

  // ── [IF param] block → runtime conditional ────────────────────────────────

  private buildIfBlock(param: string, body: SqlBodyNode[]): string {
    this.hasConditionals = true;
    const inner = this.buildBody(body);
    return `/*IF:${param}*/${inner}/*ENDIF*/`;
  }

  // ── params array expression ───────────────────────────────────────────────

  private buildParamsExpr(): string {
    if (this.hasConditionals) {
      return "__CONDITIONAL__";
    }

    const parts = this.paramOrder.map((name) => {
      const decl = this.params.find((p) => p.name === name);
      if (!decl) return `input.${name}`;
      if (decl.defaultValue != null) {
        return `input.${name} ?? ${decl.defaultValue}`;
      }
      return `input.${name}`;
    });

    return `[${parts.join(", ")}]`;
  }
}

// ─── Parse conditional sentinels back into structured info ───────────────────

export type SqlSegment =
  | { type: "sql"; sql: string }
  | {
      type: "conditional";
      param: string;
      innerSql: string;
      innerSlots: string[];
    };

/**
 * Split a SQL template that contains /*IF:param*\/...\/*ENDIF*\/ sentinels
 * into an array of segments for the function emitter to render as runtime code.
 */
export function parseConditionalSegments(
  sqlTemplate: string,
  _allParams: ParamDecl[],
): SqlSegment[] {
  const segments: SqlSegment[] = [];
  const re = /\/\*IF:(\w+)\*\/([\s\S]*?)\/\*ENDIF\*\//g;
  let last = 0;
  let match: RegExpExecArray | null = re.exec(sqlTemplate);
  while (match !== null) {
    const [full, param, inner] = match;
    if (match.index > last) {
      segments.push({ type: "sql", sql: sqlTemplate.slice(last, match.index) });
    }

    segments.push({
      type: "conditional",
      param,
      innerSql: inner,
      innerSlots: [param],
    });
    last = match.index + full.length;
    match = re.exec(sqlTemplate);
  }

  if (last < sqlTemplate.length) {
    segments.push({ type: "sql", sql: sqlTemplate.slice(last) });
  }

  return segments;
}
