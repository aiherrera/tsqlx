# Contributing to TSQL-X

## Prerequisites

- Node.js 20 or newer
- [pnpm](https://pnpm.io) 9.x
- Docker (only for integration tests: `pnpm run test:integration` or the `@tsqlx/integration-tests` package)

## Setup

```bash
pnpm install
pnpm run build
pnpm test
```

- **Unit tests** run across `@tsqlx/core`, `@tsqlx/codegen`, `@tsqlx/cli`, `@tsqlx/language-server`, and `@tsqlx/vite` (fast, no Docker). Run `pnpm run lint` before a PR; `pnpm run format` applies Biome fixes.
- **Documentation:** [docs/architecture.md](docs/architecture.md) (compiler pipeline and packages) and [docs/diagnostics.md](docs/diagnostics.md) (error code tables).
- **Changing the language, analyzer, or codegen:** read [Extending the compiler & codegen](#extending-the-compiler--codegen) below for AST layout, new emit targets, and diagnostics.
- **Integration tests** run a real `.tsq` through `generate()`, load the emitted module, and query Postgres inside Testcontainers. Run when changing codegen or the `pg` emit path:

  ```bash
  pnpm run test:integration
  ```

  To skip in a script: `SKIP_PG_E2E=1` is supported in development if you add checks around optional suites; the default integration test file uses Node’s `test({ skip: ... })` only for `SKIP_PG_E2E=1` when you set it in the test runner environment.

## Repository layout

| Path | Role |
|------|------|
| `packages/core` | Lexer, parser, analyzer, `compile()` |
| `packages/codegen` | `.tsq` → TypeScript |
| `packages/cli` | `tsqlx` CLI |
| `packages/language-server` | LSP (diagnostics, slot hovers) — published as `@tsqlx/language-server` |
| `packages/vite` | `@tsqlx/vite` plugin |
| `packages/integration-tests` | Postgres + Testcontainers e2e |
| `apps/playground` | Vite + Monaco browser playground |
| `apps/demo` | Hono + `pg` sample app |
| `extensions/vscode-tsqlx` | VS Code extension (private; pack with `vsce` for `.vsix`) |

## Extending the compiler & codegen

This section is for contributors who extend `.tsq` syntax, semantic checks, or generated TypeScript. For the full pipeline overview, see [docs/architecture.md](docs/architecture.md). Every diagnostic code is listed in [docs/diagnostics.md](docs/diagnostics.md).

`compile()` in `@tsqlx/core` merges **lexer**, **parser**, and **analyzer** diagnostics. `@tsqlx/codegen` can add **`C*`** warnings (for example when a query is skipped during emit) on top of that via `generate()`.

### AST node types

The canonical definitions live in [`packages/core/src/ast.ts`](packages/core/src/ast.ts).

- **Discriminated union:** each node has a `kind` field (for example `"TsqFile"`, `"QueryBlock"`, `"SlotExpr"`). Narrow on `kind` when walking the tree.
- **Root:** `TsqFile` holds optional `driver`, `table`, `version`, and `input`, plus `queries` and `transactions`. Each `TransactionBlock` contains nested `QueryBlock` nodes.
- **SQL body:** inside a query, `body` is `SqlBodyNode[]`: `SqlText` (raw SQL fragments), `SlotExpr` (a `{paramName}` slot), and `IfBlock` (conditional region with a recursive `body`).
- **Spans:** nodes include a `Span` (`start` / `end` as `Position` with 1-based line and column and a byte `offset`) so diagnostics and the language server can underline the right range.

**Traversal:** use [`packages/core/src/walker.ts`](packages/core/src/walker.ts) (`walk`, `Visitor`) for a consistent recursive walk. The analyzer often uses simple loops over `body` and nested `IfBlock` bodies (see slot and `[IF]` checks).

**New surface syntax:** update the **lexer** ([`packages/core/src/lexer.ts`](packages/core/src/lexer.ts)), **parser** ([`packages/core/src/parser.ts`](packages/core/src/parser.ts)), and **AST** together, then add or extend fixtures and tests in [`packages/core/src/index.test.ts`](packages/core/src/index.test.ts) (and [`packages/core/src/fixtures.ts`](packages/core/src/fixtures.ts) when helpful).

### Adding a new emit target

Targets are the `EmitTarget` string union consumed by `@tsqlx/codegen`. The `drizzle` target reuses the same emitted function body as `pg` (`emitPgBody`); new targets can follow that pattern or fork their own emitter.

| Step | Where | What to do |
|------|--------|------------|
| Union + resolution | [`packages/codegen/src/options.ts`](packages/codegen/src/options.ts) | Add a literal to `EmitTarget`. If `@driver` should map to it, extend `resolveTarget` (and, when needed, the `Driver` type in [`packages/core/src/ast.ts`](packages/core/src/ast.ts)). |
| Imports and client parameter | [`packages/codegen/src/emit-function.ts`](packages/codegen/src/emit-function.ts) | Extend `TARGET_IMPORTS` and `CLIENT_PARAM`. |
| Generated function body | [`packages/codegen/src/emit-function.ts`](packages/codegen/src/emit-function.ts) | Add a `case` in `emitFunction` and implement an `emit*Body` helper (mirror `emitRawBody`, `emitPgBody`, or `emitPrismaBody`). |
| SQL placeholders | [`packages/codegen/src/sql-builder.ts`](packages/codegen/src/sql-builder.ts) | Today `SqlBuilder` emits Postgres-style `$n` for all targets. If the new client needs `?`, named parameters, or another dialect, branch on `this.target` in `SqlBuilder` and add tests. |
| Tooling | [`packages/vite/src/index.ts`](packages/vite/src/index.ts), CLI | Once `EmitTarget` widens, TypeScript propagates the new literal to plugin options; wire any CLI flags if the CLI exposes `target` explicitly. |
| Tests | [`packages/codegen/src/index.test.ts`](packages/codegen/src/index.test.ts) | Assert the import line, function signature, and representative emitted code. Run `pnpm run test:integration` when the target affects runtime database access. |

### Writing an analyzer diagnostic

Semantic rules live in [`packages/core/src/analyzer.ts`](packages/core/src/analyzer.ts).

- **Shape:** a `Diagnostic` has `severity` (`"error"` \| `"warning"` \| `"info"`), `message`, `span`, and `code`.
- **Implementation:** add private methods on `Analyzer` and call them from `analyze()`, `analyzeQuery()`, or `analyzeTransaction()`. Use `this.error`, `this.warn`, or `this.info` with the message, the most specific **`span`** available (so the LSP highlights the right token), and a new code.
- **Namespaces:** use **`A*`** for analyzer rules. Reserve **`L*`** for the lexer, **`P*`** for the parser, and **`C*`** for codegen warnings emitted from [`packages/codegen/src/emit-file.ts`](packages/codegen/src/emit-file.ts).
- **Follow-ups:** add the code to [docs/diagnostics.md](docs/diagnostics.md) and a test in [`packages/core/src/index.test.ts`](packages/core/src/index.test.ts) that asserts the `code` and expected message (or behavior).

## Playground (local)

```bash
pnpm run build
pnpm --filter @tsqlx/playground dev
```

Open the URL printed by Vite (default port `5174`).

**Playwright smoke** (build + preview on port 4173; requires Playwright browser install once: `pnpm exec playwright install` from the playground or repo root): `pnpm run test:playground`.

## VS Code extension (from source)

1. `pnpm run build` at the repo root.
2. In VS Code: **File → Open Folder** on `extensions/vscode-tsqlx`.
3. Run the **Run Extension** launch configuration, or `F5` if configured.

## Pull requests

- Keep changes focused; match **Biome** formatting (`pnpm run format` / `pnpm run lint`).
- For compiler, AST, analyzer, or codegen work, follow [Extending the compiler & codegen](#extending-the-compiler--codegen) and update [docs/diagnostics.md](docs/diagnostics.md) when you add or change diagnostic codes.
- Add or update tests for compiler, codegen, CLI, LSP, or Vite changes as appropriate.
- Run `pnpm test` and `pnpm run lint` before pushing. For codegen/pg changes, also run `pnpm run test:integration` with Docker running. Playground UI changes: `pnpm run test:playground` when feasible.

## Publishing (maintainers)

- **Versioning:** use [Changesets](https://github.com/changesets/changesets). Run `pnpm run changeset` to describe changes, merge the PR, then the release workflow (or a maintainer) runs `changeset version` and publishes. Private apps (`@tsqlx/playground`, `vscode-tsqlx`) are ignored in [`.changeset/config.json`](.changeset/config.json).
- **Manual path:** bump `version` in each published `package.json`, then `git tag v0.x.x` and push tags to trigger [`.github/workflows/publish.yml`](.github/workflows/publish.yml) (requires `NPM_TOKEN` with access to the `@tsqlx` scope).
- Published packages: `@tsqlx/core`, `@tsqlx/codegen`, `@tsqlx/cli`, `@tsqlx/vite`, `@tsqlx/language-server`.

## License

By contributing, you agree that your contributions are licensed under the same terms as the project ([LICENSE](LICENSE)).
