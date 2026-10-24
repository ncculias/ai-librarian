# 人物顯示（全身/半身）與版面（並排/上下）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 兩個使用者設定——「人物顯示：全身/半身」與「版面：左右並排/上下（人物在後、對話框半透明在前）」——放進 ⚙ 進階參數、存 localStorage、即時生效。

**Architecture:** 純計算（半身縮放/位移、設定值驗證）抽到 `src/components/live2d/display.ts` 並用 node test 鎖住；`Live2DPanel` 的 `fit()` 改呼叫 `computePlacement`，並在 `characterView` 改變時只重新 fit、不重建模型；`Librarian.tsx` 以 `layout` 切換外層 grid 與對話卡的 class，上下版面用負上邊距讓對話卡（`.chat-overlay`，半透明 + 背景模糊、z-index 20）壓在人物區上。

**Tech Stack:** React 19 + TypeScript、Tailwind、pixi-live2d-display 0.4；測試 `node --experimental-strip-types --test`。

**Spec:** `docs/superpowers/specs/2026-10-18-character-view-and-layout-design.md`

## Global Constraints

- 預設值：`characterView = "full"`、`layout = "side"`；localStorage 缺欄位或非法值一律回預設。
- `HALF_BODY_FRACTION = 0.6`；半身 = 頂部對齊（`minY` 貼畫布 2%），全身 = 底部對齊（`maxY` 貼畫布 98%）；寬度限制 `w*0.9`、高度限制 `h*0.95`，與現行一致。
- 半身只套用顏如玉；非顏如玉分支的定位程式碼一行都不改。
- 切換 `characterView` 不得重建 PIXI app / 重載模型（`Live2DArea` 的 `key` 不含 `characterView`）。
- 上下版面尺寸：人物區 `60vh`、對話卡 `70vh`、對話卡 `margin-top: -30vh`；對話卡 `z-index: 20`。
- overlay 底色 `rgba(var(--color-bg-card-rgb), 0.82)` + `backdrop-filter: blur(8px)`；`--color-bg-card-rgb` 淺色 `255, 255, 255`、深色 `23, 23, 23`；overlay 內 `.message-bubble-assistant` 底色 `var(--color-bg-input)`。
- 設定文案：「人物顯示」選項 `全身` / `半身`；「版面」選項 `左右並排` / `上下（人物在後）`。
- 每個任務結尾 `cd frontend && npx tsc -b && npm test` 必須乾淨。
- 瀏覽器驗證網址 `http://localhost:3100/librarian`（Docker dev server 熱更新；改 CSS 若沒生效先 `touch` 該檔）。

## Review Focus

1. `aiConfig` 裡 `layout: "stacked"` 但 `characterView` 缺欄位（舊版存檔）→ 頁面必須正常載入、人物全身、版面上下。（Task 1 測 `parseCharacterView(undefined)`；Task 2 瀏覽器驗證）
2. `computeDrawnBounds` 回 `null`（算不出邊界）時選半身 → 必須安全退回現行畫布矩形定位，不得丟例外。（Task 3 步驟 3 的 fallback 分支）
3. 容器寬度極窄（上下版面人物區變寬變矮、或視窗縮小）時半身不得算出負數或 0 縮放。（Task 1 測 `w=1,h=1` 仍回正數 scale）
4. 深色模式下的 overlay：對話卡不得變成純白，助理氣泡文字不得透出人物。（Task 4 瀏覽器深色驗證）
5. 上下版面時重疊區的推薦問題按鈕、複製、朗讀必須可點。（Task 4 瀏覽器驗證：點推薦問題成功送出）

---

### Task 1: `display.ts` 純函式模組

