# 書籍介紹獨立分頁 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 「書籍介紹」成為頁首第三個分頁 `/book-guide`，與聊天問答共用對話框元件與顏如玉，但各自有對話紀錄、系統提示詞與模型；移除模式列與收合功能。

**Architecture:** `Librarian` 以 `page` prop 參數化、兩條路由各自 `key`；`useLLMStream` 的換頁記憶改成 `Map` 以 `sessionKey` 分開；設定以頁面決定讀寫哪組 key；`ConfigModal` 依 `page` 顯示標題／預設並新增模型下拉。純前端，無後端變更。

**Tech Stack:** React 19 + TypeScript + Tailwind、react-router、lucide-react；測試 `node --experimental-strip-types --test`。

**Spec:** `docs/superpowers/specs/2026-10-18-book-guide-page-design.md`

## Global Constraints

- 路由 `/book-guide`；Navbar `navItems` 順序：聊天問答 `/librarian`（`MessageCircleMore`）、書籍介紹 `/book-guide`（`BookOpen`）、繪本生成 `/my-story-book`（`BookImage`）。
- `App.tsx`：`<Route path="/librarian" element={<Librarian key="general" page="general" />} />`、`<Route path="/book-guide" element={<Librarian key="book-guide" page="book-guide" />} />`。
- 開場句：聊天問答 `DEFAULT_GREETING`（不變）；書籍介紹 `BOOK_GUIDE_GREETING = "您好，我是顏如玉館員，想了解哪本書？告訴我書名或主題，我幫你整理介紹。"`。
- aiConfig key：共用 `temperature/maxTokens/motionSpeed/persona/characterView/layout`；聊天問答 `systemPrompt/model`；書籍介紹 `bookGuideSystemPrompt/bookGuideModel`。讀取用 `normalizePrompt(v, 該頁預設)` / `normalizeModel(v)`；寫入前也 normalize。
- `DEFAULT_BOOK_GUIDE_SYSTEM_PROMPT = DEFAULT_SYSTEM_PROMPT + "\n\n" + BOOK_GUIDE_INSTRUCTION`，`BOOK_GUIDE_INSTRUCTION` 內容 = 現在的 `DEFAULT_BOOK_GUIDE_PROMPT` 一字不改。
- 組裝 `[pageSystemPrompt, personaPrompt].filter(Boolean).join("\n\n")`。
- ⚙：第 1 區標題「系統提示詞（聊天問答）」/「系統提示詞（書籍介紹）」；移除第 2 區；區塊編號 1 系統提示詞、2 角色模組、3 Prompt 組裝預覽；預覽下方那句「書籍介紹模式下…」刪除；進階參數最上方加「模型」`<select>`（選項文字去掉 `openai:`）。
- 移除：`chatModes`、`ChatModeMenu.tsx`（刪檔）、`isModeBarCollapsed` 與相關 ref/effect、`MODE_BAR_KEY`、`bookGuidePrompt` state/draft/區塊、`DEFAULT_BOOK_GUIDE_PROMPT`、`normalizeBookGuidePrompt`。
- 頁面差異只有：書籍介紹頁永遠顯示「文字介紹｜語音說故事」子列、輸入框提示、不顯示推薦問題、匯出 `page` 標籤。
- tsconfig `noUnusedLocals`/`noUnusedParameters`、`verbatimModuleSyntax`；註解中文；每個任務結尾 `cd frontend && npx tsc -b && npm test` 乾淨；瀏覽器 `http://localhost:3100/`；驗證時**不要**送訊息給後端（Task 3 的對話隔離驗證除外，最多 2 則）。

## Review Focus

1. 在聊天問答聊兩句、切到書籍介紹 → 書籍介紹是自己的開場句、沒有前頁訊息；切回 → 聊天問答的對話還在。（Task 3 驗證 2）
2. 書籍介紹頁改系統提示詞並儲存 → 聊天問答的提示詞不變，反之亦然；`aiConfig` 四個 key 各自正確。（Task 3 驗證 3）
3. 舊使用者 `aiConfig` 沒有 `bookGuideSystemPrompt/bookGuideModel` → 書籍介紹頁用預設，不報錯。（Task 1 測 normalize；Task 3 驗證 4）
4. 模型下拉存的是該頁的 key；非清單值回預設。（Task 1 測 `normalizeModel`）
5. 直接開 `/book-guide` 重新整理 → 正常；`ChatModeMenu` 與收合 key 不再存在（grep 為零）。（Task 3 驗證 5）

