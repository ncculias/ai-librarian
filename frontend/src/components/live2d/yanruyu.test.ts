import { test } from "node:test";
import assert from "node:assert/strict";
import {
  YANRUYU_MODEL_URL,
  YANRUYU_PATH,
  YANRUYU_PORTRAIT_URL,
  checkYanruyuSupport,
  isYanruyuUrl,
  mapEmotion,
  shouldApply,
} from "./yanruyu.ts";

test("mapEmotion 對照表", () => {
  assert.equal(mapEmotion("neutral"), "normal");
  assert.equal(mapEmotion("anger"), null);
  assert.equal(mapEmotion("think"), "think");
  assert.equal(mapEmotion("angry"), "angry");
  assert.equal(mapEmotion("happy"), "happy");
  assert.equal(mapEmotion("surprised"), "think");
  assert.equal(mapEmotion("sad"), "sad");
  assert.equal(mapEmotion("excited"), null);
  assert.equal(mapEmotion(""), null);
  assert.equal(mapEmotion(null), null);
  assert.equal(mapEmotion(undefined), null);
});

test("shouldApply 同情緒不重觸發", () => {
  assert.equal(shouldApply("happy", "happy"), false);
  assert.equal(shouldApply(null, "happy"), true);
  assert.equal(shouldApply("happy", null), false);
  assert.equal(shouldApply("happy", "sad"), true);
});

test("checkYanruyuSupport", () => {
  const ok = { maxTextureSize: 16384, isTouch: false, screenMin: 1440, deviceMemory: 8 };
  assert.deepEqual(checkYanruyuSupport(ok), { ok: true });

  // 貼圖上限
  assert.deepEqual(checkYanruyuSupport({ ...ok, maxTextureSize: 4096 }), {
    ok: false,
    reason: "貼圖上限 4096 < 8192",
  });
  assert.deepEqual(checkYanruyuSupport({ ...ok, maxTextureSize: null }), {
    ok: false,
    reason: "無 WebGL",
  });
  assert.equal(checkYanruyuSupport({ ...ok, maxTextureSize: 8192 }).ok, true); // 邊界

  // 行動裝置(以螢幕短邊判斷,與橫豎向無關)
  assert.deepEqual(checkYanruyuSupport({ ...ok, isTouch: true, screenMin: 390 }), {
    ok: false,
    reason: "行動裝置(待 4096 貼圖)",
  });
  assert.equal(checkYanruyuSupport({ ...ok, isTouch: true, screenMin: 1024 }).ok, false); // 邊界:12.9" iPad
  assert.equal(checkYanruyuSupport({ ...ok, isTouch: true, screenMin: 1080 }).ok, true);
  assert.equal(checkYanruyuSupport({ ...ok, isTouch: false, screenMin: 390 }).ok, true);

  // 裝置記憶體
  assert.deepEqual(checkYanruyuSupport({ ...ok, deviceMemory: 4 }), {
    ok: false,
    reason: "裝置記憶體 4GB <= 4GB",
  });
  assert.equal(checkYanruyuSupport({ ...ok, deviceMemory: 5 }).ok, true); // 邊界
  assert.equal(checkYanruyuSupport({ ...ok, deviceMemory: undefined }).ok, true);
});

test("isYanruyuUrl 大小寫不敏感", () => {
  assert.equal(YANRUYU_PATH, "/yanruyu/");
  assert.equal(YANRUYU_MODEL_URL, "/yanruyu/yanruyu.model3.json");
  assert.equal(YANRUYU_PORTRAIT_URL, "/yanruyu/portrait.png");
  assert.equal(isYanruyuUrl(YANRUYU_MODEL_URL), true);
  assert.equal(isYanruyuUrl("/Yanruyu/yanruyu.model3.json"), true);
  assert.equal(isYanruyuUrl("/poncho/poncho.model3.json"), false);
});
