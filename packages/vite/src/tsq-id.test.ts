import * as assert from "node:assert/strict";
import { test } from "node:test";
import { isTsqModuleId } from "./tsq-id.js";

test("isTsqModuleId: plain path", () => {
  assert.equal(isTsqModuleId("/abs/q.tsq"), true);
  assert.equal(isTsqModuleId("C:\\proj\\q.tsq"), true);
});

test("isTsqModuleId: strips query and hash (Vite)", () => {
  assert.equal(isTsqModuleId("/p/q.tsq?raw"), true);
  assert.equal(isTsqModuleId("/p/q.tsq#foo"), true);
});

test("isTsqModuleId: non-tsq", () => {
  assert.equal(isTsqModuleId("/p/file.ts"), false);
});