---

### Task 1: 資料模組 + 對話紀錄分頁

**Files:**
- Create: `frontend/src/data/models.ts`、`frontend/src/data/models.test.ts`
- Modify: `frontend/src/data/personaModules.ts:26-36`（常數與 normalize）、`frontend/src/data/personaModules.test.ts`
- Modify: `frontend/src/hooks/useLLMStream.ts:44-50`（Options）、`:55-87`（session）
- Modify: `frontend/src/pages/Librarian.tsx:70-81`（`availableModels/defaultModel` 改 import）、`:158`、`:263`、`:277`、`:310`（`normalizeBookGuidePrompt` → `normalizePrompt(v, DEFAULT_BOOK_GUIDE_SYSTEM_PROMPT)` 暫代，Task 3 再重整）、`useLLMStream({...})` 呼叫加 `sessionKey: "general", greeting: DEFAULT_GREETING`
- Modify: `frontend/src/components/ConfigModal.tsx:19,211`（`DEFAULT_BOOK_GUIDE_PROMPT` → `BOOK_GUIDE_INSTRUCTION`，區塊暫留，Task 3 移除）

**Interfaces:**
- Produces:
  ```ts
  // data/models.ts
  export const availableModels: readonly string[]; export const defaultModel: string; export function normalizeModel(v: unknown): string;
  // data/personaModules.ts
  export const BOOK_GUIDE_INSTRUCTION: string; export const DEFAULT_BOOK_GUIDE_SYSTEM_PROMPT: string;
  export function normalizePrompt(v: unknown, fallback: string): string;
  // hooks/useLLMStream.ts
  export const BOOK_GUIDE_GREETING: string;  // 與 DEFAULT_GREETING 並列
  useLLMStream({ sessionKey: string; greeting: string; systemPrompt; temperature; maxTokens; currentModel; onEmotion? })
  ```

- [ ] **Step 1: 寫失敗測試**（`node:test`，import 加 `.ts`）

`models.test.ts`：
```ts
test("normalizeModel", () => {
  assert.equal(normalizeModel("openai:gpt-5.4"), "openai:gpt-5.4");
  assert.equal(normalizeModel("openai:gpt-4o"), defaultModel);
  assert.equal(normalizeModel(undefined), defaultModel);
  assert.ok((availableModels as readonly string[]).includes(defaultModel));
});
```
`personaModules.test.ts` 把 `normalizeBookGuidePrompt` 測試改成：
```ts
test("normalizePrompt", () => {
  assert.equal(normalizePrompt(undefined, "預設"), "預設");
  assert.equal(normalizePrompt("   \n", "預設"), "預設");
  assert.equal(normalizePrompt(42, "預設"), "預設");
  assert.equal(normalizePrompt(" 自訂 ", "預設"), " 自訂 ");
  assert.ok(DEFAULT_BOOK_GUIDE_SYSTEM_PROMPT.startsWith(DEFAULT_SYSTEM_PROMPT));
  assert.ok(DEFAULT_BOOK_GUIDE_SYSTEM_PROMPT.endsWith(BOOK_GUIDE_INSTRUCTION));
  assert.ok(BOOK_GUIDE_INSTRUCTION.includes("書名、作者、主題、摘要"));
});
```

- [ ] **Step 2: 跑測試確認失敗**：`cd frontend && node --experimental-strip-types --test src/data/models.test.ts src/data/personaModules.test.ts`

- [ ] **Step 3: 實作**

- `models.ts`：把 `Librarian.tsx:76-80` 的 `availableModels` 與 `defaultModel` 搬過來（含註解），加 `normalizeModel`。
- `personaModules.ts`：`DEFAULT_BOOK_GUIDE_PROMPT` 改名 `BOOK_GUIDE_INSTRUCTION`，新增 `DEFAULT_BOOK_GUIDE_SYSTEM_PROMPT`，`normalizeBookGuidePrompt` 改為 `normalizePrompt(v, fallback)`。
- `useLLMStream.ts`：`chatSession` 改 `const sessions = new Map<string, { messages: Message[]; followUpQuestions: string[] }>()`，`getSession(key)` 取/建；初始 `messages` 用 `session.messages.length > 0 ? session.messages : [greetingMessage(greeting)]`（`greetingMessage` 改吃文字參數）；回寫 effect 寫到該 session；`export const BOOK_GUIDE_GREETING`。
- `Librarian.tsx` / `ConfigModal.tsx`：只做讓型別通過的最小改名（見 Files）。

