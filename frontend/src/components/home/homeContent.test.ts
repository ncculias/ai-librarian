import { test } from "node:test";
import assert from "node:assert/strict";
import { HOME_ENTRIES, STAGE_STEPS, stepFromProgress } from "./homeContent.ts";

test("三個入口的路由與頁首分頁一致", () => {
  assert.deepEqual(HOME_ENTRIES.map((e) => e.to), ["/librarian", "/book-guide", "/my-story-book"]);
  assert.deepEqual(HOME_ENTRIES.map((e) => e.no), ["01", "02", "03"]);
  for (const e of HOME_ENTRIES) {
    assert.ok(e.title && e.short && e.long);
    assert.equal(e.go, `進入${e.title} →`);
  }
});

test("stepFromProgress 依門檻切成 0..3，邊界含上界", () => {
  assert.equal(stepFromProgress(0), 0);
  assert.equal(stepFromProgress(0.11), 0);
  assert.equal(stepFromProgress(0.12), 1);
  assert.equal(stepFromProgress(0.41), 1);
  assert.equal(stepFromProgress(0.42), 2);
  assert.equal(stepFromProgress(0.71), 2);
  assert.equal(stepFromProgress(0.72), 3);
  assert.equal(stepFromProgress(1), 3);
  assert.equal(stepFromProgress(Number.NaN), 0);
  assert.equal(stepFromProgress(-1), 0);
  assert.equal(stepFromProgress(2), 3);
  assert.deepEqual([...STAGE_STEPS], [0.12, 0.42, 0.72]);
});
