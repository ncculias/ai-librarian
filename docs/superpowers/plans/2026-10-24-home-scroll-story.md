# 首頁捲動敘事 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把首頁 `/` 改成四段可捲動的敘事頁：大字開場 → 顏如玉釘住介紹三個功能 → 照片變故事書 → 索引式入口，深色／手機／A+/A-／鍵盤／減少動態都可用。

**Architecture:** `Home.tsx` 改成組合四個區塊元件（`components/home/`），捲動驅動只靠兩個小 hook（`useScrollProgress` 算釘住區塊的進度、`useInView` 做進入視窗浮現）＋ CSS；文案與三個入口集中在 `homeContent.ts`（純資料＋純函式，可單元測試）。人物為靜態圖 `/yanruyu/portrait.png`（gitignored、rsync 部署），缺檔時第二段自動改成無人物版面。首頁改為也顯示 `Navbar`。無新依賴、無後端變更。

**Tech Stack:** React 19 + TypeScript + Tailwind v4 + react-router；Google Fonts「Noto Serif TC」；`node --test` 跑純函式測試；瀏覽器驗證（Docker 前端 `http://127.0.0.1:3100/`）。

**Spec:** `docs/superpowers/specs/2026-10-24-home-scroll-story-design.md`（文案與動態數值以 spec §3–§4 為準，本文不重抄）

## Global Constraints

- 文案一字不改，全部從 spec §3 複製；路由固定：聊天問答 `/librarian`、書籍介紹 `/book-guide`、繪本生成 `/my-story-book`。
- 不新增 npm 依賴；動態只用 scroll 事件（`passive`、rAF 節流）、IntersectionObserver、CSS animation/transition。
- `@media (prefers-reduced-motion: reduce)` 下所有 animation/transition 關閉，功能不變。
- 顏色只用 `index.css` 既有 theme 變數；唯一例外黃色標籤 `#facc15` + `#111` 字。
- 說明文字用既有 `msg-text` / `msg-text-sm`；標題字體類別 `home-serif`（`"Noto Serif TC", "Songti TC", serif`）。
- `frontend/public/yanruyu/` 已 gitignore，`portrait.png` 絕不 commit；圖缺檔時不能有破圖。
- tsconfig `noUnusedLocals` / `noUnusedParameters` / `verbatimModuleSyntax`；註解寫中文；每個 task 結束 `cd frontend && npx tsc -b && npm test` 乾淨。
- Vite 在 macOS bind mount 看不到**新建**檔案：新增檔案後若 404，`docker restart ai-librarian-frontend`。
- 每個 commit 訊息結尾加 `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`。

## Review Focus

1. `portrait.png` 404（正式機未 rsync）→ 第二段只剩三個標註置中、無破圖、計數照常。（Task 4 驗證 4）
2. 手機 375px → 四段皆單欄、第二段不釘住、整頁可捲、三行入口可點。（Task 5 驗證 3）
3. `prefers-reduced-motion` → 無動畫但捲到第二段三個標註全部直接可見、入口可用。（Task 5 驗證 6）
4. 鍵盤：Tab 依序到 Navbar → 第二段三個「進入 →」連結 → 第四段三行；Enter 導頁。（Task 5 驗證 5）
5. A+ 兩次 → 說明文字放大、大字不跟著爆版、版面不破。（Task 5 驗證 7）

---

### Task 1: 人物靜態圖 + 常數 + 字體

**Files:**
- Create (gitignored, 不 commit): `frontend/public/yanruyu/portrait.png`
- Modify: `frontend/src/components/live2d/yanruyu.ts`（`YANRUYU_MODEL_URL` 旁新增常數）
- Modify: `frontend/src/components/live2d/yanruyu.test.ts`（常數斷言）
- Modify: `frontend/index.html`（Google Fonts）

**Interfaces:**
- Produces: `export const YANRUYU_PORTRAIT_URL = "/yanruyu/portrait.png";`

- [ ] **Step 1: 產圖**

