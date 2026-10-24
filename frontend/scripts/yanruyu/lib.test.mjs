import { test } from "node:test";
import assert from "node:assert/strict";
import { mergeExpressions, asciiName, buildModel3, EMOTIONS } from "./lib.mjs";

test("mergeExpressions 相加重疊參數、固定 fade 0", () => {
  const out = mergeExpressions([
    { Parameters: [{ Id: "PARAM_L_BROW_Y", Value: 0.3, Blend: "Add" }, { Id: "OP_ARM", Value: 1, Blend: "Add" }] },
    { Parameters: [{ Id: "PARAM_L_BROW_Y", Value: 0.5, Blend: "Add" }] },
  ]);
  assert.equal(out.FadeInTime, 0); assert.equal(out.FadeOutTime, 0);
  assert.deepEqual(out.Parameters, [
    { Id: "OP_ARM", Value: 1, Blend: "Add" },
    { Id: "PARAM_L_BROW_Y", Value: 0.8, Blend: "Add" },
  ]);
});

test("mergeExpressions 遇到非 Add 的 Blend 會丟錯並指出 Id", () => {
  assert.throws(
    () => mergeExpressions([{ Parameters: [{ Id: "PARAM_X", Value: 1, Blend: "Multiply" }] }]),
    /PARAM_X/,
  );
  assert.throws(
    () => mergeExpressions([{ Parameters: [{ Id: "PARAM_Y", Value: 1 }] }]),
    /PARAM_Y/,
  );
});

test("asciiName 去掉類別前綴與空格", () => {
  assert.equal(asciiName("(MTN) happy.motion3.json"), "happy.motion3.json");
  assert.equal(asciiName("(face) normal.exp3.json"), "normal.exp3.json");
  assert.equal(asciiName("AI-Librarian.8192/texture_00.png"), "textures/texture_00.png");
});

test("asciiName 內部空格改成底線", () => {
  assert.equal(asciiName("(cloth) jacket body.exp3.json"), "jacket_body.exp3.json");
  assert.equal(asciiName("(cloth) neck bknt.exp3.json"), "neck_bknt.exp3.json");
});

test("buildModel3 無 Physics、無 EyeBlink、5 表情、6 動作群組", () => {
  const m = buildModel3();
  assert.equal(m.FileReferences.Physics, undefined);
  assert.deepEqual(m.Groups.map(g => g.Name), ["LipSync"]);
  assert.deepEqual(m.FileReferences.Expressions.map(e => e.Name), EMOTIONS);
  assert.deepEqual(Object.keys(m.FileReferences.Motions), ["Idle", ...EMOTIONS]);
  assert.equal(m.FileReferences.Motions.Idle[0].File, "motions/normal.motion3.json");
  for (const g of ["Idle", ...EMOTIONS]) {
    assert.equal(m.FileReferences.Motions[g][0].FadeInTime, 0.8, `${g} FadeInTime`);
    assert.equal(m.FileReferences.Motions[g][0].FadeOutTime, 0, `${g} FadeOutTime`);
  }
  assert.equal(m.FileReferences.Motions.Idle[0].FadeOutTime, 0);
  assert.equal(m.FileReferences.Motions.happy[0].FadeInTime, 0.8);
  assert.equal(m.FileReferences.Motions.happy[0].FadeOutTime, 0);
});
