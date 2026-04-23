import type { ParamDecl, QueryBlock } from "@tsqlx/core";
import type { EmitTarget } from "./options.js";
import type { SqlBuildResult, SqlSegment } from "./sql-builder.js";
import { parseConditionalSegments } from "./sql-builder.js";
import {
  emitReturnType,
  inputInterfaceName,
  rowInterfaceName,
} from "./types.js";

// ─── Driver import lines ──────────────────────────────────────────────────────

export const TARGET_IMPORTS: Record<EmitTarget, string> = {
  raw: "",
  pg: `import type { Pool, PoolClient } from "pg";`,
  drizzle: `import type { Pool, PoolClient } from "pg";
// drizzle-orm: use the same Pool instance you pass to drizzle(pool) from drizzle-orm/node-postgres`,
  prisma: `import type { PrismaClient } from "@prisma/client";`,
};

// ─── Client param signature ───────────────────────────────────────────────────

const CLIENT_PARAM: Record<EmitTarget, string | null> = {
  raw: null,
  pg: "db: Pool | PoolClient",
  drizzle: "db: Pool | PoolClient",
  prisma: "db: PrismaClient",
};

// ─── Main emitter ─────────────────────────────────────────────────────────────

export function emitFunction(
  query: QueryBlock,
  params: ParamDecl[],
  target: EmitTarget,
  sqlResult: SqlBuildResult,
  opts: { indent: string; exportSqlStrings: boolean },
): string {
  const { indent, exportSqlStrings } = opts;
  const { sqlTemplate, paramsExpr, hasConditionals } = sqlResult;
  const clientParam = CLIENT_PARAM[target];
  const hasParams = params.length > 0;

  const lines: string[] = [];

  if (exportSqlStrings) {
    lines.push(emitSqlConstant(query.name, sqlTemplate, indent));
    lines.push("");
  }

  const sigParts: string[] = [];
  if (clientParam) sigParts.push(clientParam);
  if (hasParams) sigParts.push(`input: ${inputInterfaceName(query.name)}`);

  const returnType =
    query.output.length > 0 ? emitReturnType(query.name) : "Promise<unknown[]>";

  lines.push(
    `export async function ${query.name}(`,
    ...sigParts.map(
      (p, i) => `${indent}${p}${i < sigParts.length - 1 ? "," : ""}`,
    ),
    `): ${returnType} {`,
  );

  switch (target) {
    case "raw":
      lines.push(
        ...emitRawBody(
          query,
          params,
          sqlTemplate,
          paramsExpr,
          hasConditionals,
          indent,
        ),
      );
      break;
    case "pg":
    case "drizzle":
      lines.push(
        ...emitPgBody(
          query,
          params,
          sqlTemplate,
          paramsExpr,
          hasConditionals,
          indent,
        ),
      );
      break;
    case "prisma":
      lines.push(
        ...emitPrismaBody(
          query,
          params,
          sqlTemplate,
          paramsExpr,
          hasConditionals,
          indent,
        ),
      );
      break;
  }

  lines.push("}");
  return lines.join("\n");
}

