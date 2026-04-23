# TSQL-X example queries

Self-contained **`.tsq`** starters you can copy into a project and adapt. Table and column names are **illustrative**—match them to your real schema and migrations.

## Files

| File | What it shows |
|------|----------------|
| [`users.tsq`](users.tsq) | Single-row fetch by id with `WHERE` + `{param}`. |
| [`orders.tsq`](orders.tsq) | `JOIN` between `orders` and `users`, named columns. |
| [`paginated-list.tsq`](paginated-list.tsq) | `LIMIT` / `OFFSET`, optional filters with `[IF param] … [/IF]`. |
| [`sessions.tsq`](sessions.tsq) | Auth-adjacent list (active sessions for a user). |
| [`pest-report-demo.tsq`](pest-report-demo.tsq) | Original pest report demo (also available in the playground as “Pest report”). |

## Using in your repo

1. Copy a file (or merge pieces) into something like `queries/<name>.tsq`.
2. Run the CLI after a build:

   ```bash
   pnpm exec tsqlx compile --root . --glob "queries/**/*.tsq"
   ```

   Or use [`@tsqlx/vite`](../packages/vite) and `import` from `*.tsq` in your app.

3. Wire the generated functions to your `pg.Pool` / Prisma client as described in the root [README](../README.md).

## Note on SQL

Dialect snippets (e.g. `::uuid`) assume PostgreSQL, matching `@driver postgres` in the examples. For MySQL or SQLite, adjust casts and types in `@output` to match your driver and TypeScript model.
