import { test } from "node:test";
import assert from "node:assert/strict";
import {
  BOOK_GUIDE_INSTRUCTION,
  DEFAULT_BOOK_GUIDE_SYSTEM_PROMPT,
  DEFAULT_SYSTEM_PROMPT,
  normalizePrompt,
} from "./personaModules.ts";

test("normalizePrompt", () => {
  assert.equal(normalizePrompt(undefined, "預設"), "預設");
  assert.equal(normalizePrompt("   \n", "預設"), "預設");
  assert.equal(normalizePrompt(42, "預設"), "預設");
  assert.equal(normalizePrompt(" 自訂 ", "預設"), " 自訂 ");
  assert.ok(DEFAULT_BOOK_GUIDE_SYSTEM_PROMPT.startsWith(DEFAULT_SYSTEM_PROMPT));
  assert.ok(DEFAULT_BOOK_GUIDE_SYSTEM_PROMPT.endsWith(BOOK_GUIDE_INSTRUCTION));
  assert.ok(BOOK_GUIDE_INSTRUCTION.includes("書名、作者、主題、摘要"));
});