function emitSqlConstant(
  queryName: string,
  sqlTemplate: string,
  _indent: string,
): string {
  const constName = `${queryName
    .replace(/([A-Z])/g, "_$1")
    .toUpperCase()
    .replace(/^_/, "")}_SQL`;
  const escaped = sqlTemplate.replace(/`/g, "\\`").replace(/\$\{/g, "\\${");
  return `export const ${constName} = \`${escaped}\`;`;
}

function emitConditionalParams(
  params: ParamDecl[],
  sqlTemplate: string,
  indent: string,
): string[] {
  const lines: string[] = [];
  const segments = parseConditionalSegments(sqlTemplate, params);

  const staticParams = params.filter(
    (p) => !p.optional || p.defaultValue != null,
  );
  const conditionalParams = params.filter(
    (p) => p.optional && p.defaultValue == null,
  );

  lines.push(`${indent}const _params: unknown[] = [`);
  for (const p of staticParams) {
    const val =
      p.defaultValue != null
        ? `input.${p.name} ?? ${p.defaultValue}`
        : `input.${p.name}`;
    lines.push(`${indent}${indent}${val},`);
  }
  lines.push(`${indent}];`);
  lines.push(
    `${indent}let _sql = \`${buildStaticSqlTemplate(segments, indent)}\`;`,
  );
  lines.push("");

  for (const p of conditionalParams) {
    lines.push(`${indent}if (input.${p.name} != null) {`);
    lines.push(`${indent}${indent}_params.push(input.${p.name});`);
    const seg = segments.find(
      (s): s is Extract<SqlSegment, { type: "conditional" }> =>
        s.type === "conditional" && s.param === p.name,
    );
    if (seg) {
      const innerEscaped = seg.innerSql
        .replace(/`/g, "\\`")
        .replace(/\$\{/g, "\\${")
        .trimEnd();
      // Builder used global $N indices; after _params.push, every placeholder in this
      // fragment must use the final 1-based pg index = _params.length.
      lines.push(
        `${indent}${indent}_sql += \`${innerEscaped}\`.replace(/\\$\\d+/g, () => "$" + String(_params.length));`,
      );
    } else {
      throw new Error(
        `[tsqlx/codegen] internal: missing conditional SQL segment for param "${p.name}"`,
      );
    }
    lines.push(`${indent}}`);
    lines.push("");
  }

  return lines;
}

function buildStaticSqlTemplate(
  segments: SqlSegment[],
  _indent: string,
): string {
  return segments
    .filter((s) => s.type === "sql")
    .map((s) =>
      (s as { type: "sql"; sql: string }).sql
        .replace(/`/g, "\\`")
        .replace(/\$\{/g, "\\${")
        .trimEnd(),
    )
    .join("")
    .trimEnd();
}

function emitRawBody(
  _query: QueryBlock,
  params: ParamDecl[],
  sqlTemplate: string,
  paramsExpr: string,
  hasConditionals: boolean,
  indent: string,
): string[] {
  const lines: string[] = [];

  if (hasConditionals) {
    lines.push(...emitConditionalParams(params, sqlTemplate, indent));
    lines.push(`${indent}// Pass _sql and _params to your query executor`);
    lines.push(
      `${indent}throw new Error("raw target: provide a query executor");`,
    );
  } else {
    const escaped = sqlTemplate
      .replace(/`/g, "\\`")
      .replace(/\$\{/g, "\\${")
      .trimEnd();
    lines.push(`${indent}const _sql = \`${escaped}\`;`);
    lines.push(`${indent}const _params = ${paramsExpr};`);
    lines.push(`${indent}// Pass _sql and _params to your query executor`);
    lines.push(
      `${indent}throw new Error("raw target: provide a query executor");`,
    );
  }

  return lines;
}

function emitPgBody(
  query: QueryBlock,
  params: ParamDecl[],
  sqlTemplate: string,
  paramsExpr: string,
  hasConditionals: boolean,
  indent: string,
): string[] {
  const rowType = rowInterfaceName(query.name);
  const lines: string[] = [];

  if (hasConditionals) {
    lines.push(...emitConditionalParams(params, sqlTemplate, indent));
    lines.push(
      `${indent}const { rows } = await db.query<${rowType}>({ text: _sql, values: _params });`,
    );
  } else {
    const escaped = sqlTemplate
      .replace(/`/g, "\\`")
      .replace(/\$\{/g, "\\${")
      .trimEnd();
    lines.push(`${indent}const { rows } = await db.query<${rowType}>({`);
    lines.push(`${indent}${indent}text: \`${escaped}\`,`);
    lines.push(`${indent}${indent}values: ${paramsExpr},`);
    lines.push(`${indent}});`);
  }

  lines.push(`${indent}return rows;`);
  return lines;
}

function emitPrismaBody(
  query: QueryBlock,
  params: ParamDecl[],
  sqlTemplate: string,
  paramsExpr: string,
  hasConditionals: boolean,
  indent: string,
): string[] {
  const rowType = rowInterfaceName(query.name);
  const lines: string[] = [];

  if (hasConditionals) {
    lines.push(...emitConditionalParams(params, sqlTemplate, indent));
    lines.push(
      `${indent}const result = await db.$queryRawUnsafe<${rowType}[]>(_sql, ..._params);`,
    );
  } else {
    const escaped = sqlTemplate
      .replace(/`/g, "\\`")
      .replace(/\$\{/g, "\\${")
      .trimEnd();
    const paramSpread = paramsExpr === "[]" ? "" : `, ...${paramsExpr}`;
    lines.push(
      `${indent}const result = await db.$queryRawUnsafe<${rowType}[]>(`,
    );
    lines.push(`${indent}${indent}\`${escaped}\`${paramSpread}`);
    lines.push(`${indent});`);
  }

  lines.push(`${indent}return result;`);
  return lines;
}
