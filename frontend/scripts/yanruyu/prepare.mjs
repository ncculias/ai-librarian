#!/usr/bin/env node
// 把廠商原始 Live2D 模型目錄轉成執行期目錄(全 ASCII 檔名)。
// 用法: node prepare.mjs <廠商模型目錄> <輸出目錄>
// 只做檔案 I/O 與流程編排,邏輯都在 lib.mjs。

import fs from "node:fs";
import path from "node:path";
import { EMOTIONS, VENDOR_EXPRESSION_FILES, mergeExpressions, asciiName, buildModel3 } from "./lib.mjs";

const VENDOR_PREFIX = "AI-Librarian";
const EXPRESSION_CATEGORIES = ["arm", "face", "mouth", "cloth"];

const [vendorDir, outDir] = process.argv.slice(2);
if (!vendorDir || !outDir) {
  console.error("用法: node prepare.mjs <廠商模型目錄> <輸出目錄>");
  process.exit(2);
}

function fail(message) {
  console.error(`錯誤: ${message}`);
  process.exit(1);
}

function vendorPath(rel) {
  const p = path.join(vendorDir, rel);
  if (!fs.existsSync(p)) fail(`缺少輸入檔: ${p}`);
  return p;
}

// 輸出檔名保證沒有空格(asciiName 只處理 "(類別) " 前綴與貼圖資料夾)
function outputName(vendorFile) {
  return asciiName(path.basename(vendorFile)).replace(/ /g, "_");
}

function writeOut(rel, content) {
  const p = path.join(outDir, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, content);
}

function copyOut(srcRel, destRel) {
  const dest = path.join(outDir, destRel);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(vendorPath(srcRel), dest);
}

function writeJson(rel, obj) {
  writeOut(rel, JSON.stringify(obj, null, 2) + "\n");
}

function readJson(rel) {
  const p = vendorPath(rel);
  try {
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch (err) {
    fail(`JSON 解析失敗: ${p} (${err.message})`);
  }
}

if (!fs.existsSync(vendorDir) || !fs.statSync(vendorDir).isDirectory()) {
  fail(`廠商模型目錄不存在: ${vendorDir}`);
}

// 先檢查所有輸入都在,再清空輸出目錄,避免失敗時留下半成品
const motionSources = EMOTIONS.map((e) => `MTN/(MTN) ${e}.motion3.json`);
const expressionSources = Object.values(VENDOR_EXPRESSION_FILES).flatMap((o) => Object.values(o));
const clothSources = fs.existsSync(path.join(vendorDir, "cloth"))
  ? fs.readdirSync(path.join(vendorDir, "cloth")).filter((f) => f.endsWith(".exp3.json")).map((f) => `cloth/${f}`)
  : [];
const requiredInputs = [
  `${VENDOR_PREFIX}.moc3`,
  `${VENDOR_PREFIX}.cdi3.json`,
  `${VENDOR_PREFIX}.physics3.json`,
  `${VENDOR_PREFIX}.8192/texture_00.png`,
  ...motionSources,
  ...expressionSources,
];
for (const rel of requiredInputs) vendorPath(rel);
if (clothSources.length === 0) fail(`缺少輸入檔: ${path.join(vendorDir, "cloth")}/*.exp3.json`);

fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });

// 核心檔
copyOut(`${VENDOR_PREFIX}.moc3`, "yanruyu.moc3");
copyOut(`${VENDOR_PREFIX}.cdi3.json`, "yanruyu.cdi3.json");
copyOut(`${VENDOR_PREFIX}.physics3.json`, "yanruyu.physics3.json");
copyOut(`${VENDOR_PREFIX}.8192/texture_00.png`, asciiName(`${VENDOR_PREFIX}.8192/texture_00.png`));

// 動作
for (const rel of motionSources) copyOut(rel, `motions/${outputName(rel)}`);

// 合併表情:每個情緒的 arm + face + mouth 合成一個 exp3
for (const emotion of EMOTIONS) {
  const { arm, face, mouth } = VENDOR_EXPRESSION_FILES[emotion];
  writeJson(`expressions/${emotion}.exp3.json`, mergeExpressions([arm, face, mouth].map(readJson)));
}

// 廠商原始表情檔(含 cloth,僅保留不合併)
for (const rel of [...expressionSources, ...clothSources]) {
  const category = rel.split("/")[0];
  if (!EXPRESSION_CATEGORIES.includes(category)) fail(`未知的表情類別: ${rel}`);
  copyOut(rel, `vendor-expressions/${category}/${outputName(rel)}`);
}

writeJson("yanruyu.model3.json", buildModel3());

console.log(`完成: ${vendorDir} -> ${outDir}`);
