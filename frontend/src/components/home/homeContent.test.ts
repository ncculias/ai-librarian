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

test("stagePoseAt 依關鍵影格內插：頓點區段數值不變、左右互換前先回中間", () => {
  assert.deepEqual(stagePoseAt(0), { x: 0, scale: 1 });
  assert.deepEqual(stagePoseAt(0.1), { x: 0, scale: 1 }); // 步驟 1 前不動
  assert.deepEqual(stagePoseAt(0.27), { x: 14, scale: 1.04 }); // 右邊停
  assert.deepEqual(stagePoseAt(0.4), { x: 0, scale: 1 }); // 1→2 之間的中間頓點
  assert.deepEqual(stagePoseAt(0.57), { x: -14, scale: 1.04 }); // 左邊停
  assert.deepEqual(stagePoseAt(0.7), { x: 0, scale: 1 }); // 2→3 之間的中間頓點
  assert.deepEqual(stagePoseAt(0.9), { x: 12, scale: 1.02 });
  assert.deepEqual(stagePoseAt(1), { x: 12, scale: 1.02 });
  const mid = stagePoseAt(0.16); // 0.12→0.2 的一半：往右走到一半
  assert.ok(Math.abs(mid.x - 7) < 1e-9 && Math.abs(mid.scale - 1.02) < 1e-9);
  assert.deepEqual(stagePoseAt(Number.NaN), { x: 0, scale: 1 });
  assert.deepEqual(stagePoseAt(-1), { x: 0, scale: 1 });
  assert.deepEqual(stagePoseAt(2), { x: 12, scale: 1.02 });
  assert.equal(stagePoseTransform(0.27), "translateX(14.00vw) scale(1.040)");
});
