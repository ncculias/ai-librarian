# 書籍介紹模式指令設定 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 書籍介紹模式的附加指令改為設定視窗可編輯（與共通系統提示詞分開），有預設值與還原，存各自瀏覽器。

**Architecture:** 出廠值與讀檔正規化放進 `data/personaModules.ts`（純函式，node test）；`ConfigModal` 加一區 textarea；`Librarian.tsx` 以 state 取代寫死常數並接進 `aiConfig` 讀寫與 prompt 組裝。

**Tech Stack:** React 19 + TypeScript；測試 `node --experimental-strip-types --test`。

**Spec:** `docs/superpowers/specs/2026-10-18-book-guide-prompt-setting-design.md`

## Global Constraints

- `DEFAULT_BOOK_GUIDE_PROMPT` 文字 = `Librarian.tsx` 現有 `bookGuidePrompt` 常數的內容，一字不改。
- `normalizeBookGuidePrompt(v)`：`typeof v === "string" && v.trim() !== ""` → 回 `v`（原樣，不 trim），否則回預設。
- 組裝順序不變：`[systemPrompt, personaPrompt, chatMode === "book-guide" ? bookGuidePrompt : ""]`，`filter(Boolean).join("\n\n")`。
- aiConfig key `bookGuidePrompt`；寫入前 normalize。
- 設定視窗區塊編號：1 共通系統提示詞、2 書籍介紹模式指令、3 角色模組、4 Prompt 組裝預覽；新 textarea `rows={4}`、placeholder「切到書籍介紹模式時會附加在最後的指令」、還原鈕沿用第 1 區的 `RotateCcw` 樣式；預覽說明文字改為「書籍介紹模式下，送出時會再附加上方第 2 區的指令。」
- tsconfig `noUnusedLocals`/`noUnusedParameters`、`verbatimModuleSyntax`；註解中文。
- 每個任務結尾 `cd frontend && npx tsc -b && npm test` 乾淨；瀏覽器驗證 `http://localhost:3100/librarian`，**不要送訊息給後端**（用 ConfigModal 的「Prompt 組裝預覽」與 localStorage 驗證即可）。

## Review Focus

1. 舊使用者的 `aiConfig` 沒有 `bookGuidePrompt` → 載入後用預設值，設定視窗顯示預設文字。（Task 1 測 `normalize(undefined)`；Task 2 驗證 3）
2. 使用者把那格清空後儲存 → 存檔與生效都回到預設，不會變成「書籍介紹沒有任何指令」。（Task 1 測 `normalize("   ")`；Task 2 驗證 4）
3. 一般問答模式不受影響：組裝結果不含書籍介紹指令。（Task 2 驗證 5，用預覽與 `modeSystemPrompt` 檢查）

---

### Task 1: 出廠值 + 正規化 + 設定視窗區塊

**Files:**
- Modify: `frontend/src/data/personaModules.ts:9-25`（`DEFAULT_SYSTEM_PROMPT` 之後新增常數與函式）
- Create: `frontend/src/data/personaModules.test.ts`
- Modify: `frontend/src/components/ConfigModal.tsx:19`（import）、`:50-57`（`ConfigDraft`）、`:180-198`（新增第 2 區、後續 SectionTitle 編號 +1）、`:370-372`（預覽說明）

**Interfaces:**
- Produces: `DEFAULT_BOOK_GUIDE_PROMPT: string`、`normalizeBookGuidePrompt(v: unknown): string`（from `data/personaModules.ts`）；`ConfigDraft.bookGuidePrompt: string`。

- [ ] **Step 1: 寫失敗測試** `frontend/src/data/personaModules.test.ts`（`node:test` + `node:assert/strict`，import 加 `.ts`）

