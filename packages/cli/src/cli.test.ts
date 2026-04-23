import * as assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const here = fileURLToPath(new URL(".", import.meta.url));
const cliEntry = join(here, "cli.js");

const minimalTsq = `@driver postgres

@input
  x string

@query q
  SELECT 1

@output
  x string
`;

test("cli: compile --dry-run writes path to stdout", () => {
  const dir = mkdtempSync(join(tmpdir(), "tsqlx-cli-"));
  try {
    writeFileSync(join(dir, "q.tsq"), minimalTsq, "utf8");
    const out = execFileSync(
      process.execPath,
      [cliEntry, "compile", "--root", dir, "--glob", "q.tsq", "--dry-run"],
      { encoding: "utf8" },
    );
    assert.match(out, /\[dry-run\].*q\.tsq\.ts/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("cli: no match exit 1", () => {
  const dir = mkdtempSync(join(tmpdir(), "tsqlx-cli-empty-"));
  try {
    let code = 0;
    try {
      execFileSync(process.execPath, [
        cliEntry,
        "compile",
        "--root",
        dir,
        "--glob",
        "missing.tsq",
        "--dry-run",
      ]);
    } catch (e: unknown) {
      const err = e as { status: number };
      code = err.status;
    }
    assert.equal(code, 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("cli: no args exits 1", () => {
  let code = 0;
  try {
    execFileSync(process.execPath, [cliEntry]);
  } catch (e: unknown) {
    const err = e as { status: number };
    code = err.status;
  }
  assert.equal(code, 1);
});
