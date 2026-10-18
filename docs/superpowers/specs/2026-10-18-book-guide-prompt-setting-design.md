# 書籍介紹模式指令設定（做法 A）

日期：2026-10-18
分支：`feat/yanruyu-live2d`

## 1. 意圖

「書籍介紹」模式送給模型的附加指令（書名 / 作者 / 主題 / 摘要四欄位）目前寫死在
`Librarian.tsx`，老師改不到。把它變成設定視窗裡可編輯的一格，**與共通系統提示詞分開**，
但維持現在的組裝方式：共通提示詞 + 人設模組 + （書籍介紹模式才有的）模式指令。

## 2. 目標 / 非目標

目標
- 設定視窗新增一格「書籍介紹模式指令」（textarea），預設值 = 現在寫死的那段文字，
  附「還原預設」。
- 組裝規則不變：一般問答 = 共通 + 人設；書籍介紹 = 共通 + 人設 + 書籍介紹指令。
- 存在各自瀏覽器 `aiConfig.bookGuidePrompt`；第一次打開或存的是空白 → 用預設值。
- 「Prompt 組裝預覽」的說明文字改為提到這一格。

非目標
- 不做兩份完全獨立的提示詞（做法 B）。
- 不改後端、不改人設模組。

## 3. 資料與純函式

`frontend/src/data/personaModules.ts`（出廠值都在這裡）新增：

```ts
export const DEFAULT_BOOK_GUIDE_PROMPT =
  "目前模式是「書籍介紹」。請針對使用者提到的書籍或主題整理回覆，並使用以下欄位：書名、作者、主題、摘要。若無法確認書名或作者，請明確說明需要使用者補充或標示為未提供，不要捏造。";
// 讀取存檔用：非字串或去空白後為空 → 回預設
export function normalizeBookGuidePrompt(v: unknown): string;
```

## 4. 設定視窗

- `ConfigDraft.bookGuidePrompt: string`。
- 區塊順序：1 共通系統提示詞 → **2 書籍介紹模式指令** → 3 角色模組 → 4 Prompt 組裝預覽。
- 新區塊：`textarea rows=4`，placeholder「切到書籍介紹模式時會附加在最後的指令」，
  右下「還原預設」（`DEFAULT_BOOK_GUIDE_PROMPT`），樣式同第 1 區。
- 預覽說明改為：「書籍介紹模式下，送出時會再附加上方第 2 區的指令。」

## 5. Librarian 接線

- `bookGuidePrompt` state（預設 `DEFAULT_BOOK_GUIDE_PROMPT`）；載入 aiConfig 時
  `setBookGuidePrompt(normalizeBookGuidePrompt(saved.bookGuidePrompt))`；
  `applySettings` 寫入 state 與 aiConfig（存前也 normalize，避免存空白）。
- `modeSystemPrompt` 的第三段改用 state；刪除檔內的 `bookGuidePrompt` 常數。
- `ConfigModal initial` 傳入 `bookGuidePrompt`。
