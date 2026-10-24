# 首頁改版 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 首頁改成顏如玉靜態圖迎賓 + 中文主標／英文副標 + 兩個功能入口 + 字體控制，深色與手機版可用。

**Architecture:** 人物圖從廠商 PNG 以 `sips` 縮成 `public/yanruyu/portrait.png`（gitignore 目錄、rsync 部署）；`Home.tsx` 重寫成兩欄版面（人物 + 泡泡 ｜ 文案 + 入口卡），沿用既有 theme/card/motion 類與 `ThemeToggle`、`FontSizeController`；`index.css` 的 `.home-shell` 改為可捲動並加泡泡樣式。無新依賴、無後端變更。

**Tech Stack:** React 19 + TypeScript + Tailwind、lucide-react、react-router。純 UI，無單元測試；瀏覽器驗證為準。

**Spec:** `docs/superpowers/specs/2026-10-18-home-page-redesign-design.md`

## Global Constraints

- 文案一字不改：主標「讓 AI 館員陪你找書、聽故事」；副標「Unlock knowledge, powered by AI.」；說明「查館藏、介紹書籍，或把你的照片做成一本有聲故事書。」；泡泡「您好，我是 AI 館員顏如玉，請選一個功能開始吧。」；入口「聊天問答」／「問問題、查館藏、介紹書籍」→ `/librarian`，「繪本生成」／「上傳照片，做成有聲故事書」→ `/my-story-book`；底部「國立政治大學圖檔所 AI Librarian」。
- 人物圖：`frontend/public/yanruyu/portrait.png`，高 1600px，透明背景；常數 `YANRUYU_PORTRAIT_URL = "/yanruyu/portrait.png"` 在 `components/live2d/yanruyu.ts`；載入失敗 `onError` 隱藏圖（泡泡也一起隱藏），版面不變。
- 不載 Live2D；不改 Navbar 與其他頁；`.home-shell` 改 `min-height: 100vh`、移除 `overflow: hidden`（漂浮小點容器自己 `overflow-hidden`）。
- 右上角 `ThemeToggle` + `FontSizeController variant="inline" className="theme-control-shell rounded-full px-3 py-1"`（同 Navbar）。
- 入口卡是 `<button type="button">`，可 Tab/Enter；圖示 `MessageCircleMore`、`BookImage`（lucide，Navbar 已用）。
- 說明與卡片說明用 `msg-text` / `msg-text-sm`（跟著 A+/A-）；主標 `home-title` + `clamp(1.9rem, 4vw, 3.2rem)`。
- tsconfig `noUnusedLocals`/`noUnusedParameters`、`verbatimModuleSyntax`；註解中文；`cd frontend && npx tsc -b && npm test` 乾淨；瀏覽器 `http://localhost:3100/`（Vite 在 macOS bind mount 看不到新建檔案：產生 portrait.png 後若 404 要 `docker restart ai-librarian-frontend`）。

## Review Focus

1. `portrait.png` 404（正式機未 rsync）→ 沒有人物、沒有泡泡，其餘版面正常、無壞圖示。（Task 2 驗證 5）
2. 手機 375px → 單欄、可捲動、兩張卡上下排、按鈕可點。（Task 2 驗證 3）
3. 深色模式 → 泡泡、卡片、文字對比正常。（Task 2 驗證 4）
4. 鍵盤：Tab 依序到主題、A+、A-、兩張卡；Enter 導頁。（Task 2 驗證 6）
5. A+ 兩次 → 說明與卡片文字放大、版面不破。（Task 2 驗證 7）

---

### Task 1: 人物圖產出 + 常數

**Files:**
- Create (gitignored, 不 commit): `frontend/public/yanruyu/portrait.png`
- Modify: `frontend/src/components/live2d/yanruyu.ts:4-5`（常數旁新增 `YANRUYU_PORTRAIT_URL`）
- Modify: `frontend/src/components/live2d/yanruyu.test.ts`（加一行斷言常數值）

**Interfaces:**
- Produces: `export const YANRUYU_PORTRAIT_URL = "/yanruyu/portrait.png";`

- [ ] **Step 1: 產圖**

Run:
```bash
sips -Z 1600 "/Users/weihsuan/ai-librarian-assets/yanruyu-vendor-20261018/圖/2026-0930a-(AI-Librarian).png" --out /Users/weihsuan/ai-librarian/frontend/public/yanruyu/portrait.png
sips -g pixelWidth -g pixelHeight /Users/weihsuan/ai-librarian/frontend/public/yanruyu/portrait.png
```
Expected: 高 1600、寬約 1120；`git status` 不出現該檔（目錄已 ignore）。

- [ ] **Step 2: 常數與測試**

`yanruyu.ts` 加 `export const YANRUYU_PORTRAIT_URL = "/yanruyu/portrait.png"; // 首頁靜態迎賓圖(廠商 PNG 縮圖,與模型同目錄 rsync 部署)`；`yanruyu.test.ts` 的常數測試加 `assert.equal(YANRUYU_PORTRAIT_URL, "/yanruyu/portrait.png")`。

- [ ] **Step 3: 驗證**