```bash
sips -Z 1600 "/Users/weihsuan/ai-librarian-assets/yanruyu-vendor-20261018/圖/2026-0930a-(AI-Librarian).png" --out /Users/weihsuan/ai-librarian/frontend/public/yanruyu/portrait.png
sips -g pixelWidth -g pixelHeight /Users/weihsuan/ai-librarian/frontend/public/yanruyu/portrait.png
```
Expected: 高 1600；`git status` 看不到該檔。

- [ ] **Step 2: 測試先失敗**

`yanruyu.test.ts` 加：`assert.equal(YANRUYU_PORTRAIT_URL, "/yanruyu/portrait.png");`（import 一併加）。
Run: `cd frontend && npm test` → FAIL（常數不存在）。

- [ ] **Step 3: 常數 + 字體**

`yanruyu.ts`：`export const YANRUYU_PORTRAIT_URL = "/yanruyu/portrait.png"; // 首頁靜態迎賓圖（廠商 PNG 縮圖，與模型同目錄、rsync 部署）`
`index.html` `<head>` 加：
```html
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Noto+Serif+TC:wght@700;900&display=swap" rel="stylesheet" />
```

- [ ] **Step 4: 驗證**

Run: `cd frontend && npx tsc -b && npm test` → 乾淨。瀏覽器開 `http://127.0.0.1:3100/yanruyu/portrait.png` 看得到人物（404 就 `docker restart ai-librarian-frontend`）。

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/live2d/yanruyu.ts frontend/src/components/live2d/yanruyu.test.ts frontend/index.html
git commit -m "feat(home): portrait url constant and serif webfont for the landing page"
```

---

### Task 2: 內容模組與捲動 hook（純邏輯、可測）

**Files:**
- Create: `frontend/src/components/home/homeContent.ts`
- Create: `frontend/src/components/home/homeContent.test.ts`
- Create: `frontend/src/hooks/useScrollProgress.ts`
- Create: `frontend/src/hooks/useInView.ts`
- Create: `frontend/src/hooks/usePrefersReducedMotion.ts`

**Interfaces:**
- Produces（`homeContent.ts`）:
  - `export type HomeEntry = { key: "chat" | "book-guide" | "story-book"; no: "01" | "02" | "03"; title: string; short: string; long: string; go: string; to: "/librarian" | "/book-guide" | "/my-story-book" }`
  - `export const HOME_ENTRIES: readonly HomeEntry[]`（三筆，文案照 spec §3：`title` 標題、`short` 第四段一句、`long` 第二段整句、`go` 「進入○○ →」）
  - `export const HERO = { lines: ["圖書館", "AI 館員", "顏如玉"], headline, tagline, desc, badge: { big: "24 小時都在", small: "問問題、查館藏、聽故事" }, hint: "往下捲 ↓" } as const`
  - `export const STORY = { lines: ["把照片", "變成", "一本故事書"], polaroids: ["初秋的清晨", "珍貴的瞬間", "心中的回憶"], headline: "約 20 秒，一本有聲故事書", desc: "照片先在你的裝置上縮圖，再由 AI 看圖寫故事、真人語音朗讀。" } as const`
  - `export const INDEX_HEAD = { eyebrow: "Start here", title: "想從哪裡開始？", lead: "三個功能，點一行就進去。不確定的話，先從聊天問答開始。" } as const`
  - `export const STAGE_STEPS = [0.12, 0.42, 0.72] as const`
  - `export function stepFromProgress(p: number): 0 | 1 | 2 | 3`（p<0.12→0，<0.42→1，<0.72→2，否則 3；NaN／負值→0，>1→3）
  - `export const STAGE_POSES = ["translateX(0) scale(1)", "translateX(14vw) scale(1.04)", "translateX(-14vw) scale(1.04)", "translateX(12vw) scale(1.02)"] as const`
- Produces（hooks）:
  - `export function useScrollProgress(ref: RefObject<HTMLElement | null>): number` — 0..1，`(-rect.top) / (el.offsetHeight - innerHeight)`，clamp；scroll/resize 以 rAF 節流；元素高 ≤ 視窗時回 0。
  - `export function useInView<T extends HTMLElement>(threshold = 0.25): [RefObject<T | null>, boolean]` — 進入一次後保持 true。
  - `export function usePrefersReducedMotion(): boolean` — `matchMedia("(prefers-reduced-motion: reduce)")`，跟著變動。

- [ ] **Step 1: 測試先失敗（`homeContent.test.ts`）**

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { HOME_ENTRIES, STAGE_STEPS, stepFromProgress } from "./homeContent.ts";

test("三個入口的路由與頁首分頁一致", () => {
  assert.deepEqual(HOME_ENTRIES.map((e) => e.to), ["/librarian", "/book-guide", "/my-story-book"]);
  assert.deepEqual(HOME_ENTRIES.map((e) => e.no), ["01", "02", "03"]);
  for (const e of HOME_ENTRIES) {
    assert.ok(e.title && e.short && e.long);
    assert.equal(e.go, `進入${e.title} →`);
  }
});

test("stepFromProgress 依門檻切成 0..3，邊界含上界", () => {
  assert.equal(stepFromProgress(0), 0);
  assert.equal(stepFromProgress(0.11), 0);
  assert.equal(stepFromProgress(0.12), 1);
  assert.equal(stepFromProgress(0.41), 1);
  assert.equal(stepFromProgress(0.42), 2);
  assert.equal(stepFromProgress(0.71), 2);
  assert.equal(stepFromProgress(0.72), 3);
  assert.equal(stepFromProgress(1), 3);
  assert.equal(stepFromProgress(Number.NaN), 0);
  assert.equal(stepFromProgress(-1), 0);
  assert.equal(stepFromProgress(2), 3);
  assert.deepEqual([...STAGE_STEPS], [0.12, 0.42, 0.72]);
});
```
Run: `cd frontend && npm test` → FAIL（模組不存在）。

