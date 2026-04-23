#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import { parseArgs } from "node:util";
import { generate } from "@tsqlx/codegen";
import fg from "fast-glob";

function printDiagnostics(
  fileLabel: string,
  diagnostics: { severity: string; message: string; code: string }[],
): void {
  for (const d of diagnostics) {
    console.error(`[${d.severity}] ${fileLabel} ${d.code}: ${d.message}`);
  }
}

async function compileCommand(args: string[]): Promise<number> {
  const { values } = parseArgs({
    args,
    options: {
      root: { type: "string", short: "r", default: process.cwd() },
      glob: { type: "string", short: "g", default: "**/*.tsq" },
      "dry-run": { type: "boolean", default: false },
      target: { type: "string", short: "t" },
    },
    allowPositionals: true,
    strict: false,
  });

  const root = resolve(values.root as string);
  const pattern = values.glob as string;
  const dryRun = values["dry-run"] as boolean;
  const target = values.target as string | undefined;

  const paths = await fg(pattern, {
    cwd: root,
    absolute: true,
    onlyFiles: true,
  });
  if (paths.length === 0) {
    console.error(`tsqlx: no files matched glob "${pattern}" under ${root}`);
    return 1;
  }

  let exit = 0;
  for (const absPath of paths) {
    const source = readFileSync(absPath, "utf8");
    const filename = basename(absPath);
    const result = generate(source, filename, {
      ...(target
        ? { target: target as "raw" | "pg" | "drizzle" | "prisma" }
        : {}),
    });

    if (!result.ok) {
      exit = 1;
      printDiagnostics(filename, result.diagnostics);
      continue;
    }

    const outPath = absPath.replace(/\.tsq$/i, ".tsq.ts");
    if (!dryRun) {
      writeFileSync(outPath, result.code, "utf8");
    }
    console.log(dryRun ? `[dry-run] ${outPath}` : `wrote ${outPath}`);
  }

  return exit;
}

function usage(): void {
  console.log(`tsqlx — compile .tsq files to typed TypeScript

Usage:
  tsqlx compile [options]

Options:
  -r, --root <dir>     Root directory for glob (default: cwd)
  -g, --glob <pattern> Glob pattern (default: **/*.tsq)
  -t, --target <name>  Override emit target: raw | pg | drizzle | prisma
      --dry-run        Print output paths without writing files
`);
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const [cmd, ...rest] = argv;

  if (!cmd || cmd === "-h" || cmd === "--help") {
    usage();
    process.exit(cmd ? 0 : 1);
  }

  if (cmd !== "compile") {
    console.error(`tsqlx: unknown command "${cmd}"`);
    usage();
    process.exit(1);
  }

  const code = await compileCommand(rest);
  process.exit(code);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
