# 顏如玉 Live2D 角色整合 — 實作計畫

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 讓廠商交付的 Live2D 模型「顏如玉」成為聊天頁預設角色,表情與動作跟著後端情緒切換,模型檔不進 git。

**Architecture:** 一支 Node 腳本把廠商原始檔(repo 外)轉成引擎可直接載入的 `frontend/public/yanruyu/`(改名、合併表情、產生 model3.json);前端新增一個純設定/純函式模組(情緒對照、裝置支援判定),`Live2DPanel` 加顏如玉分支,`Live2DArea` 加退回機制。模型資料用 rsync 同步到正式環境。

**Tech Stack:** React 19 + TypeScript、pixi-live2d-display 0.4.0(cubism4)、pixi.js 6.5.8、Node 22(`node --test`,TS 測試用 `--experimental-strip-types`)

**Spec:** `docs/superpowers/specs/2026-10-18-yanruyu-live2d-integration-design.md`

## Global Constraints

- 模型資料(moc3、貼圖、動作、表情)**不得**進 git,任何分支都不行;`frontend/public/yanruyu/` 進 `.gitignore`
- 執行路徑 `/yanruyu/`,檔名純 ASCII、無空格括號
- 表情淡入淡出 **0 秒**;動作淡入淡出 **0.5 秒**
- 眨眼、呼吸、物理 **關閉**;LipSync 群組保留
- 情緒對照:`neutral→normal`、`happy→happy`、`angry→angry`、`anger→angry`、`sad→sad`、`surprised→happy`;`think` 登記但不觸發;未知情緒忽略;同情緒重複不重觸發
- 回答結束後停留在該情緒,不自動回 normal
- 舊角色(Haru/Poncho/Mia)行為不變;顏如玉為 `index.json` 第一筆
- 退回條件:`MAX_TEXTURE_SIZE < 8192` 或行動裝置(觸控且視窗寬 < 1024,或 `navigator.deviceMemory ≤ 4`);退回 Haru、選單中顏如玉停用並標示「(此裝置不支援)」
- cloth 類表情不合併、不觸發
- Commit 訊息結尾加 `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`

## Review Focus

1. `emotionToken` 為空字串、`null` 或對照表沒有的值(如 `"excited"`)→ 角色維持現狀,不報錯、不回 normal。(Task 4 測試 `mapEmotion` 回傳 `null`;Task 5 分支以 `null` 直接 return)
2. 連續兩題同情緒(happy→happy)→ 不重播動作、不閃爍。(Task 4 測試 `shouldApply` 回 false)
3. WebGL 拿不到 context(`getContext` 回 null)→ 判定為不支援並退回,而非丟例外。(Task 4 測試 `maxTextureSize: null`)
4. 正式環境模型檔尚未 rsync 到位(404)→ 不能整頁白屏卡住。(Task 6 驗證:暫時改名 `yanruyu/` 後開頁面,應仍可切到 Haru,Console 有明確錯誤)
5. 視窗 resize 觸發 `Live2DArea` 重建後,角色必須保持重建前的情緒。(Task 5 驗證步驟 6)

---

## 檔案結構

| 檔案 | 責任 |
|---|---|
| `frontend/scripts/yanruyu/prepare.mjs` | 廠商原始目錄 → `public/yanruyu/`:複製改名、合併表情、產生 model3.json。CLI:`node prepare.mjs <vendor模型目錄> <輸出目錄>` |
| `frontend/scripts/yanruyu/lib.mjs` | 純函式:`mergeExpressions`、`buildModel3`、`asciiName`(被 prepare.mjs 與測試共用) |
| `frontend/scripts/yanruyu/lib.test.mjs` | 上述純函式測試 |
| `frontend/src/components/live2d/yanruyu.ts` | 純設定與純函式:`YANRUYU_PATH`、`mapEmotion`、`shouldApply`、`checkYanruyuSupport` |
| `frontend/src/components/live2d/yanruyu.test.ts` | 上述測試 |
| `frontend/src/components/Live2DPanel.tsx` | 加顏如玉分支;載入後重套最後情緒(所有角色) |
| `frontend/src/components/Live2DArea.tsx` | 退回機制、選單停用標示 |
| `frontend/public/index.json` | 顏如玉放第一筆 |
| `frontend/package.json` | 加 `test` script |
| `.gitignore`(repo 根) | 加 `frontend/public/yanruyu/` |
| `docs/runbook-prod-500-troubleshooting.md` | 加 rsync 部署步驟 |