Run: `cd frontend && npx tsc -b && npm test` → 乾淨。瀏覽器開 `http://localhost:3100/yanruyu/portrait.png` → 看得到人物（404 就 `docker restart ai-librarian-frontend` 再試）。

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/live2d/yanruyu.ts frontend/src/components/live2d/yanruyu.test.ts
git commit -m "feat(home): portrait url constant for the 顏如玉 landing image"
```

---

### Task 2: 首頁重寫

**Files:**
- Modify: `frontend/src/Home.tsx`（整檔重寫，46 行 → 約 120 行）
- Modify: `frontend/src/index.css:439-455`（`.home-shell`、`.home-title`）+ 新增 `.home-bubble`

**Interfaces:**
- Consumes: Task 1 `YANRUYU_PORTRAIT_URL`；既有 `ThemeToggle`、`FontSizeController`、`useTheme`、`useNavigate`。

- [ ] **Step 1: CSS**

- `.home-shell`：`min-height: 100vh`，拿掉 `height: 100vh` 與 `overflow: hidden`，其餘背景不變；加 `padding: 4.5rem 1rem 2rem`（上方留給右上角控制列）。
- `.home-title`：加 `font-size: clamp(1.9rem, 4vw, 3.2rem); line-height: 1.2;`。
- 新增：
```css
/* 首頁顏如玉的對話泡泡：白底圓角，尾巴朝下指向人物 */
.home-bubble {
  position: relative;
  background-color: var(--color-bg-card);
  border: 1px solid var(--color-border);
  border-radius: 1rem;
  padding: 0.6rem 0.9rem;
  box-shadow: 0 10px 30px rgba(var(--color-shadow), 0.12);
}
.home-bubble::after {
  content: "";
  position: absolute;
  left: 50%;
  bottom: -0.45rem;
  width: 0.9rem;
  height: 0.9rem;
  transform: translateX(-50%) rotate(45deg);
  background-color: inherit;
  border-right: 1px solid var(--color-border);
  border-bottom: 1px solid var(--color-border);
}
```

- [ ] **Step 2: `Home.tsx`**

結構（Tailwind）：
```
<div class="home-shell relative z-10">
  <div class="absolute right-6 top-6 z-20 flex items-center gap-3"><ThemeToggle/><span class="text-xs …">字體大小</span><FontSizeController variant="inline" className="theme-control-shell rounded-full px-3 py-1"/></div>
  <div class="pointer-events-none absolute inset-0 overflow-hidden">{40 顆漂浮小點，照舊}</div>
  <main class="relative z-10 mx-auto grid w-full max-w-6xl grid-cols-1 items-center gap-8 md:grid-cols-12">
    <section class="order-1 flex flex-col items-center md:col-span-5">   {/* 人物 + 泡泡；portraitOk=false 時整個不 render */}
      <div class="home-bubble msg-text-sm mb-3 max-w-xs text-center">您好，我是 AI 館員顏如玉，請選一個功能開始吧。</div>
      <img src={YANRUYU_PORTRAIT_URL} alt="AI 館員顏如玉" class="h-[44vh] w-auto object-contain md:h-[min(78vh,760px)]" onError={() => setPortraitOk(false)} draggable={false}/>
    </section>
    <section class="order-2 text-center md:col-span-7 md:text-left">
      <h1 class="home-title mb-3 font-bold">讓 AI 館員陪你找書、聽故事</h1>
      <p class="ui-sub mb-4 text-[var(--color-text-secondary)]">Unlock knowledge, powered by AI.</p>
      <p class="msg-text mb-8 text-[var(--color-text-primary)]">查館藏、介紹書籍，或把你的照片做成一本有聲故事書。</p>
      <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">{兩張入口卡}</div>
      <p class="mt-8 text-xs text-[var(--color-text-muted)]">國立政治大學圖檔所 AI Librarian</p>
    </section>
  </main>
</div>
```
入口卡：`<button type="button" onClick={() => navigate(to)} className="card motion-surface flex items-start gap-4 p-5 text-left">` + 圖示（`h-8 w-8 text-[var(--color-accent-strong)]`）+ `<div><div class="ui-tab font-semibold">{title}</div><div class="msg-text-sm mt-1 text-[var(--color-text-secondary)]">{desc}</div></div>`；加 `focus-visible:outline-2 focus-visible:outline-[var(--color-accent-strong)]`。
`portraitOk` 用 `useState(true)`；`portraitOk === false` 時人物區不 render，右欄 `md:col-span-12` 置中。

- [ ] **Step 3: 型別檢查**

Run: `cd frontend && npx tsc -b && npm test` → 乾淨。

- [ ] **Step 4: 瀏覽器驗證**（`http://localhost:3100/`）

1. 桌機 1280 寬：左顏如玉 + 泡泡、右文案與兩張卡、右上主題與 A+/A-、底部一行；截圖。
2. 點「聊天問答」→ `/librarian`；回首頁點「繪本生成」→ `/my-story-book`。
3. `resize_window` mobile(375)：單欄可捲動、卡片上下排、按鈕可點；截圖；回 desktop。
4. 切深色：泡泡、卡片、文字可讀；截圖；切回淺色。
5. 用 `javascript_tool` 把 `img.src` 改成不存在的路徑觸發 `onError` → 人物與泡泡消失、右欄置中、無壞圖示（Review Focus 1）。
6. 鍵盤：Tab 順序 主題→A+→A-→聊天問答→繪本生成，Enter 導頁（Review Focus 4）。
7. A+ 兩次 → 說明與卡片文字變大、版面不破；A- 兩次還原（Review Focus 5）。

- [ ] **Step 5: Commit**

```bash
git add frontend/src/Home.tsx frontend/src/index.css
git commit -m "feat(home): 顏如玉 landing with Chinese headline, English tagline, two entry cards and font controls"
```
