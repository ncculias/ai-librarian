import { test } from "node:test";
import assert from "node:assert/strict";
import {
  HALF_BODY_FRACTION,
  computePlacement,
  halfBodyFractionFor,
  parseCharacterView,
  parseLayoutMode,
} from "./display.ts";

test("parseCharacterView / parseLayoutMode 非法值回預設", () => {
  assert.equal(parseCharacterView("half"), "half");
  assert.equal(parseCharacterView("full"), "full");
  assert.equal(parseCharacterView(undefined), "full");
  assert.equal(parseCharacterView("HALF"), "full");
  assert.equal(parseCharacterView(1), "full");
  assert.equal(parseLayoutMode("stacked"), "stacked");
  assert.equal(parseLayoutMode(null), "side");
  assert.equal(parseLayoutMode("vertical"), "side");
});

test("computePlacement full = 現行算式(水平置中、底部貼 98%)", () => {
  const b = { minX: 100, minY: 200, maxX: 300, maxY: 1200 }; // cw 200, ch 1000, cx 200
  const p = computePlacement(b, 400, 500, "full");
  const sc = Math.min((400 * 0.9) / 200, (500 * 0.95) / 1000); // 0.475
  assert.equal(p.scale, sc);
  assert.equal(p.x, 400 / 2 - 200 * sc);
  assert.equal(p.y, 500 * 0.98 - 1200 * sc);
});

test("computePlacement half = 上 60% 貼合、頂部貼 2%", () => {
  const b = { minX: 100, minY: 200, maxX: 300, maxY: 1200 };
  const p = computePlacement(b, 400, 500, "half");
  const sc = Math.min((400 * 0.9) / 200, (500 * 0.95) / (1000 * HALF_BODY_FRACTION));
  assert.equal(p.scale, sc);
  assert.equal(p.x, 400 / 2 - 200 * sc);
  assert.equal(p.y, 500 * 0.02 - 200 * sc);
  assert.ok(p.scale > computePlacement(b, 400, 500, "full").scale);
});

test("computePlacement 極小容器仍回正數 scale", () => {
  const b = { minX: 0, minY: 0, maxX: 3500, maxY: 5000 };
  for (const view of ["full", "half"] as const) {
    const p = computePlacement(b, 1, 1, view);
    assert.ok(p.scale > 0);
    assert.ok(Number.isFinite(p.x) && Number.isFinite(p.y));
  }
});

test("computePlacement half 可帶各角色的半身比例;halfBodyFractionFor 粟粟 0.55、其他用預設", () => {
  const b = { minX: 0, minY: 0, maxX: 100, maxY: 1000 };
  const d = computePlacement(b, 400, 500, "half");
  const p = computePlacement(b, 400, 500, "half", 0.5);
  // 比例越小 → 要容納的高度越少 → 放大倍率越大
  assert.ok(p.scale > d.scale);
  assert.equal(p.scale, Math.min((400 * 0.9) / 100, (500 * 0.95) / (1000 * 0.5)));
  assert.equal(halfBodyFractionFor("/poncho/poncho.model3.json"), 0.55);
  assert.equal(halfBodyFractionFor("/yanruyu/yanruyu.model3.json"), HALF_BODY_FRACTION);
});