**Files:**
- Create: `frontend/src/components/live2d/display.ts`
- Test: `frontend/src/components/live2d/display.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type CharacterView = "full" | "half";
  export type LayoutMode = "side" | "stacked";
  export const DEFAULT_CHARACTER_VIEW: CharacterView; // "full"
  export const DEFAULT_LAYOUT_MODE: LayoutMode;       // "side"
  export const HALF_BODY_FRACTION: number;            // 0.6
  export function parseCharacterView(v: unknown): CharacterView;
  export function parseLayoutMode(v: unknown): LayoutMode;
  export type Bounds = { minX: number; minY: number; maxX: number; maxY: number };
  export type Placement = { scale: number; x: number; y: number };
  export function computePlacement(b: Bounds, w: number, h: number, view: CharacterView): Placement;
  ```
  `x`/`y` 是 `model.position`（anchor/pivot 皆 0，與 `Live2DPanel.tsx:259-262` 現行用法相同）。

- [ ] **Step 1: 寫失敗測試**（檔頭與 `yanruyu.test.ts` 相同：`node:test` + `node:assert/strict`，import 加 `.ts`）

```ts
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
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `cd frontend && node --experimental-strip-types --test src/components/live2d/display.test.ts`
Expected: FAIL（module not found）

- [ ] **Step 3: 實作 `display.ts`**

`parse*` 用字面值比對（嚴格等於），其餘回預設。`computePlacement` 照 Global Constraints 的算式；`scale` 若不是 `> 0` 的有限數就回 `0.5`（與 `Live2DPanel.tsx:261` 的保底相同）。檔頭加一行說明：純函式、不碰 DOM。

- [ ] **Step 4: 跑測試確認通過**

Run: 同 Step 2。Expected: 4 tests pass。再跑 `cd frontend && npm test` 確認原有測試也過。

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/live2d/display.ts frontend/src/components/live2d/display.test.ts
git commit -m "feat(live2d): display helpers for character view and layout settings"
```

---

### Task 2: 設定 UI 與持久化（Librarian + ConfigModal）

**Files:**
- Modify: `frontend/src/components/ConfigModal.tsx:50-57`（`ConfigDraft`）、`:428-444`（進階參數區，動作速度滑桿之後）
- Modify: `frontend/src/pages/Librarian.tsx:140`（state）、`:181-214`（`applySettings`）、`:216-239`（讀取 aiConfig）、`:463-470`（Live2DArea props）、`:675-682`（ConfigModal initial）
- Modify: `frontend/src/components/Live2DArea.tsx:15-21, 29-35, 120-133`（接收並轉交 props）
- Modify: `frontend/src/components/Live2DPanel.tsx:12-19`（接收 prop，本任務先不使用）

**Interfaces:**
- Consumes: Task 1 的 `CharacterView`、`LayoutMode`、`DEFAULT_*`、`parseCharacterView`、`parseLayoutMode`。
- Produces:
  - `ConfigDraft` 新增 `characterView: CharacterView; layout: LayoutMode;`
  - `Live2DArea` props 新增 `characterView?: CharacterView; layout?: LayoutMode;`（預設 `DEFAULT_*`），`characterView` 轉交 `Live2DPanel`。
  - `Live2DPanel` props 新增 `characterView?: CharacterView;`（預設 `"full"`；Task 3 才使用）。
  - `Librarian.tsx` 持有 `characterView` / `layout` state（Task 4 使用 `layout`）。

- [ ] **Step 1: `ConfigDraft` 加兩欄；進階參數區在動作速度滑桿後面加兩組 pill 切換**

每組：`<label>` 文案（「人物顯示」/「版面」）+ 兩顆按鈕，按鈕 class 複製 `ConfigModal.tsx:351-356` 的 `previewMode` 樣式（選中：`border-[var(--color-accent-strong)] bg-[var(--color-accent-soft)] text-[var(--color-accent-text)]`）。選項文案照 Global Constraints。`onClick` 只改 `draft`，不呼叫 `onApply`。

- [ ] **Step 2: `Librarian.tsx` 接線**

- `useState<CharacterView>(DEFAULT_CHARACTER_VIEW)`、`useState<LayoutMode>(DEFAULT_LAYOUT_MODE)`。
- `applySettings` 的 draft 型別加兩欄；寫入 state 與 `aiConfig` JSON（key 名 `characterView`、`layout`）。
- 讀取 aiConfig：`setCharacterView(parseCharacterView(saved.characterView))`、`setLayout(parseLayoutMode(saved.layout))`（不要用 `typeof === "string"` 守門，parse 已處理）。
- `ConfigModal initial` 與 `<Live2DArea>` 各傳入兩個值。