```ts
test("normalizeBookGuidePrompt", () => {
  assert.equal(normalizeBookGuidePrompt(undefined), DEFAULT_BOOK_GUIDE_PROMPT);
  assert.equal(normalizeBookGuidePrompt(null), DEFAULT_BOOK_GUIDE_PROMPT);
  assert.equal(normalizeBookGuidePrompt(""), DEFAULT_BOOK_GUIDE_PROMPT);
  assert.equal(normalizeBookGuidePrompt("   \n"), DEFAULT_BOOK_GUIDE_PROMPT);
  assert.equal(normalizeBookGuidePrompt(42), DEFAULT_BOOK_GUIDE_PROMPT);
  assert.equal(normalizeBookGuidePrompt(" 自訂指令 "), " 自訂指令 ");
  assert.ok(DEFAULT_BOOK_GUIDE_PROMPT.includes("書名、作者、主題、摘要"));
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `cd frontend && node --experimental-strip-types --test src/data/personaModules.test.ts` → FAIL（export 不存在）

- [ ] **Step 3: 實作常數與函式；`ConfigModal` 加欄位與區塊**

- `personaModules.ts`：常數文字從 `Librarian.tsx:131-132` 複製；函式照 Global Constraints。
- `ConfigModal.tsx`：import `DEFAULT_BOOK_GUIDE_PROMPT`；`ConfigDraft` 加 `bookGuidePrompt: string;`；在第 1 區的還原鈕 `</div>` 之後插入第 2 區（`SectionTitle no="2" text="書籍介紹模式指令"` + textarea 綁 `draft.bookGuidePrompt` + 還原鈕設回 `DEFAULT_BOOK_GUIDE_PROMPT`）；原第 2、3 區編號改 3、4；預覽說明改文案。

- [ ] **Step 4: 測試與型別**

Run: `cd frontend && npx tsc -b && npm test` → `tsc` 會因 `Librarian.tsx` 的 `ConfigModal initial` 缺 `bookGuidePrompt` 而報錯 —— **預期**：本任務先在 `Librarian.tsx` 的 `initial={{…}}` 補一行 `bookGuidePrompt: DEFAULT_BOOK_GUIDE_PROMPT`（暫時直接用預設常數，Task 2 改成 state），讓型別通過；測試全綠。

- [ ] **Step 5: Commit**

```bash
git add frontend/src/data/personaModules.ts frontend/src/data/personaModules.test.ts frontend/src/components/ConfigModal.tsx frontend/src/pages/Librarian.tsx
git commit -m "feat(settings): editable 書籍介紹 mode prompt (default + reset) in the settings modal"
```

---

### Task 2: Librarian 接線 + 瀏覽器驗證

**Files:**
- Modify: `frontend/src/pages/Librarian.tsx:131-132`（刪常數）、`:157`（state）、`:245-275`（`applySettings`）、`:283-306`（載入 aiConfig）、`:316-322`（組裝）、`:836-847`（`ConfigModal initial`）

**Interfaces:**
- Consumes: Task 1 的 `DEFAULT_BOOK_GUIDE_PROMPT`、`normalizeBookGuidePrompt`、`ConfigDraft.bookGuidePrompt`。

- [ ] **Step 1: state 與接線**

- `const [bookGuidePrompt, setBookGuidePrompt] = useState(DEFAULT_BOOK_GUIDE_PROMPT);`
- 載入：`setBookGuidePrompt(normalizeBookGuidePrompt(saved.bookGuidePrompt));`
- `applySettings`：`const bg = normalizeBookGuidePrompt(draft.bookGuidePrompt); setBookGuidePrompt(bg);` 並寫入 aiConfig `bookGuidePrompt: bg`。
- 組裝第三段 `chatMode === "book-guide" ? bookGuidePrompt : ""` 改讀 state；刪除檔內常數；`initial` 的暫時值改為 state。

- [ ] **Step 2: 型別與測試**

Run: `cd frontend && npx tsc -b && npm test` → 乾淨。

- [ ] **Step 3: 瀏覽器驗證**（不送訊息）

1. ⚙ → 第 2 區顯示預設四欄位文字；改成「測試指令 XYZ」→ 儲存並套用 → `localStorage.aiConfig.bookGuidePrompt === "測試指令 XYZ"`；重新整理後再開 ⚙ 仍是該文字。
2. 還原預設 → 儲存 → aiConfig 回預設文字。
3. 用 DevTools 把 `aiConfig` 的 `bookGuidePrompt` 欄位刪掉 → 重整 → ⚙ 顯示預設（Review Focus 1）。
4. 清空那格 → 儲存 → aiConfig 為預設文字、⚙ 再開顯示預設（Review Focus 2）。
5. 一般問答模式下的組裝（可在 `useLLMStream` 呼叫前暫時 `console.debug(modeSystemPrompt)`，commit 前移除）不含書籍介紹指令；切到書籍介紹後包含「測試指令 XYZ」（Review Focus 3）。恢復預設後結束。

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/Librarian.tsx
git commit -m "feat(chat): 書籍介紹 mode prompt comes from settings (persisted, normalized to default when empty)"
```
