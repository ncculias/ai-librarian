import { test } from "node:test";
import assert from "node:assert/strict";
import { parseMarkdownBlocks } from "./markdownBlocks.ts";

test("標題行獨立成 heading 區塊，即使前面沒有空行", () => {
  const blocks = parseMarkdownBlocks("前言\n### 書名\n《底層邏輯》\n## 作者\n劉潤");
  assert.deepEqual(blocks, [
    { type: "paragraph", lines: ["前言"] },
    { type: "heading", level: 3, text: "書名" },
    { type: "paragraph", lines: ["《底層邏輯》"] },
    { type: "heading", level: 2, text: "作者" },
    { type: "paragraph", lines: ["劉潤"] },
  ]);
});

test("條列行可以直接接在文字後面（不用空行）", () => {
  const blocks = parseMarkdownBlocks("這本書主要在談：\n- 分辨事實\n- 用假設思考\n結語");
  assert.deepEqual(blocks, [
    { type: "paragraph", lines: ["這本書主要在談："] },
    { type: "list", ordered: false, items: ["分辨事實", "用假設思考"] },
    { type: "paragraph", lines: ["結語"] },
  ]);
});

test("有序清單與無序清單分開，切換標記就換區塊", () => {
  const blocks = parseMarkdownBlocks("1. 一\n2. 二\n- 三");
  assert.deepEqual(blocks, [
    { type: "list", ordered: true, items: ["一", "二"] },
    { type: "list", ordered: false, items: ["三"] },
  ]);
});

test("空行分段；多個空行與首尾空白不產生空區塊", () => {
  const blocks = parseMarkdownBlocks("\n\n第一段\n第二行\n\n\n第二段  \n\n");
  assert.deepEqual(blocks, [
    { type: "paragraph", lines: ["第一段", "第二行"] },
    { type: "paragraph", lines: ["第二段"] },
  ]);
});

test("標題層級超過 3 一律當 3；# 後沒有空格不是標題", () => {
  const blocks = parseMarkdownBlocks("##### 深層\n#tag 不是標題");
  assert.deepEqual(blocks, [
    { type: "heading", level: 3, text: "深層" },
    { type: "paragraph", lines: ["#tag 不是標題"] },
  ]);
});

test("空字串回空陣列", () => {
  assert.deepEqual(parseMarkdownBlocks(""), []);
});