- [ ] **Step 3: `Live2DArea` / `Live2DPanel` 接收 props**

`Live2DArea` 的 Props 型別加兩欄，但本任務**只解構 `characterView`**（預設 `DEFAULT_CHARACTER_VIEW`）並傳給 `<Live2DPanel>`；`layout` 留在型別裡不解構（tsconfig 開了 `noUnusedLocals`/`noUnusedParameters`，未使用的解構會讓 `tsc -b` 失敗），Task 4 才解構使用。`Live2DPanel` 同理：Props 加 `characterView?: CharacterView;`，本任務不解構，Task 3 再用。

- [ ] **Step 4: 型別檢查與測試**

Run: `cd frontend && npx tsc -b && npm test`。Expected: 無錯誤、tests pass。

- [ ] **Step 5: 瀏覽器驗證**

開 `http://localhost:3100/librarian` → ⚙ → 展開「進階參數」：看到「人物顯示」「版面」兩組；選「半身」+「上下（人物在後）」→ 儲存並套用 → toast「設定已保存並套用」；DevTools `localStorage.aiConfig` 含 `"characterView":"half","layout":"stacked"`；重新整理後再開設定，兩組仍是剛才的選擇。手動把 `aiConfig.layout` 改成 `"xx"` 再重整 → 設定顯示「左右並排」（Review Focus 1）。

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/ConfigModal.tsx frontend/src/pages/Librarian.tsx frontend/src/components/Live2DArea.tsx frontend/src/components/Live2DPanel.tsx
git commit -m "feat(settings): character view and layout options in advanced settings (persisted)"
```

---

### Task 3: 半身顯示（Live2DPanel）

**Files:**
- Modify: `frontend/src/components/Live2DPanel.tsx:133-135`（ref 模式）、`:236-272`（`fit`）、`:148-160` 附近新增 effect

**Interfaces:**
- Consumes: Task 1 `computePlacement`、`Bounds`；Task 2 的 `characterView` prop。
- Produces: 無新介面。

- [ ] **Step 1: `fit()` 的顏如玉分支改用 `computePlacement`**

`Live2DPanel.tsx:253-262` 內：`const p = computePlacement(yanruyuBounds, w, h, characterViewRef.current); model.scale.set(p.scale); model.position.set(p.x, p.y);`，保留 `anchor/pivot` 設 0 的兩行。`yanruyuBounds` 為 `null` 的 fallback 分支（`:263-267`）**不改**（Review Focus 2）。

- [ ] **Step 2: `characterView` 走 ref + 變更時只重新 fit**

仿 `motionSpeedRef`：`const characterViewRef = useRef(characterView); characterViewRef.current = characterView;`。新增 `const fitRef = useRef<(() => void) | null>(null);`，在定義 `fit` 後 `fitRef.current = fit;`，effect cleanup 時設回 `null`。新增：

```ts
useEffect(() => {
  fitRef.current?.();
}, [characterView]);
```

主 effect 的依賴陣列**不加** `characterView`（否則會重建模型，違反 Global Constraints）。

- [ ] **Step 3: 型別檢查與測試**

Run: `cd frontend && npx tsc -b && npm test`。Expected: 乾淨。

- [ ] **Step 4: 瀏覽器驗證**

`http://localhost:3100/librarian`，版面維持「左右並排」：
1. 設定選「半身」→ 儲存：人物立刻放大、只看到頭到手上的書，**沒有**閃黑/重載（觀察右下 emotion 標籤與動作連續）。
2. 送一句「我今天心情不好」→ 情緒切換、手臂動作在半身仍可見。
3. 切回「全身」→ 立刻恢復原本貼合。
4. 切到 Haru：全身/半身皆不受影響（舊角色不變）。
5. 若 0.6 切在手或書的中間，調整 `HALF_BODY_FRACTION` 到 0.55–0.65 之間並同步 Task 1 測試常數（測試用符號常數，不需改數字），在 commit 訊息註明最終值。

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/Live2DPanel.tsx frontend/src/components/live2d/display.ts
git commit -m "feat(live2d): half-body view for 顏如玉 (re-fit without model reload)"
```

---

### Task 4: 上下版面（人物在後、對話卡半透明在前）

**Files:**
- Modify: `frontend/src/index.css:6-29`（`:root` 加 `--color-bg-card-rgb`）、`:31-52`（dark 加同名）、`:335-339` 之後新增 `.chat-overlay` 規則
- Modify: `frontend/src/pages/Librarian.tsx:461-478`（外層 grid 與對話卡 class）
- Modify: `frontend/src/components/Live2DArea.tsx:121, 153`（人物區高度 / col-span、emotion 標籤位置）

**Interfaces:**
- Consumes: Task 2 的 `layout` state（Librarian）與 `layout` prop（Live2DArea）。
- Produces: CSS 類 `.chat-overlay`、`.layout-stacked-stage`、`.layout-stacked-chat`。

- [ ] **Step 1: CSS**

```css
/* 上下版面：對話卡壓在人物區上，半透明透出人物，氣泡維持不透明 */
.layout-stacked-stage { height: 60vh; }
.layout-stacked-chat { height: 70vh; margin-top: -30vh; position: relative; z-index: 20; }
.chat-overlay {
  background-color: rgba(var(--color-bg-card-rgb), 0.82);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
}
.chat-overlay .message-bubble-assistant { background-color: var(--color-bg-input); }
```

`:root` 加 `--color-bg-card-rgb: 255, 255, 255;`，`:root[data-theme="dark"]` 加 `--color-bg-card-rgb: 23, 23, 23;`。

- [ ] **Step 2: `Librarian.tsx` 版面切換**

- 外層 `div`（`:461`）：`layout === "stacked"` 時用 `grid-cols-1`（移除 `md:grid-cols-3`），並把 `gap` 設 0（負邊距才能準確壓上去；工具列表那塊若需要間距，在其自身加 `mt-6`）。
- 對話卡 `section`（`:472-478`）：`!isChatExpanded && layout === "stacked"` 時 class 改為 `card motion-surface flex flex-col p-4 sm:p-6 layout-stacked-chat chat-overlay`（不帶 `h-[80vh] md:col-span-2`）；其他情況維持現狀。
- `isChatExpanded` 時維持現行（不顯示人物、`md:col-span-3`），與 layout 無關。

- [ ] **Step 3: `Live2DArea.tsx`**

- `section` class：`layout === "stacked"` 時 `card p-6 relative layout-stacked-stage`（不帶 `md:col-span-1 h-[80vh]`）。
- emotion 標籤容器（`:153`）：stacked 時 `absolute top-2 left-2 z-10`，否則維持 `bottom-2 right-2`。

- [ ] **Step 4: 型別檢查與測試**

Run: `cd frontend && npx tsc -b && npm test`。Expected: 乾淨。

- [ ] **Step 5: 瀏覽器驗證**（CSS 沒生效先 `touch frontend/src/index.css`）

1. 設定選「上下（人物在後）」+「全身」→ 儲存：人物置中在上、對話卡壓在人物下半段、腿部透過半透明卡隱約可見；輸入框不需捲頁即可看到；emotion 標籤在人物區左上。
2. 點推薦問題「請幫我查詢今天台北的天氣及日期」→ 正常送出、回覆出現；助理氣泡底色不透明、文字清楚（Review Focus 5）。
3. 切深色模式：對話卡為深色半透明、不是白板；氣泡不透出人物（Review Focus 4）。
4. 改「半身」：人物放大、對話卡只蓋到腰以下一小段。
5. 「放大對話區」→ 人物消失、對話卡吃滿；還原後回到上下版面。
6. 切回「左右並排」→ 與改動前完全相同（截圖比對 `Live2DArea` 位置與對話卡高度）。

- [ ] **Step 6: Commit**

```bash
git add frontend/src/index.css frontend/src/pages/Librarian.tsx frontend/src/components/Live2DArea.tsx
git commit -m "feat(layout): stacked layout with translucent chat card over the character"
```
