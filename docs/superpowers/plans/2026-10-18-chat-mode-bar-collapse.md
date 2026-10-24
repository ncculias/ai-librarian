# 聊天模式列收合 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 「一般問答 / 書籍介紹」模式列可收合；收合後變成對話區標題列的一顆顯示目前模式的圖示鈕（hover 說明、點開選單切換或展開），狀態存各自瀏覽器，預設展開。

**Architecture:** 新元件 `ChatModeMenu`（圖示鈕 + Popover + 點擊選單）；`Librarian.tsx` 持有 `isModeBarCollapsed`（localStorage `chatModeBarCollapsed`），收合時以 `ChatModeMenu` 取代模式列，模式列右端加收合鈕。無新後端、無新設定頁項目。

**Tech Stack:** React 19 + TypeScript + Tailwind、lucide-react、既有 `Popover`。純 UI 變更，無單元測試（專案的 node test 只涵蓋純模組），以瀏覽器驗證為準。

**Spec:** `docs/superpowers/specs/2026-10-18-chat-mode-bar-collapse-design.md`

## Global Constraints

- localStorage key `chatModeBarCollapsed`，值 `"1"` = 收合，其他/缺/讀取例外 = 展開（預設展開）。
- 圖示：`general` → `MessageCircleMore`，其他模式 → `BookOpen`。鈕樣式 `theme-icon-button rounded-lg p-2`，圖示 `h-5 w-5`。
- 文案：收合鈕 `aria-label="收合模式列"`、hover「收合模式列，騰出對話空間」；模式鈕 hover 標題「目前模式：{label}」+ description + 「點一下可切換或展開」；選單最後一項「展開模式列」。
- 書籍介紹子列（文字介紹 / 語音說故事 / 語音設定）不受收合影響。
- 選單結構沿用下載選單：`fixed inset-0 z-10` 點外收起 + `theme-modal absolute right-0 top-full z-20 mt-2 w-56 rounded-xl p-2`。
- tsconfig `noUnusedLocals`/`noUnusedParameters`、`verbatimModuleSyntax`；註解中文。
- 每個任務結尾 `cd frontend && npx tsc -b && npm test` 乾淨；瀏覽器驗證 `http://localhost:3100/librarian`。

## Review Focus

1. 收合狀態為 `"1"` 時重新整理 → 直接是收合（沒有先展開再收合的閃爍）。（Task 2：lazy init）
2. 收合 + 書籍介紹模式 → 子列仍顯示，語音說故事可用。（Task 2 驗證 4）
3. 選單打開時點選單外任意處 → 關閉；點選項 → 切換並關閉。（Task 1/2 驗證）
4. 觸控/無 hover：點鈕即可開選單，選單內看得到各模式說明。（Task 1 選單含 description）
5. 放大對話區時收合鈕與模式鈕都正常。（Task 2 驗證 5）

---

### Task 1: `ChatModeMenu` 元件

**Files:**
- Create: `frontend/src/components/ChatModeMenu.tsx`

**Interfaces:**
- Produces:
  ```ts
  export type ChatModeOption = { id: string; label: string; description: string };
  export default function ChatModeMenu(props: {
    modes: readonly ChatModeOption[];
    value: string;
    onChange: (id: string) => void;
    onExpand: () => void;
  }): JSX.Element;
  ```

- [ ] **Step 1: 實作元件**

- `useState(false)` 管選單開關。
- 外層 `<Popover content={…}>` 包一個 `relative` 容器；容器內：圖示鈕（`type="button"`, `aria-label={`模式：${current.label}`}`, `aria-expanded={open}`, `onClick={() => setOpen(o => !o)}`），內容 = 圖示 + `<span className="ui-sub ml-1 hidden sm:inline">{current.label}</span>`。
- `open` 時 render 點外收起層與 `theme-modal` 選單：每個模式一顆 `w-full rounded-lg px-3 py-2 text-left` 鈕（目前模式加 `bg-[var(--color-accent-soft)] text-[var(--color-accent-text)]`），第一行 label、第二行 `text-xs text-[var(--color-text-muted)]` description；`onClick` → `onChange(id)` + 關閉。接 `border-t border-[var(--color-border)] my-1` 分隔，再一顆「展開模式列」（`onClick` → `onExpand()` + 關閉）。
- Popover 內容：`<p className="mb-1 font-semibold …">目前模式：{current.label}</p><p>{current.description}</p><p className="mt-1 text-xs …">點一下可切換或展開</p>`（沿用 Librarian 標題列其他 Popover 的 class）。
- `current = modes.find(m => m.id === value) ?? modes[0]`。