- [ ] **Step 2: 實作 `homeContent.ts`**

文案逐字從 spec §3 貼；`stepFromProgress` 用 `STAGE_STEPS` 計算。

- [ ] **Step 3: 實作三個 hook**

`useScrollProgress`：`useState(0)` + `useEffect` 綁 `scroll`（`{ passive: true }`）與 `resize`，用 `requestAnimationFrame` 節流，卸載時取消。
`useInView`：`IntersectionObserver`，`isIntersecting` 一次後 `setInView(true)` 並 `unobserve`；無 `IntersectionObserver`（舊環境）直接 true。
`usePrefersReducedMotion`：`matchMedia` + `change` 事件。

- [ ] **Step 4: 驗證**

Run: `cd frontend && npx tsc -b && npm test` → 乾淨（新增 2 個測試通過）。

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/home/homeContent.ts frontend/src/components/home/homeContent.test.ts frontend/src/hooks/useScrollProgress.ts frontend/src/hooks/useInView.ts frontend/src/hooks/usePrefersReducedMotion.ts
git commit -m "feat(home): landing copy module, stage step rules and scroll/in-view hooks"
```

---

### Task 3: Hero 第一段 + 首頁骨架 + Navbar

**Files:**
- Create: `frontend/src/components/home/home.css`
- Create: `frontend/src/components/home/HomeHero.tsx`
- Modify: `frontend/src/Home.tsx`（整檔重寫）
- Modify: `frontend/src/App.tsx:20`（`{!isHome && <Navbar />}` → `<Navbar />`）
- Modify: `frontend/src/index.css:441-457`（`.home-shell` 改 `min-height`、拿掉 `overflow:hidden` 與 `height:100vh`、`align-items/justify-content` 移除；`.home-title` 保留不動）

**Interfaces:**
- Consumes: Task 2 `HERO`、`usePrefersReducedMotion`；既有 `useTheme`。
- Produces: `export default function HomeHero(): JSX.Element`；`home.css` 的類別前綴一律 `hs-`（hero/stage/story/index 共用），由 `Home.tsx` `import "./components/home/home.css"`。

- [ ] **Step 1: `home.css`**

依 spec §4 寫：`.hs-serif`、`.hs-grain`（SVG data URI 噪點、`pointer-events:none`）、`.hs-blob`×2、`.hs-hero`（`min-height: calc(100vh - 3.5rem)`、`position:relative; overflow:hidden; display:grid; place-items:center`）、`.hs-big` 與 `.hs-line.l1/.l2/.l3`（`clamp(90px, 17vw, 240px)`、描邊用 `-webkit-text-stroke`、`@keyframes hs-slide-in` 延遲 .1/.35/.6s）、`.hs-glow`（`@keyframes hs-pulse` 6s）、`.hs-sub`、`.hs-badge`（`#facc15`、旋轉 −3°）、`.hs-hint`（`@keyframes hs-bob`）。
結尾加 `@media (prefers-reduced-motion: reduce) { .hs-hero *, .hs-stage *, .hs-story *, .hs-index * { animation: none !important; transition: none !important; } }` 與手機規則（`@media (max-width: 767px)`：大字 `22vw`、`.hs-sub`/`.hs-badge` 改 static 排在下方）。

