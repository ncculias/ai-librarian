import { test } from "node:test";
import assert from "node:assert/strict";
import { HOME_ENTRIES, STAGE_STEPS, stagePoseAt, stagePoseTransform, stepFromProgress } from "./homeContent.ts";

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
  assert.equal(stepFromProgress(0.09), 0);
  assert.equal(stepFromProgress(0.1), 1);
  assert.equal(stepFromProgress(0.34), 1);
  assert.equal(stepFromProgress(0.35), 2);
  assert.equal(stepFromProgress(0.59), 2);
  assert.equal(stepFromProgress(0.6), 3);
  assert.equal(stepFromProgress(1), 3);
  assert.equal(stepFromProgress(Number.NaN), 0);
  assert.equal(stepFromProgress(-1), 0);
  assert.equal(stepFromProgress(2), 3);
  assert.deepEqual([...STAGE_STEPS], [0.1, 0.35, 0.6]);
});

test("stagePoseAt 依關鍵影格內插：三段各自停住，段與段之間線性滑過", () => {
  assert.deepEqual(stagePoseAt(0), { x: 0, scale: 1 });
  assert.deepEqual(stagePoseAt(0.09), { x: 0, scale: 1 }); // 步驟 1 前不動
  assert.deepEqual(stagePoseAt(0.3), { x: 14, scale: 1.04 }); // 第一段：右
  assert.deepEqual(stagePoseAt(0.35), { x: 14, scale: 1.04 }); // 步驟 2 起點仍在右
  assert.deepEqual(stagePoseAt(0.5), { x: -14, scale: 1.04 }); // 第二段：左
  assert.deepEqual(stagePoseAt(0.7), { x: 12, scale: 1.02 }); // 第三段：右
  assert.deepEqual(stagePoseAt(0.95), { x: 12, scale: 1.02 }); // 第三段一路停到底
  assert.deepEqual(stagePoseAt(1), { x: 12, scale: 1.02 });
  const mid = stagePoseAt(0.385); // 0.35→0.42 的一半：右→左走到中間
  assert.ok(Math.abs(mid.x - 0) < 1e-9 && Math.abs(mid.scale - 1.04) < 1e-9);
  assert.deepEqual(stagePoseAt(Number.NaN), { x: 0, scale: 1 });
  assert.deepEqual(stagePoseAt(-1), { x: 0, scale: 1 });
  assert.deepEqual(stagePoseAt(2), { x: 12, scale: 1.02 });
  assert.equal(stagePoseTransform(0.3), "translateX(14.00vw) scale(1.040)");
});
