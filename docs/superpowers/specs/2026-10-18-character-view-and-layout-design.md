# 人物顯示（全身/半身）與版面（並排/上下）設計

日期：2026-10-18
分支：`feat/yanruyu-live2d`
前置：`2026-10-18-yanruyu-live2d-integration-design.md`（顏如玉已整合、動作速度已進設定）

## 1. 意圖

老師與學生希望聊天頁的人物可以「只看上半身」，也希望能切成學生 wireframe 的
上下版面：人物置中在上、對話框在下且兩者有部分重疊。討論後定案：重疊時
**對話框在上層、半透明**，人物在底層透出來，文字永遠在不透明的氣泡上。

## 2. 目標 / 非目標 / 反目標

目標
- 設定 A「人物顯示」：`全身`（預設）/ `半身`。
- 設定 B「版面」：`左右並排`（預設）/ `上下`（人物在後、對話框半透明在前）。
- 兩個設定放在 ⚙ 設定的「進階參數」區，跟「角色動作速度」並列；按「儲存並套用」
  後即時生效，存在該使用者瀏覽器的 `aiConfig`（localStorage），不影響其他人；
  第一次打開一律是預設值。
- 切換「人物顯示」不重新載入模型（只重新定位），情緒與動作不中斷。

非目標
- 半身只套用在顏如玉；舊角色（Haru / Poncho / Mia）維持現行全身貼合，不動。
- 重疊深度固定，不提供拖拉。
- wireframe 的「環境導覽」分頁是另一個功能，不在本次範圍。
- 手機版不特別處理（顏如玉在觸控小螢幕本來就停用）。

反目標（做到也算失敗）
- 文字疊在人物衣服上看不清楚。
- 重疊區的推薦問題 / 複製 / 朗讀按鈕點不到。
- 切換人物顯示時模型閃一下、重載、情緒歸零。

## 3. 半身的定義

顏如玉的定位已改成依「實際繪製邊界」(`computeDrawnBounds`) 貼合。半身 = 只貼合邊界
的**上段**：

- `HALF_BODY_FRACTION = 0.6`：可見區高度 = 繪製高度 × 0.6（頭頂到手上的書下緣）。
- 縮放：`scale = min(w*0.9 / contentW, h*0.95 / (contentH*0.6))`。
- 位置：水平置中（同全身），**頂部對齊** —— 邊界 `minY` 貼到畫布 2% 高的位置；
  下半身落在畫布外，自然裁掉。
- 全身維持現行算式（底部貼齊 98%）。

把全身/半身的縮放與位移計算抽成純函式，便於測試：

```ts
type CharacterView = "full" | "half";
type Bounds = { minX; minY; maxX; maxY };
computePlacement(bounds, w, h, view) → { scale, x, y }
```

## 4. 上下版面的定義

- 外層由 `md:grid-cols-3` 改成單欄；人物區在上、對話卡在下，對話卡以**負上邊距**
  往上壓進人物區。
- 固定尺寸（桌機）：人物區高 `60vh`，對話卡高 `70vh`、上邊距 `-30vh`
  → 總高 100vh，不需要捲頁才看得到輸入框。重疊的 30vh 剛好是人物的下半段。
- 對話卡在重疊模式加 `.chat-overlay`：
  - 底色 `rgba(var(--color-bg-card-rgb), 0.82)` + `backdrop-filter: blur(8px)`；
    新增 `--color-bg-card-rgb`（淺色 `255, 255, 255`、深色 `23, 23, 23`）。
  - 助理氣泡在 overlay 內改用 `--color-bg-input`（兩種主題都是不透明色），
    使用者氣泡維持 `--color-accent-soft`（淺色不透明；深色本來就是半透明
    accent，與現行深色外觀一致，不另處理）。
  - 對話卡 `position: relative; z-index: 20`，人物區不設 z-index，
    所以點擊一律落在對話卡上，不需要 pointer-events 處理。
- 人物區右下角的 emotion 小標籤在上下模式改到**左上角**（右下會被對話卡蓋住）。
- 「放大對話區」(isChatExpanded) 時本來就不顯示人物，兩種版面行為相同。
- 上下版面 + 全身：人物腿部在半透明對話卡後面隱約可見（學生 wireframe 的效果）。
  上下版面 + 半身：人物放大、只有腰部以下一小段被蓋住。兩者都允許，不互相強制。

## 5. 設定與持久化

- `aiConfig` 新增 `characterView: "full" | "half"`、`layout: "side" | "stacked"`。
- 讀取時用 `parseCharacterView(unknown)` / `parseLayoutMode(unknown)` 驗證，
  非法值或缺欄位一律回預設（`"full"` / `"side"`）。
- `ConfigDraft` 加同名兩欄；ConfigModal「進階參數」內新增兩組 pill 切換
  （沿用該檔 `previewMode` 切換的按鈕樣式）：
  - 「人物顯示」：`全身` / `半身`
  - 「版面」：`左右並排` / `上下（人物在後）`

## 6. 留給實作者

- `Live2DPanel` 如何在不重建模型的情況下重新 `fit()`（建議：把 `fit` 存進 ref，
  `characterView` 變化時呼叫）。
- 上下版面各高度的 Tailwind 寫法（任意值 class 或 index.css 類別皆可，數值照 §4）。
- 深色模式 overlay 實際透明度微調（0.82 為起點）。