- [ ] **Step 4: 驗證**：`cd frontend && npx tsc -b && npm test` 乾淨；瀏覽器 `/librarian` 載入正常、開場句照舊。

- [ ] **Step 5: Commit**
```bash
git add frontend/src/data frontend/src/hooks/useLLMStream.ts frontend/src/pages/Librarian.tsx frontend/src/components/ConfigModal.tsx
git commit -m "refactor(chat): models/data module, page-keyed chat sessions, generic prompt normalizer"
```

---

### Task 2: 分頁與路由；移除模式列

**Files:**
- Modify: `frontend/src/App.tsx:35`（兩條路由）
- Modify: `frontend/src/components/Navbar.tsx:1-17`（`BookOpen` 已 import；`navItems` 加書籍介紹）
- Modify: `frontend/src/pages/Librarian.tsx`：`:31`（刪 `ChatModeMenu` import）、`:86-100`（刪 `chatModes`、`MODE_BAR_KEY`）、`:180-208`（刪 `chatMode` state、收合 state/ref/effect）、`:348-363`（改用 `isBookGuide`）、`:571`、`:623-631`（刪 menu）、`:736-795`（刪模式列，子列條件改 `isBookGuide`）、匯出 `page` 標籤、`useLLMStream` 的 `sessionKey/greeting` 依 `page`
- Delete: `frontend/src/components/ChatModeMenu.tsx`

**Interfaces:**
- Consumes: Task 1 `BOOK_GUIDE_GREETING`、`sessionKey/greeting` 選項。
- Produces: `export type ChatPage = "general" | "book-guide"`（在 `Librarian.tsx` 匯出）；`Librarian({ page }: { page: ChatPage })`。

- [ ] **Step 1: 實作**

- `Librarian` 簽名 `export default function Librarian({ page }: { page: ChatPage })`，`const isBookGuide = page === "book-guide";`，所有 `chatMode === "book-guide"` → `isBookGuide`、`chatMode === "general"` → `!isBookGuide`；`useLLMStream({ sessionKey: page, greeting: isBookGuide ? BOOK_GUIDE_GREETING : DEFAULT_GREETING, ... })`；`exportChat` 的 `page: isBookGuide ? "書籍介紹" : "聊天問答"`；`useEffect(() => { stopVoice(); }, [bookOutputMode])`。
- 刪除模式列 JSX、收合鈕、`ChatModeMenu` 用法與檔案；子列 `{isBookGuide && (…文字介紹/語音說故事…)}` 位置不變。
- `App.tsx` 兩條路由；`Navbar` 三個分頁。
- grep 確認：`chatMode`、`ChatModeMenu`、`chatModeBarCollapsed`、`isModeBarCollapsed` 在 `frontend/src` 皆為 0。

- [ ] **Step 2: 驗證**：`cd frontend && npx tsc -b && npm test` 乾淨；瀏覽器：頁首三個分頁；`/librarian` 無模式列、有推薦問題；`/book-guide` 有子列、開場句是書籍版、輸入框提示正確；切換兩頁各自狀態保留（不送訊息，只看開場句與輸入框）。

- [ ] **Step 3: Commit**
```bash
git add -A frontend/src/App.tsx frontend/src/components/Navbar.tsx frontend/src/pages/Librarian.tsx frontend/src/components/ChatModeMenu.tsx
git commit -m "feat(chat): 書籍介紹 becomes its own page (/book-guide) with a separate session; remove the mode bar"
```
（`git add -A <paths>` 只限這四個路徑，確保刪檔被記錄；`docs/runbook-prod-500-troubleshooting.md` 仍不得加入。）

---

### Task 3: 設定分頁化 + 端到端驗證

**Files:**
- Modify: `frontend/src/components/ConfigModal.tsx`：props 加 `page: ChatPage`、`:19`（import）、`:54`（`ConfigDraft`：刪 `bookGuidePrompt`，加 `model: string`）、`:182`（第 1 區標題、還原預設值依頁）、`:200-217`（刪第 2 區）、`:218/:363`（編號 2/3）、預覽下方說明句刪除、進階參數加模型 `<select>`
- Modify: `frontend/src/pages/Librarian.tsx`：`systemPrompt/currentModel` state 初值依頁；`applySettings` 寫該頁 key；載入 aiConfig 依頁讀；`initial` 傳 `model`、`page`；刪 `bookGuidePrompt` state；組裝改 `[systemPrompt, personaPrompt]`

