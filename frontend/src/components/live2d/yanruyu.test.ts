import { test } from "node:test";
import assert from "node:assert/strict";
import {
  YANRUYU_MODEL_URL,
  YANRUYU_PATH,
  checkYanruyuSupport,
  isYanruyuUrl,
  mapEmotion,
  shouldApply,
} from "./yanruyu.ts";

test("mapEmotion 對照表", () => {
  assert.equal(mapEmotion("neutral"), "normal");
  assert.equal(mapEmotion("anger"), "angry");
  assert.equal(mapEmotion("angry"), "angry");
  assert.equal(mapEmotion("happy"), "happy");
  assert.equal(mapEmotion("surprised"), "happy");
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
  const ok = { maxTextureSize: 16384, isTouch: false, innerWidth: 1440, deviceMemory: 8 };
  assert.deepEqual(checkYanruyuSupport(ok), { ok: true });
  assert.equal(checkYanruyuSupport({ ...ok, maxTextureSize: 4096 }).ok, false);
  assert.equal(checkYanruyuSupport({ ...ok, maxTextureSize: null }).ok, false);
  assert.equal(checkYanruyuSupport({ ...ok, isTouch: true, innerWidth: 390 }).ok, false);
  assert.equal(checkYanruyuSupport({ ...ok, deviceMemory: 4 }).ok, false);
  assert.equal(checkYanruyuSupport({ ...ok, isTouch: true, innerWidth: 1366 }).ok, true);
  assert.equal(checkYanruyuSupport({ ...ok, deviceMemory: undefined }).ok, true);
});

test("isYanruyuUrl 大小寫不敏感", () => {
  assert.equal(YANRUYU_PATH, "/yanruyu/");
  assert.equal(YANRUYU_MODEL_URL, "/yanruyu/yanruyu.model3.json");
  assert.equal(isYanruyuUrl(YANRUYU_MODEL_URL), true);
  assert.equal(isYanruyuUrl("/Yanruyu/yanruyu.model3.json"), true);
  assert.equal(isYanruyuUrl("/poncho/poncho.model3.json"), false);
});
