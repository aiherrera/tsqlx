import * as assert from "node:assert/strict";
import { test } from "node:test";
import { FX_PEST_REPORT } from "./fixtures.js";
import { generate } from "./index.js";

/**
 * Golden-style checks: stable fragments for conditional + multi-slot SQL lowering.
 */
test("golden: getPestReport emits static prefix and conditional speciesId branch", () => {
  const { code, ok } = generate(FX_PEST_REPORT, "pest.tsq", { target: "pg" });
  assert.equal(ok, true);
  assert.ok(code.includes("if (input.speciesId != null)"));
  assert.ok(code.includes("_params.push(input.speciesId)"));
  assert.ok(code.includes("species_id = $4"));
  assert.ok(
    code.includes('.replace(/\\$\\d+/g, () => "$" + String(_params.length))'),
  );
  assert.ok(code.includes("LIMIT $5"));
  assert.ok(code.includes("const _params: unknown[] = ["));
});