**Interfaces:**
- Consumes: Task 1 `normalizePrompt/normalizeModel/availableModels/defaultModel/DEFAULT_BOOK_GUIDE_SYSTEM_PROMPT`；Task 2 `ChatPage`。
- Produces: `ConfigDraft = { systemPrompt; temperature; maxTokens; motionSpeed; persona; personaModules; characterView; layout; model }`；`ConfigModalProps.page`。

- [ ] **Step 1: Librarian 設定依頁**

```ts
const pageDefaults = isBookGuide
  ? { prompt: DEFAULT_BOOK_GUIDE_SYSTEM_PROMPT, promptKey: "bookGuideSystemPrompt", modelKey: "bookGuideModel" }
  : { prompt: DEFAULT_SYSTEM_PROMPT, promptKey: "systemPrompt", modelKey: "model" };
```
state 初值 `useState(pageDefaults.prompt)` / `useState(defaultModel)`；載入：`setSystemPrompt(normalizePrompt(saved[pageDefaults.promptKey], pageDefaults.prompt)); setCurrentModel(normalizeModel(saved[pageDefaults.modelKey]));`（移除原本 `typeof saved.systemPrompt === "string" && trim` 與 `availableModels.includes` 兩段）；`applySettings`：normalize 後寫 state，`aiConfig` 以 `{ ...現有解析結果, [promptKey]: p, [modelKey]: m, 共用欄位… }` 寫回——**先讀現有 aiConfig 再合併**，不能覆蓋另一頁的 key（現在是整份重寫，要改成 merge）。

- [ ] **Step 2: ConfigModal**

第 1 區 `SectionTitle text={page === "book-guide" ? "系統提示詞（書籍介紹）" : "系統提示詞（聊天問答）"}`，還原預設用 `page === "book-guide" ? DEFAULT_BOOK_GUIDE_SYSTEM_PROMPT : DEFAULT_SYSTEM_PROMPT`；刪第 2 區；進階參數最上方：
```tsx
<label className="mb-1 mt-3 block text-sm …">模型 <span className="text-[var(--color-text-muted)]">(只影響{page === "book-guide" ? "書籍介紹" : "聊天問答"}頁)</span></label>
<select value={draft.model} onChange={(e) => setDraft((d) => ({ ...d, model: e.target.value }))} className="theme-input mb-3 w-full rounded-lg px-3 py-2 text-sm">
  {availableModels.map((m) => <option key={m} value={m}>{m.replace(/^openai:/, "")}</option>)}
</select>
```

- [ ] **Step 3: 型別與測試**：`cd frontend && npx tsc -b && npm test` 乾淨；grep `bookGuidePrompt` 在 `frontend/src` 為 0。

- [ ] **Step 4: 瀏覽器驗證**

1. 兩頁的 ⚙：第 1 區標題不同、預設文字不同（書籍介紹的以「目前模式是「書籍介紹」」結尾）、進階參數有模型下拉。
2. 聊天問答送「我叫小明」（1 則）→ 切書籍介紹：開場句是書籍版、沒有小明；切回：小明還在。（Review Focus 1）
3. 書籍介紹 ⚙ 改提示詞為「書籍測試」+ 模型 `gpt-5.4` → 儲存；`localStorage.aiConfig` 有 `bookGuideSystemPrompt: "書籍測試"`、`bookGuideModel: "openai:gpt-5.4"`，且 `systemPrompt`、`model` 未變；切到聊天問答 ⚙ 第 1 區仍是原文。（Review Focus 2）還原預設並儲存。
4. 用 DevTools 刪掉 `bookGuideSystemPrompt/bookGuideModel` 後重整 `/book-guide` → ⚙ 顯示預設、無 console 錯誤。（Review Focus 3）
5. 直接重整 `/book-guide` → 正常；`grep -rn "ChatModeMenu\|chatModeBarCollapsed" frontend/src` 為 0。（Review Focus 5）
6. 書籍介紹頁問一本書（1 則）→ 回覆為粗體標籤版型（確認 `DEFAULT_BOOK_GUIDE_SYSTEM_PROMPT` 生效）。

- [ ] **Step 5: Commit**
```bash
git add frontend/src/components/ConfigModal.tsx frontend/src/pages/Librarian.tsx
git commit -m "feat(settings): per-page system prompt and model (聊天問答 / 書籍介紹), shared everything else"
```
