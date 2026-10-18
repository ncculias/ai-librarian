import { test } from "node:test";
import assert from "node:assert/strict";
import {
  LIPSYNC_GAIN,
  LIPSYNC_SMOOTHING,
  LIPSYNC_THRESHOLD,
  fakeMouthAt,
  mouthFromRms,
  rmsOf,
  smoothMouth,
} from "./lipsync.ts";

test("rmsOf", () => {
  assert.equal(rmsOf([]), 0);
  assert.equal(rmsOf([0, 0, 0]), 0);
  assert.equal(rmsOf([1, -1, 1, -1]), 1);
  assert.ok(Math.abs(rmsOf([0.5, -0.5]) - 0.5) < 1e-12);
});

test("mouthFromRms 門檻與增益", () => {
  assert.equal(mouthFromRms(0), 0);
  assert.equal(mouthFromRms(LIPSYNC_THRESHOLD), 0);
  assert.equal(mouthFromRms(1), 1);
  const mid = LIPSYNC_THRESHOLD + 0.5 / LIPSYNC_GAIN;
  assert.ok(Math.abs(mouthFromRms(mid) - 0.5) < 1e-12);
  assert.equal(mouthFromRms(-1), 0);
});

test("smoothMouth 逼近目標、停在目標", () => {
  assert.equal(smoothMouth(0, 1), LIPSYNC_SMOOTHING);
  assert.equal(smoothMouth(1, 1), 1);
  const back = smoothMouth(1, 0);
  assert.ok(back < 1 && back > 0);
});

test("fakeMouthAt 值域 0..1 且會變化", () => {
  const samples = Array.from({ length: 200 }, (_, i) => fakeMouthAt(i * 10));
  assert.ok(samples.every((v) => v >= 0 && v <= 1));
  assert.ok(Math.max(...samples) - Math.min(...samples) > 0.5);
});