---

### Task 1: 廠商檔案歸位與 git 隔離

**Files:**
- Create: `/Users/weihsuan/ai-librarian-assets/yanruyu-vendor-20261018/`(repo 外)
- Modify: `.gitignore`(repo 根)
- Delete(本 task 結束時):`frontend/public/顏如玉/`

**Interfaces:**
- Produces: 廠商模型原始檔固定路徑 `/Users/weihsuan/ai-librarian-assets/yanruyu-vendor-20261018/模型/`,供 Task 3 腳本輸入

- [ ] **Step 1: 搬移整包廠商交付到 repo 外**

Run: `mkdir -p /Users/weihsuan/ai-librarian-assets && mv "/Users/weihsuan/ai-librarian/frontend/public/顏如玉" /Users/weihsuan/ai-librarian-assets/yanruyu-vendor-20261018`
Expected: `ls /Users/weihsuan/ai-librarian-assets/yanruyu-vendor-20261018` 列出 `模型/ 圖/ AI-Librarian規格(使用者視角).txt`;`frontend/public/` 下已無 `顏如玉`

- [ ] **Step 2: 加入 .gitignore**

在 repo 根 `.gitignore` 加一行 `frontend/public/yanruyu/`(含註解:廠商授權禁止散布,模型以 rsync 部署)。

- [ ] **Step 3: 驗證 git 看不到模型目錄**

Run: `mkdir -p frontend/public/yanruyu && touch frontend/public/yanruyu/probe.moc3 && git status --short | grep -c yanruyu; rm -r frontend/public/yanruyu`
Expected: `0`

- [ ] **Step 4: Commit**

```bash
git add .gitignore
git commit -m "chore: ignore vendor Live2D model dir (license forbids redistribution)"
```

---

### Task 2: 表情合併與 model3 產生的純函式

**Files:**
- Create: `frontend/scripts/yanruyu/lib.mjs`
- Test: `frontend/scripts/yanruyu/lib.test.mjs`
- Modify: `frontend/package.json`(scripts 加 `"test": "node --test scripts/**/*.test.mjs && node --experimental-strip-types --test src/**/*.test.ts"`)

**Interfaces:**
- Produces:
  - `mergeExpressions(parts: Array<{Parameters: Array<{Id:string, Value:number, Blend:string}>}>): {Type:"Live2D Expression", FadeInTime:0, FadeOutTime:0, Parameters: Array<{Id,Value,Blend:"Add"}>}` — 同 Id 的 Value 相加,輸出依 Id 排序
  - `asciiName(vendorFile: string): string` — `"(MTN) happy.motion3.json"→"happy.motion3.json"`,`"(face) normal.exp3.json"→"normal.exp3.json"`,`"AI-Librarian.8192/texture_00.png"→"textures/texture_00.png"`
  - `buildModel3(): object` — 固定內容,見 Step 3
  - `EMOTIONS = ["normal","happy","angry","sad","think"]`、`VENDOR_EXPRESSION_FILES: Record<emotion, {arm:string, face:string, mouth:string}>`(廠商原始檔名,依 integration_spec:normal→arm normal、happy→arm wave、angry→arm waist、sad→arm back、think→arm think;face/mouth 同名)

- [ ] **Step 1: 寫失敗測試**

