# 聊天模式列收合設計

日期：2026-10-18
分支：`feat/yanruyu-live2d`

## 1. 意圖

對話區上方的「一般問答 / 書籍介紹」兩顆大按鈕是為長者設計的，但吃掉約 56px 的對話高度。
讓它可以收合：收起後變成對話區標題列的一顆圖示鈕（放在下載 / 放大 / ⚙ 旁），滑鼠移上去
有浮動說明，點一下開小選單可切換模式或重新展開。

## 2. 目標 / 非目標

目標
- 模式列右端加「收合」鈕；收合後標題列出現「模式」圖示鈕，模式列消失。
- 圖示鈕**顯示目前模式**（一般問答 = 對話泡泡圖示、書籍介紹 = 書本圖示，旁邊帶模式名稱小字），
  hover 浮動說明：「目前模式：一般問答」+ 該模式的 description + 「點一下可切換或展開」。
- 點圖示鈕開小選單（樣式同下載選單）：列出所有模式（名稱 + 說明，目前的打勾/高亮），
  分隔線，「展開模式列」。選單用點擊開關，觸控裝置也能操作。
- 收合狀態存各自瀏覽器 `localStorage.chatModeBarCollapsed`（`"1"` / 其他 = 展開），
  **預設展開**；讀取失敗一律展開。
- 書籍介紹模式下的子列（文字介紹 / 語音說故事 / 語音設定）**不受收合影響**，照常顯示。
- 放大對話區（isChatExpanded）與上下版面都適用，行為相同。

非目標
- 不動 Navbar 的「聊天問答 / 繪本生成」分頁。
- 不做動畫。
- 不做鍵盤快捷鍵。

## 3. 元件

`frontend/src/components/ChatModeMenu.tsx`

```ts
type ChatModeOption = { id: string; label: string; description: string };
type Props = {
  modes: readonly ChatModeOption[];
  value: string;                 // 目前模式 id
  onChange: (id: string) => void;
  onExpand: () => void;          // 「展開模式列」
};
```

- 圖示：`general` → `MessageCircleMore`，其他 → `BookOpen`（lucide-react，專案已用）。
- 鈕樣式 `theme-icon-button rounded-lg p-2`，與鄰近三顆一致；圖示 `h-5 w-5`，右側 `ui-sub` 大小的模式名稱。
- hover 用現有 `Popover`；選單用與下載選單相同的結構（`fixed inset-0 z-10` 點外收起 +
  `theme-modal absolute right-0 top-full z-20 mt-2 w-56 rounded-xl p-2`）。
- `aria-label="模式：{目前模式名稱}"`，`aria-expanded` 反映選單狀態。

## 4. Librarian 接線

- `isModeBarCollapsed` state，lazy init 讀 localStorage；變更時寫回。
- 模式列：外層改 `flex items-start gap-2`，原本的 grid 加 `flex-1`，右端加
  `ChevronUp` 圖示鈕（`aria-label="收合模式列"`，`theme-icon-button rounded-lg p-2`），hover 說明「收合模式列，騰出對話空間」。
- 收合時：不 render 模式列；標題列右側圖示群組最左邊 render `<ChatModeMenu>`。
- 展開：`onExpand` 設回 false。

## 5. 留給實作者

- 選單內目前模式的高亮樣式（沿用 `bg-[var(--color-accent-soft)] text-[var(--color-accent-text)]`）。
- 名稱小字在窄螢幕（`sm` 以下）可隱藏只留圖示。
