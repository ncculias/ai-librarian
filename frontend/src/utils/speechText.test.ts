import { test } from "node:test";
import assert from "node:assert/strict";
import { SPEECH_CHUNK_MAX, SPEECH_PREFETCH_AHEAD, splitForSpeech, stripMarkdownForSpeech } from "./speechText.ts";

test("stripMarkdownForSpeech 拿掉粗體、標題、條列、連結與網址", () => {
  const md =
    "### 書名\n**書名**：《底層邏輯》\n- 先看[本質](https://example.com/a)\n1. 用假設思考\n參考 https://example.com/b 與 <https://example.com/c>\n`code`";
  assert.equal(
    stripMarkdownForSpeech(md),
    "書名\n書名：《底層邏輯》\n先看本質\n用假設思考\n參考 與\ncode",
  );
});

test("splitForSpeech 依段落與句子切段，每段不超過上限", () => {
  const text = "第一句。第二句！第三句？\n\n第二段只有一句。";
  assert.deepEqual(splitForSpeech(text, 10), ["第一句。第二句！", "第三句？", "第二段只有一句。"]);
});

test("splitForSpeech 段落結束一定斷段，短段落不會合併", () => {
  assert.deepEqual(splitForSpeech("甲。\n乙。"), ["甲。", "乙。"]);
});

test("splitForSpeech 超長句依逗號再切", () => {
  const long = "一二三四五六，七八九十，十一十二。";
  assert.deepEqual(splitForSpeech(long, 8), ["一二三四五六，", "七八九十，", "十一十二。"]);
});

test("splitForSpeech 空白輸入回空陣列；預設上限為常數", () => {
  assert.deepEqual(splitForSpeech("  \n\n "), []);
  assert.ok(Number.isInteger(SPEECH_PREFETCH_AHEAD) && SPEECH_PREFETCH_AHEAD >= 1);
  const many = Array.from({ length: 40 }, (_, i) => `這是第${i}句。`).join("");
  for (const c of splitForSpeech(many)) assert.ok(c.length <= SPEECH_CHUNK_MAX);
});