```js
// lib.test.mjs (node:test + node:assert/strict)
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
test("asciiName 去掉類別前綴與空格", () => {
  assert.equal(asciiName("(MTN) happy.motion3.json"), "happy.motion3.json");
  assert.equal(asciiName("(face) normal.exp3.json"), "normal.exp3.json");
  assert.equal(asciiName("AI-Librarian.8192/texture_00.png"), "textures/texture_00.png");
});
test("buildModel3 無 Physics、無 EyeBlink、5 表情、6 動作群組", () => {
  const m = buildModel3();
  assert.equal(m.FileReferences.Physics, undefined);
  assert.deepEqual(m.Groups.map(g => g.Name), ["LipSync"]);
  assert.deepEqual(m.FileReferences.Expressions.map(e => e.Name), EMOTIONS);
  assert.deepEqual(Object.keys(m.FileReferences.Motions), ["Idle", ...EMOTIONS]);
  assert.equal(m.FileReferences.Motions.Idle[0].File, "motions/normal.motion3.json");
  assert.equal(m.FileReferences.Motions.happy[0].FadeInTime, 0.5);
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `cd frontend && node --test scripts/yanruyu/lib.test.mjs`
Expected: FAIL,`Cannot find module './lib.mjs'`

- [ ] **Step 3: 實作 `lib.mjs`**

`buildModel3()` 固定輸出:`Version:3`;`FileReferences`:`Moc:"yanruyu.moc3"`、`Textures:["textures/texture_00.png"]`、`DisplayInfo:"yanruyu.cdi3.json"`、`Expressions:[{Name,File:"expressions/<name>.exp3.json"}×5]`、`Motions:{Idle:[{File:"motions/normal.motion3.json",FadeInTime:0.5,FadeOutTime:0.5}], <emotion>:[{File:"motions/<emotion>.motion3.json",FadeInTime:0.5,FadeOutTime:0.5}]×5}`;`Groups:[{Target:"Parameter",Name:"LipSync",Ids:["PARAM_MOUTH_OPEN"]}]`。不含 Physics、不含 EyeBlink。

- [ ] **Step 4: 跑測試確認通過**

Run: `cd frontend && node --test scripts/yanruyu/lib.test.mjs`
Expected: 3 pass

- [ ] **Step 5: Commit**

```bash
git add frontend/scripts/yanruyu/lib.mjs frontend/scripts/yanruyu/lib.test.mjs frontend/package.json
git commit -m "feat(live2d): yanruyu expression merge and model3 builders"
```

---

### Task 3: prepare 腳本產出 `public/yanruyu/`

**Files:**
- Create: `frontend/scripts/yanruyu/prepare.mjs`
- Output(不進 git):`frontend/public/yanruyu/`

**Interfaces:**
- Consumes: Task 2 的 `lib.mjs`;Task 1 的廠商目錄
- Produces: `frontend/public/yanruyu/{yanruyu.model3.json, yanruyu.moc3, yanruyu.cdi3.json, yanruyu.physics3.json, textures/texture_00.png, motions/*.motion3.json ×5, expressions/*.exp3.json ×5, vendor-expressions/{arm,face,mouth,cloth}/*.exp3.json}`

- [ ] **Step 1: 實作 `prepare.mjs`**

`node prepare.mjs <vendor模型目錄> <輸出目錄>`:清空輸出目錄 → 複製 moc3/cdi3/physics3 改名為 `yanruyu.*` → 貼圖到 `textures/` → `MTN/*.motion3.json` 經 `asciiName` 到 `motions/` → 每個情緒讀 `VENDOR_EXPRESSION_FILES` 三檔、`mergeExpressions` 寫到 `expressions/<emotion>.exp3.json` → 廠商 exp3 原檔經 `asciiName` 到 `vendor-expressions/<類別>/` → 寫 `yanruyu.model3.json`。遇到任何輸入檔缺失以非 0 碼結束並印出缺哪個。

- [ ] **Step 2: 執行並檢查產出**

Run: `cd frontend && node scripts/yanruyu/prepare.mjs "/Users/weihsuan/ai-librarian-assets/yanruyu-vendor-20261018/模型" public/yanruyu && find public/yanruyu -type f | sort`
Expected: 共 **35 個檔**:1 model3 + moc3 + cdi3 + physics3 + 1 貼圖 + 5 motions + 5 expressions + 19 vendor-expressions;無中文、空格、括號

- [ ] **Step 3: 檢查合併表情的參數數**

Run: `cd frontend && node -e 'for (const e of ["normal","happy","angry","sad","think"]) { const d=JSON.parse(require("fs").readFileSync(`public/yanruyu/expressions/${e}.exp3.json`)); console.log(e, d.Parameters.length, d.FadeInTime, d.FadeOutTime) }'`
Expected: 每行 fade 皆 `0 0`;參數數 = 該情緒 arm+face+mouth 不重複 Id 數(happy 約 13+8+… 自行以 vendor 檔對照,重疊的眉毛/眼睛只算一次)

- [ ] **Step 4: 確認 git 乾淨**

Run: `git status --short`
Expected: 只有 `frontend/scripts/yanruyu/prepare.mjs`,沒有任何 `public/yanruyu` 項目

- [ ] **Step 5: Commit**

```bash
git add frontend/scripts/yanruyu/prepare.mjs
git commit -m "feat(live2d): prepare script turns vendor Yanruyu files into runtime dir"
```

---

### Task 4: 前端純設定模組 `yanruyu.ts`

**Files:**
- Create: `frontend/src/components/live2d/yanruyu.ts`
- Test: `frontend/src/components/live2d/yanruyu.test.ts`

**Interfaces:**
- Produces:
  - `YANRUYU_PATH = "/yanruyu/"`、`YANRUYU_MODEL_URL = "/yanruyu/yanruyu.model3.json"`、`isYanruyuUrl(url: string): boolean`(小寫比對包含 `/yanruyu/`)
  - `mapEmotion(token: string | null | undefined): YanruyuEmotion | null`(`YanruyuEmotion = "normal"|"happy"|"angry"|"sad"|"think"`)
  - `shouldApply(prev: YanruyuEmotion | null, next: YanruyuEmotion | null): boolean`(next 為 null 或等於 prev → false)
  - `checkYanruyuSupport(env: {maxTextureSize: number | null; isTouch: boolean; innerWidth: number; deviceMemory: number | undefined}): {ok: true} | {ok: false; reason: string}`
  - `readYanruyuEnv(): Parameters<typeof checkYanruyuSupport>[0]`(讀 WebGL `MAX_TEXTURE_SIZE`、`navigator.maxTouchPoints>0`、`window.innerWidth`、`navigator.deviceMemory`;瀏覽器環境專用,不測)

- [ ] **Step 1: 寫失敗測試**

```ts
// yanruyu.test.ts — import from "./yanruyu.ts"
test("mapEmotion 對照表", () => {
  assert.equal(mapEmotion("neutral"), "normal"); assert.equal(mapEmotion("anger"), "angry");
  assert.equal(mapEmotion("surprised"), "happy"); assert.equal(mapEmotion("sad"), "sad");
  assert.equal(mapEmotion("excited"), null); assert.equal(mapEmotion(""), null); assert.equal(mapEmotion(null), null);
});
test("shouldApply 同情緒不重觸發", () => {
  assert.equal(shouldApply("happy", "happy"), false); assert.equal(shouldApply(null, "happy"), true);
  assert.equal(shouldApply("happy", null), false); assert.equal(shouldApply("happy", "sad"), true);
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
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `cd frontend && node --experimental-strip-types --test src/components/live2d/yanruyu.test.ts`
Expected: FAIL,找不到模組

- [ ] **Step 3: 實作 `yanruyu.ts`**

對照表與閾值依 Global Constraints。`reason` 字串用中文,例如 `"貼圖上限 4096 < 8192"`、`"行動裝置(待 4096 貼圖)"`、`"無 WebGL"`。

- [ ] **Step 4: 跑測試與型別檢查**

Run: `cd frontend && node --experimental-strip-types --test src/components/live2d/yanruyu.test.ts && npx tsc -b`
Expected: 3 pass;tsc 無錯誤

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/live2d/yanruyu.ts frontend/src/components/live2d/yanruyu.test.ts
git commit -m "feat(live2d): yanruyu emotion map and device support check"
```

---

### Task 5: `Live2DPanel` 顏如玉分支 + 載入後重套情緒

**Files:**
- Modify: `frontend/src/components/Live2DPanel.tsx`(載入段 ~L125-130;情緒 effect L326-460)

**Interfaces:**
- Consumes: Task 4 的 `isYanruyuUrl`、`mapEmotion`、`shouldApply`
- 引擎 API(pixi-live2d-display 0.4.0 cubism4):`model.expression(name: string)`;`model.motion(group: string, index: number, priority: number)`,FORCE 優先度 = `MotionPriority.FORCE`(從 `pixi-live2d-display/cubism4` 匯入 `MotionPriority`);`model.internalModel.motionManager.groups.idle`(可改寫);`model.internalModel.eyeBlink`、`.breath`(設為 `undefined` 即關閉)

- [ ] **Step 1: 抽出 `applyEmotion(model, token)` 並在載入完成後重套**

把 L326-460 的 effect 主體抽成元件內函式 `applyEmotion(model: any, token: string | null | undefined)`(Poncho 分支、Haru 分支原封不動搬進去);effect 改為呼叫它。新增 `latestEmotionRef = useRef(emotionToken)`,每次 render 同步;在 `mount()` 內 `currentModelRef.current = model` 之後、`fit()` 之前呼叫 `applyEmotion(model, latestEmotionRef.current)`。

- [ ] **Step 2: 加顏如玉分支**

在 `applyEmotion` 開頭(Poncho 判斷之前):
```ts
if (isYanruyuUrl(modelUrl)) {
  const next = mapEmotion(token);
  if (!shouldApply(yanruyuEmotionRef.current, next)) return;
  yanruyuEmotionRef.current = next;       // useRef<YanruyuEmotion|null>(null)
  model.expression(next);
  model.internalModel.motionManager.groups.idle = next;
  model.motion(next, 0, MotionPriority.FORCE);
  return;
}
```
載入段:`isYanruyuUrl(abs)` 為真時,在 `currentModelRef.current = model` 之後設 `model.internalModel.eyeBlink = undefined; model.internalModel.breath = undefined;`。

- [ ] **Step 3: 型別檢查**

Run: `cd frontend && npx tsc -b`
Expected: 無錯誤

- [ ] **Step 4: 本機人工驗證(瀏覽器 `http://localhost:3100/librarian`,先用下拉手動切到顏如玉——Task 6 才會變預設)**

1. 顏如玉顯示完整(不是只有鞋子、不是空白);待機 normal 動作在跑(頭髮飄、肩膀起伏)
2. 觀察 20 秒:**沒有**額外眨眼(動作本身的眨眼頻率約每幾秒一次,若出現連續快速眨眼即為引擎疊加)
3. 問「跟我說個好消息」→ 回答結束時臉/嘴/手臂與動作一起變 happy(揮手)
4. 問「我最近很難過」→ sad(手背後);問「隨便聊聊」→ 多半 neutral → normal
5. 回答結束後等 30 秒,角色維持該情緒
6. 拖動瀏覽器視窗寬度觸發重建 → 重建後角色**仍是**原情緒,右下角 emotion pill 與角色一致
7. Console 無紅字

- [ ] **Step 5: 切到 Haru 再切回**

下拉切 Haru:Haru 的情緒行為如常(TapBody 動作);切回顏如玉:正常載入。

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/Live2DPanel.tsx
git commit -m "feat(live2d): Yanruyu emotion branch; re-apply emotion after model load"
```

---

### Task 6: `Live2DArea` 預設角色、退回機制與選單

**Files:**
- Modify: `frontend/public/index.json`
- Modify: `frontend/src/components/Live2DArea.tsx`(manifest 處理 L52-71;`<select>` L94-104)

**Interfaces:**
- Consumes: Task 4 的 `checkYanruyuSupport`、`readYanruyuEnv`、`isYanruyuUrl`

- [ ] **Step 1: `index.json` 顏如玉放第一筆**

`{ "name": "顏如玉", "url": "/yanruyu/yanruyu.model3.json", "tags": ["客製"] }` 插在最前;其餘三筆不動。

- [ ] **Step 2: 退回機制**

manifest 載入後:`const support = checkYanruyuSupport(readYanruyuEnv())`;若 `!support.ok`:`console.warn("[Live2D] 顏如玉已停用:", support.reason)`,預設角色改取第一個**非**顏如玉的項目。`<option>` 對顏如玉且不支援時加 `disabled` 並把顯示文字改為 `顏如玉(此裝置不支援)`。`support` 以 state 保存供 render 使用。

- [ ] **Step 3: 型別檢查**

Run: `cd frontend && npx tsc -b`
Expected: 無錯誤

- [ ] **Step 4: 桌機驗證**

重新整理 `http://localhost:3100/librarian`:預設即顏如玉;選單第一項為顏如玉且可選。

- [ ] **Step 5: 模擬行動裝置驗證**

瀏覽器切成 mobile 視口(375 寬、觸控)後重新整理:預設顯示 Haru;選單中「顏如玉(此裝置不支援)」為灰色不可選;Console 有 `[Live2D] 顏如玉已停用:` 警告;切回桌機視口重整後恢復。

- [ ] **Step 6: 模型檔缺失驗證(Review Focus 4)**

暫時 `mv frontend/public/yanruyu frontend/public/yanruyu_off`,重整頁面:頁面其餘功能可用、可用下拉切到 Haru、Console 有載入失敗訊息;驗完 `mv` 回來。

- [ ] **Step 7: Commit**

```bash
git add frontend/public/index.json frontend/src/components/Live2DArea.tsx
git commit -m "feat(live2d): Yanruyu as default character with device fallback"
```

---

### Task 7: 部署到正式環境與文件

**Files:**
- Modify: `docs/runbook-prod-500-troubleshooting.md`(架構速覽表加一列;標準部署流程段落加 rsync 步驟)

**Interfaces:**
- Consumes: Task 3 產出的 `frontend/public/yanruyu/`;既有 SSH alias `ai-librarian-prod`

- [ ] **Step 1: runbook 補充**

架構速覽表加:`| 顏如玉模型 | frontend/public/yanruyu/,不在 git;來源為本機 /Users/weihsuan/ai-librarian-assets/,以 rsync 部署 |`。標準部署流程段落加:
```bash
rsync -av --delete /Users/weihsuan/ai-librarian/frontend/public/yanruyu/ ai-librarian-prod:~/ai-librarian/frontend/public/yanruyu/
```
並註明:前端容器以 volume 掛載,rsync 完即生效,不需重建;新 clone 的伺服器若漏掉這步,顏如玉會載入失敗(頁面會退到 Haru)。

- [ ] **Step 2: Commit 文件,推分支,開 PR**

```bash
git add docs/runbook-prod-500-troubleshooting.md
git commit -m "docs: Yanruyu model deployment via rsync"
git push https://github.com/ncculias/ai-librarian.git feat/yanruyu-live2d
gh pr create --repo ncculias/ai-librarian --base main --head feat/yanruyu-live2d --title "顏如玉 Live2D 角色整合" --body "<摘要設計文件 §1、§5.4、§7;結尾加 🤖 Generated with [Claude Code](https://claude.com/claude-code)>"
```

- [ ] **Step 3: 確認 GitHub 上沒有模型資料(Global Constraint)**

Run: `git ls-files | grep -iE "yanruyu.*\.(moc3|png|motion3|exp3)" | wc -l`
Expected: `0`

- [ ] **Step 4: (PR merge 後)標準流程部署程式碼,再 rsync 模型**

```bash
ssh ai-librarian-prod 'cd ~/ai-librarian && git fetch https://github.com/ncculias/ai-librarian.git main && git switch -c prod-$(date +%Y%m%d) FETCH_HEAD && docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build'
rsync -av --delete /Users/weihsuan/ai-librarian/frontend/public/yanruyu/ ai-librarian-prod:~/ai-librarian/frontend/public/yanruyu/
```

- [ ] **Step 5: 正式環境驗證**

`curl -s -o /dev/null -w "%{http_code}" https://ai-librarian-ai.com/yanruyu/yanruyu.model3.json` → `200`;`https://ai-librarian-ai.com/yanruyu/vendor-expressions/` 下無 PSD/圖/規格(只能有 exp3);瀏覽器開 `https://ai-librarian-ai.com/librarian` 重跑 Task 5 Step 4 的 1–3、7 項。