- [ ] **Step 2: `HomeHero.tsx`**

結構：`<section class="hs-hero">` 內 blob×2 → `<div class="hs-big" style={{opacity, transform}}>` 三行（`HERO.lines`，`hs-serif hs-line l1/l2/l3`）→ `.hs-sub`（`<b>` headline、tagline、desc，desc 用 `msg-text`）→ `.hs-badge` → `.hs-hint`。
大字淡出：`useEffect` 綁 scroll（rAF 節流），`p = Math.min(1, scrollY / innerHeight)`，`opacity = Math.max(0, 1 - p * 1.2)`、`transform = translateY(${-60 * p}px)`；`usePrefersReducedMotion()` 為 true 時不綁。

- [ ] **Step 3: `Home.tsx` 與 `App.tsx`**

`Home.tsx`：`<div class="home-shell relative z-10"><div class="hs-grain" /><HomeHero />{/* Task 4、5 的區塊接在這裡 */}</div>`；保留原本 40 顆漂浮小點的 `absolute inset-0 pointer-events-none overflow-hidden` 容器（照舊程式碼搬進來）。右上角原本的 `ThemeToggle` 拿掉（Navbar 已有）。
`App.tsx`：Navbar 改成所有頁都顯示；首頁外層維持 `relative z-10`。

- [ ] **Step 4: 驗證**

