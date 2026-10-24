# 首頁改版設計（顏如玉迎賓、兩個入口、中英雙語）

日期：2026-10-18
分支：`feat/yanruyu-live2d`

## 1. 意圖

現在的首頁只有英文標語「Unlock knowledge, powered by AI.」和一顆 Start，第一次來的長者、學生
看不出這是什麼、能做什麼，也不知道有「繪本生成」。改成：顏如玉在首頁迎賓、中文主標 +
英文副標、兩個功能入口、說明一行、字體大小控制。

## 2. 目標 / 非目標

目標
- 顏如玉**靜態圖**在首頁（不載 Live2D，首頁要快）。
- 中文主標「讓 AI 館員陪你找書、聽故事」，英文副標「Unlock knowledge, powered by AI.」。
- 一行說明：「查館藏、介紹書籍，或把你的照片做成一本有聲故事書。」
- 兩個入口卡片：「聊天問答」→ `/librarian`、「繪本生成」→ `/my-story-book`，各有圖示與一行說明。
- 顏如玉旁一個對話泡泡：「您好，我是 AI 館員顏如玉，請選一個功能開始吧。」
- 右上角：主題切換 + 字體 A+/A-（沿用 `FontSizeController` inline 版）。
- 底部一行：「國立政治大學圖檔所 AI Librarian」。
- 深色模式、手機版（上下排列）都要好看；漂浮小點背景保留。
- 圖片載入失敗（例如正式機還沒 rsync）時版面照常，只是沒有人物。

非目標
- 不做首頁動畫、不載 Live2D。
- 不改 Navbar 與其他頁。
- 不做多語切換（只有固定的中文主標 + 英文副標）。

## 3. 顏如玉靜態圖

- 來源：廠商交付 `圖/2026-0930a-(AI-Librarian).png`（3500×5000，透明背景，全身）。
- 輸出：`frontend/public/yanruyu/portrait.png`，高度縮到 1600px（寬約 1120px），保留透明。
  用 macOS 內建 `sips` 產生：
  `sips -Z 1600 "<vendor>/圖/2026-0930a-(AI-Librarian).png" --out frontend/public/yanruyu/portrait.png`
- 放在 `public/yanruyu/` 的原因：該目錄已在 `.gitignore`（廠商素材不進公開 repo），
  正式環境用同一條 `rsync frontend/public/yanruyu/` 部署，不另開管道。
- 圖檔網址常數 `YANRUYU_PORTRAIT_URL = "/yanruyu/portrait.png"` 放進 `components/live2d/yanruyu.ts`。

## 4. 版面

桌機（`md` 以上）兩欄，垂直置中，最大寬 `max-w-6xl`：
- 左欄（約 5/12）：顏如玉全身圖，高度 `min(78vh, 760px)`，底部對齊；圖上方浮一個對話泡泡
  （白底圓角、小尾巴朝人物），文字是 §2 的問候句。
- 右欄（約 7/12）：
  1. 主標 `h1`：「讓 AI 館員陪你找書、聽故事」（`home-title`，粗體，`clamp(1.9rem, 4vw, 3.2rem)`）
  2. 副標：「Unlock knowledge, powered by AI.」（次要色、`ui-sub` 大小）
  3. 說明一行（`msg-text`，跟著 A+/A-）
  4. 兩張入口卡（`card motion-surface`，同一列，手機時上下）：圖示 `MessageCircleMore` / `BookImage`
     + 標題「聊天問答」「繪本生成」+ 說明「問問題、查館藏、介紹書籍」「上傳照片，做成有聲故事書」；
     整張卡是 `button`，`onClick` 導頁；鍵盤可 Tab、Enter。
  5. 底部小字：「國立政治大學圖檔所 AI Librarian」
- 右上角固定：`ThemeToggle` + `FontSizeController variant="inline"`（同 Navbar 的樣式）。
- 手機（`md` 以下）：單欄，順序＝泡泡 + 人物圖（高度 `44vh`）→ 主標 → 副標 → 說明 → 兩張卡 → 底部字；
  整頁可捲動（`home-shell` 的 `height: 100vh; overflow: hidden` 改為 `min-height: 100vh`）。

## 5. 留給實作者

- 泡泡的尾巴用 CSS 偽元素或旋轉的小方塊皆可。
- 深色模式下人物圖不需處理（透明背景），泡泡與卡片沿用現有 theme 變數。
- 入口卡的 hover/focus 樣式沿用 `motion-surface` 與 `theme-button-*` 的既有變數。
