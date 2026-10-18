import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_BOOK_GUIDE_PROMPT,
  normalizeBookGuidePrompt,
} from "./personaModules.ts";

test("normalizeBookGuidePrompt", () => {
  assert.equal(normalizeBookGuidePrompt(undefined), DEFAULT_BOOK_GUIDE_PROMPT);
  assert.equal(normalizeBookGuidePrompt(null), DEFAULT_BOOK_GUIDE_PROMPT);
  assert.equal(normalizeBookGuidePrompt(""), DEFAULT_BOOK_GUIDE_PROMPT);
  assert.equal(normalizeBookGuidePrompt("   \n"), DEFAULT_BOOK_GUIDE_PROMPT);
  assert.equal(normalizeBookGuidePrompt(42), DEFAULT_BOOK_GUIDE_PROMPT);
  assert.equal(normalizeBookGuidePrompt(" 自訂指令 "), " 自訂指令 ");
  assert.ok(DEFAULT_BOOK_GUIDE_PROMPT.includes("書名、作者、主題、摘要"));
});