Run: `cd frontend && npx tsc -b && npm test` → 乾淨。
瀏覽器 `http://127.0.0.1:3100/`：(1) 頂欄出現、三行大字依序滑入、光暈脈動、左下文案、右下黃標籤、底部「往下捲 ↓」；截圖。(2) 往下捲大字淡出上移。(3) 切深色：描邊字可見、黃標籤不變。(4) 點頂欄「聊天問答」→ `/librarian`，點左上標誌 → 回首頁。

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/home/home.css frontend/src/components/home/HomeHero.tsx frontend/src/Home.tsx frontend/src/App.tsx frontend/src/index.css
git commit -m "feat(home): scroll-story landing skeleton with the big-type hero; navbar on home"
```

---

### Task 4: 第二段 — 顏如玉釘住、三個標註依序出現

**Files:**
- Create: `frontend/src/components/home/HomeStage.tsx`
- Modify: `frontend/src/components/home/home.css`（追加 `.hs-stage*`）
- Modify: `frontend/src/Home.tsx`（接上 `<HomeStage />`）

**Interfaces:**
- Consumes: Task 1 `YANRUYU_PORTRAIT_URL`；Task 2 `HOME_ENTRIES`、`stepFromProgress`、`STAGE_POSES`、`useScrollProgress`、`useInView`、`usePrefersReducedMotion`；`react-router-dom` `Link`。
- Produces: `export default function HomeStage(): JSX.Element`。

- [ ] **Step 1: CSS**

`.hs-stage-wrap { position:relative; height:320vh }`、`.hs-stage { position:sticky; top:3.5rem; height:calc(100vh - 3.5rem); overflow:hidden; display:grid; place-items:center }`、`.hs-stage img { height:80vh; transition: transform .6s cubic-bezier(.2,.8,.2,1) }`、`.hs-call`（`position:absolute; width:300px; opacity:0; transform:translateY(24px); transition:.6s`）+ `.is-on`、`.c1/.c2/.c3` 位置（左上／右上靠右對齊／左下）、`.hs-dot`、`.hs-ln`、`.hs-counter`（右下描邊大數字，`<b>` 實心）。
無人物版（`.hs-stage.no-portrait`）：三個 `.hs-call` 改 `position:static`，容器 `display:grid; grid-template-columns:repeat(3,1fr); gap:32px; align-items:start; padding:0 6vw`。
手機（<768px）：`.hs-stage-wrap { height:auto }`、`.hs-stage { position:static; height:auto; display:block; padding:8vh 6vw }`、`img { height:46vh; display:block; margin:0 auto }`、`.hs-call { position:static; width:auto; text-align:left; margin:16px 0 }`，`.is-on` 由 `useInView` 給。

- [ ] **Step 2: `HomeStage.tsx`**

`wrapRef` → `useScrollProgress(wrapRef)` → `step = stepFromProgress(p)`；`reduced = usePrefersReducedMotion()`；`isMobile = matchMedia("(max-width: 767px)")`（`useState` + `change` 監聽）。
`shown(n) = isMobile ? inView : reduced ? true : step >= n`。
`<img src={YANRUYU_PORTRAIT_URL} alt="AI 館員顏如玉" onError={() => setPortraitOk(false)} style={{ transform: reduced || isMobile ? undefined : STAGE_POSES[step] }} draggable={false} />`；`portraitOk === false` → 不 render img、容器加 `no-portrait`。
三個標註：`HOME_ENTRIES.map((e, i) => <div class={`hs-call c${i+1} ${shown(i+1) ? "is-on" : ""}`}>…<h3 class="hs-serif">{e.title}</h3><p class="msg-text-sm">{e.long}</p><Link to={e.to} className="hs-go">{e.go}</Link></div>)`。
計數：`<div class="hs-counter hs-serif"><b>0{Math.max(1, step)}</b>/03</div>`。

- [ ] **Step 3: 型別檢查**

Run: `cd frontend && npx tsc -b && npm test` → 乾淨。

- [ ] **Step 4: 瀏覽器驗證**

1. 桌機捲到第二段：人物釘住，繼續捲三個標註依序亮起、人物左右挪、計數 01→03；截圖兩張（01、03）。
2. 點「進入書籍介紹 →」→ `/book-guide`。
3. `resize_window` mobile(375)：不釘住、人物在上、三個標註上下排、可捲；回 desktop。
4. `javascript_tool` 把 `img.src` 改成不存在路徑 → 無破圖、三個標註改成三欄置中、計數照常（Review Focus 1）。

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/home/HomeStage.tsx frontend/src/components/home/home.css frontend/src/Home.tsx
git commit -m "feat(home): pinned 顏如玉 stage with scroll-revealed feature callouts"
```

---

### Task 5: 第三段「照片變故事書」+ 第四段索引式入口 + 全頁驗證

**Files:**
- Create: `frontend/src/components/home/HomeStory.tsx`
- Create: `frontend/src/components/home/HomeIndex.tsx`
- Modify: `frontend/src/components/home/home.css`（追加 `.hs-story*`、`.hs-index*`）
- Modify: `frontend/src/Home.tsx`（接上兩段）

**Interfaces:**
- Consumes: Task 2 `STORY`、`INDEX_HEAD`、`HOME_ENTRIES`、`useInView`；`Link`。
- Produces: `HomeStory`、`HomeIndex` default exports。

- [ ] **Step 1: CSS**

