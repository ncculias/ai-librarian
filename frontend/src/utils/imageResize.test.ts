import { test } from "node:test";
import assert from "node:assert/strict";
import { MAX_EDGE, fitWithin } from "./imageResize.ts";

test("fitWithin 長邊超過上限時等比例縮到上限", () => {
  assert.deepEqual(fitWithin(4000, 3000, 1600), { width: 1600, height: 1200 });
  assert.deepEqual(fitWithin(3000, 4000, 1600), { width: 1200, height: 1600 });
});

test("fitWithin 已在上限內就不放大", () => {
  assert.deepEqual(fitWithin(800, 600, 1600), { width: 800, height: 600 });
  assert.deepEqual(fitWithin(1600, 900, 1600), { width: 1600, height: 900 });
});

test("fitWithin 結果至少 1px，並四捨五入成整數", () => {
  assert.deepEqual(fitWithin(5000, 1, 1600), { width: 1600, height: 1 });
  assert.deepEqual(fitWithin(3001, 2000, 1600), { width: 1600, height: 1066 });
});

test("預設長邊上限為 1600", () => {
  assert.equal(MAX_EDGE, 1600);
});
