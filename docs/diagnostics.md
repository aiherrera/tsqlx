# Diagnostic codes

All diagnostics use a short **`code`** string. Severity is `error`, `warning`, or `info`.

## Lexer (`L*`) — [packages/core/src/lexer.ts](../packages/core/src/lexer.ts)

| Code | Meaning |
|------|--------|
| `L001` | Unknown `@directive` name (line skipped after the error). |
| `L002` | Malformed `{slot}` (missing `}` or similar; recovery skips to a safe point). |
| `L003` | Malformed `[IF …]` (missing `]`, etc.). |

`compile()` also maps thrown legacy `LexError` to `L001` in the rare fatal path.

## Parser (`P*`) — [packages/core/src/parser.ts](../packages/core/src/parser.ts)

| Code | Meaning |
|------|--------|
| `P001` | Generic parse failure (e.g. `consume` mismatch), or from uncaught `ParseError` mapping. |
| `P002` | Unknown `@input` / `@output` type; unknown `@driver` (fallback used); invalid `@version` number. |
| `P003` | Duplicate top-level block (`@driver`, `@table`, `@version`, `@input`). |
| `P004` | `@transaction` with no inner `@query`. |
| `P005` | `[IF` without matching `[/IF]`. |

## Analyzer (`A*`) — [packages/core/src/analyzer.ts](../packages/core/src/analyzer.ts)

| Code | Meaning |
|------|--------|
| `A001` | Missing `@driver` (warning). |
| `A002` | No `@input` block while queries exist (info). |
| `A003` | File has no `@query` or `@transaction` (warning). |
| `A004` | Duplicate query names. |
| `A010` | Reference to an undeclared `{slot}`. |
| `A011` | `[IF]` on a **required** input param. |
| `A012` | Query has no `@output` columns (warning). |
| `A013` | Output column name not camelCase (warning). |
| `A014` | Query with empty SQL body (error). |

## Codegen (`C*`) — [packages/codegen/src/emit-file.ts](../packages/codegen/src/emit-file.ts)

| Code | Meaning |
|------|--------|
| `C001` | Skipped generating a function for a query with **no** `@output` columns (incomplete or empty). |

## Tooling

- **Language server** maps core diagnostics to LSP; `source` is `tsqlx` ([convert.ts](../packages/language-server/src/convert.ts)).
- **VS Code** shows the same codes in the Problems panel.

If you add a new diagnostic, document it here and in the unit test that covers it when possible.