第三段：`.hs-story { position:relative; min-height:calc(100vh - 3.5rem); display:grid; place-items:center; overflow:hidden; padding:10vh 6vw }`、`.hs-words { position:absolute; inset:0; z-index:3; pointer-events:none }` 三行位置照示意（左上描邊／中左實心 88%／右下藍描邊，`clamp(70px, 13vw, 190px)`）、`.hs-polas { z-index:1; display:flex; gap:28px }`、`.hs-pola`（白框、`--r` 旋轉、`translateY(60px)`、opacity 0 → `.is-on` opacity .38，深色 `[data-theme="dark"]` .28，延遲 0/.15/.3s）、`.hs-cap` 左下。
第四段：`.hs-index { max-width:1180px; margin:0 auto; padding:12vh 6vw 4vh }`、`.hs-index-head`（flex、eyebrow 加前置短線、`h2` `clamp(34px, 4.6vw, 56px)`）、`.hs-row`（grid `72px 1fr auto`、上下 `border-bottom:1px solid var(--color-border)`、`::before` 漸層 `scaleX(0)`→hover 1、opacity/translateY 進場 + `.is-on`）、`.hs-row h3`（`clamp(30px, 4.2vw, 54px)`）、`.hs-ico`（圓形箭頭，hover 變 accent、旋轉 −45°）、`.hs-peek`（hover 浮出的斜色塊，<768px 隱藏）；`.hs-row:focus-visible { outline:2px solid var(--color-accent-strong); outline-offset:-2px }`。
手機：`.hs-polas` 直排、`.hs-row` grid `40px 1fr auto`。

- [ ] **Step 2: `HomeStory.tsx`**

`<section class="hs-story">` → `.hs-words` 三行（`STORY.lines`）→ `.hs-polas`：三張 `.hs-pola`（`style={{"--r": "-6deg"}}` 等、各自 `useInView` 或共用一個容器 ref 的 inView）、色塊漸層 `#fbcfe8→#fde68a`、`#bfdbfe→#c7d2fe`、`#bbf7d0→#99f6e4`、標籤 `STORY.polaroids[i]` → `.hs-cap`（`<b>` headline、`msg-text-sm` desc）。

- [ ] **Step 3: `HomeIndex.tsx`**

`<section class="hs-index">` → head（`INDEX_HEAD`）→ `.hs-index-list`：`HOME_ENTRIES.map((e, i) => <Link to={e.to} className={`hs-row ${inView ? "is-on" : ""}`} style={{ transitionDelay: `${i * 0.1}s` }}>`：`<span class="hs-no">{e.no}</span><div class="hs-ttl"><h3 class="hs-serif">{e.title}</h3><p class="msg-text-sm">{e.short}</p></div><span class="hs-ico" aria-hidden><ArrowRight /></span><span class="hs-peek" aria-hidden><i style={{background: …}} /></span></Link>`（`ArrowRight` 來自 lucide-react）。

- [ ] **Step 4: 接上 `Home.tsx` 並型別檢查**

`<HomeHero /><HomeStage /><HomeStory /><HomeIndex />`。全站 `Footer` 照舊在 `App.tsx` 顯示。
Run: `cd frontend && npx tsc -b && npm test` → 乾淨。

- [ ] **Step 5: 全頁瀏覽器驗證**

1. 桌機從頭捲到尾：四段順序正確、第三段拍立得在字後方半透明、第四段三行依序浮現、hover 有漸層與箭頭變化；截圖第三、第四段。
2. 點第四段「繪本生成」整行 → `/my-story-book`；回首頁點「書籍介紹」→ `/book-guide`。
3. mobile(375)：四段單欄、拍立得直排、三行可點、無橫向捲動；截圖；回 desktop。（Review Focus 2）
4. 深色：描邊字、拍立得、行分隔線可讀；截圖；切回淺色。
5. 鍵盤：Tab 順序 Navbar → 第二段三個「進入 →」→ 第四段三行，focus 可見，Enter 導頁。（Review Focus 4）
6. `javascript_tool` 模擬 `matchMedia("(prefers-reduced-motion: reduce)")` 為 true（或用 DevTools emulation）重新載入：無動畫，第二段三個標註直接可見。（Review Focus 3）
7. A+ 兩次：說明文字放大、大字尺寸不變、版面不破；A- 還原。（Review Focus 5）

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/home/HomeStory.tsx frontend/src/components/home/HomeIndex.tsx frontend/src/components/home/home.css frontend/src/Home.tsx
git commit -m "feat(home): photo-to-storybook teaser and editorial index entries; full landing verified"
```