- [ ] **Step 2: 型別檢查**

Run: `cd frontend && npx tsc -b && npm test`。Expected: 乾淨（元件尚未被使用也要通過；`noUnusedLocals` 不會因未被 import 的 export 報錯）。

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/ChatModeMenu.tsx
git commit -m "feat(chat): ChatModeMenu — collapsed chat-mode icon button with hover help and switch menu"
```

---

### Task 2: Librarian 接線 + 瀏覽器驗證

**Files:**
- Modify: `frontend/src/pages/Librarian.tsx:7-24`（lucide import 加 `ChevronUp`）、`:174-177` 附近（新增 state）、`:605-684`（標題列右側圖示群組，最左加 `ChatModeMenu`）、`:687-717`（模式列加收合鈕、收合時不 render）

**Interfaces:**
- Consumes: Task 1 `ChatModeMenu`、`ChatModeOption`（`chatModes` 的元素型別已相容：`id/label/description`）。

- [ ] **Step 1: state 與持久化**

```ts
const MODE_BAR_KEY = "chatModeBarCollapsed";
const [isModeBarCollapsed, setIsModeBarCollapsed] = useState<boolean>(() => {
  try { return localStorage.getItem(MODE_BAR_KEY) === "1"; } catch { return false; }
});
useEffect(() => {
  try { localStorage.setItem(MODE_BAR_KEY, isModeBarCollapsed ? "1" : "0"); } catch {}
}, [isModeBarCollapsed]);
```

- [ ] **Step 2: 模式列加收合鈕、收合時隱藏**

把 `:687` 的 `<div className="mb-3 grid …">` 包成：
```tsx
{!isModeBarCollapsed && (
  <div className="mb-3 flex items-start gap-2">
    <div className="grid flex-1 grid-cols-1 gap-3 sm:grid-cols-2">{/* 原本的 chatModes.map */}</div>
    <Popover content={<div><p className="mb-1 font-semibold …">收合模式列</p><p>騰出對話空間；收起後可從右上角的模式圖示切換。</p></div>}>
      <button type="button" onClick={() => setIsModeBarCollapsed(true)} className="theme-icon-button rounded-lg p-2" aria-label="收合模式列"><ChevronUp className="h-5 w-5" /></button>
    </Popover>
  </div>
)}
```

- [ ] **Step 3: 標題列加模式鈕**

在 `:605` 的 `<div className="flex items-center gap-2">` 最前面：
```tsx
{isModeBarCollapsed && (
  <ChatModeMenu modes={chatModes} value={chatMode} onChange={(id) => setChatMode(id as typeof chatMode)} onExpand={() => setIsModeBarCollapsed(false)} />
)}
```

- [ ] **Step 4: 型別檢查**

Run: `cd frontend && npx tsc -b && npm test`。Expected: 乾淨。

- [ ] **Step 5: 瀏覽器驗證**（`http://localhost:3100/librarian`）

1. 預設展開：模式列右端有 ⌃ 鈕，hover 有說明。點 ⌃ → 模式列消失，標題列最左出現模式鈕（泡泡圖示 + 「一般問答」）；對話卡內訊息區變高（量 MessageList 高度前後差 ≥ 40px）。
2. hover 模式鈕 → 浮動說明「目前模式：一般問答…」。點鈕 → 選單列出兩個模式與說明、目前高亮、最後「展開模式列」。點選單外 → 關閉。
3. 選「書籍介紹」→ 圖示變書本、名稱變「書籍介紹」；子列（文字介紹 / 語音說故事）仍顯示；選「語音說故事」→ 語音設定鈕可開。（Review Focus 2）
4. 重新整理 → 仍是收合、仍是書籍介紹子列（Review Focus 1；`localStorage.chatModeBarCollapsed === "1"`）。
5. 放大對話區 → 模式鈕仍在、可開選單；還原。
6. 選單「展開模式列」→ 模式列回來、模式鈕消失；重新整理仍展開。
7. 切回一般問答，結束時狀態留在展開（預設）。

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/Librarian.tsx
git commit -m "feat(chat): collapsible chat-mode bar (collapsed state becomes a header icon menu, persisted per browser)"
```
