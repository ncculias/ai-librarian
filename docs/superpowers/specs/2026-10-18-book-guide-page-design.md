# 書籍介紹獨立分頁設計

日期：2026-10-18
分支：`feat/yanruyu-live2d`
取代：`2026-10-18-chat-mode-bar-collapse-design.md`（模式列與收合功能整個移除）、
`2026-10-18-book-guide-prompt-setting-design.md`（第 2 區「書籍介紹模式指令」併入該頁自己的系統提示詞）。

## 1. 意圖

「書籍介紹」從聊天頁裡的一個模式，變成頁首的第三個分頁（聊天問答｜書籍介紹｜繪本生成）。
兩個聊天頁共用同一個對話框元件與顏如玉，但各自有：自己的對話紀錄、自己的系統提示詞、
自己的模型；其餘設定（人設、溫度、max tokens、動作速度、人物顯示、版面）共用。

使用者決定（2026-10-18）：A = 提示詞 + 模型分開、其他共用；B = 對話紀錄分開；C = 模式列與收合功能拿掉。

## 2. 目標 / 非目標

目標
- 路由 `/book-guide`，Navbar 分頁「書籍介紹」（`BookOpen` 圖示）排在聊天問答與繪本生成之間。
- `Librarian` 元件接受 `page: "general" | "book-guide"`；兩條路由用 `key={page}` 各自掛載。
- 對話紀錄：`useLLMStream` 的換頁記憶改為以 `sessionKey` 分開（`"general"` / `"book-guide"`），
  各頁開場句不同：
  - 聊天問答：維持「您好，我是顏如玉館員，很高興為您服務，請問有什麼可以幫忙的嗎？」
  - 書籍介紹：「您好，我是顏如玉館員，想了解哪本書？告訴我書名或主題，我幫你整理介紹。」
- 設定：
  - 共用（`aiConfig` 既有 key 不變）：`temperature`、`maxTokens`、`motionSpeed`、`persona`、`characterView`、`layout`、人設模組。
  - 聊天問答專屬：`systemPrompt`、`model`（既有 key）。
  - 書籍介紹專屬：`bookGuideSystemPrompt`、`bookGuideModel`。
  - 預設：聊天問答 = `DEFAULT_SYSTEM_PROMPT` / `defaultModel`；
    書籍介紹 = `DEFAULT_BOOK_GUIDE_SYSTEM_PROMPT`（= `DEFAULT_SYSTEM_PROMPT` + 空行 + 書籍介紹版型指令）/ `defaultModel`。
  - ⚙ 設定視窗：第 1 區標題依頁面顯示「系統提示詞（聊天問答）」或「系統提示詞（書籍介紹）」，
    還原預設回該頁預設；**移除**原第 2 區「書籍介紹模式指令」；「進階參數」新增「模型」下拉
    （`availableModels`），該頁專屬。
  - 組裝：`[該頁系統提示詞, 人設]`，不再有模式附加段。
- 頁面差異（只有這些）：
  - 書籍介紹頁：永遠顯示「文字介紹｜語音說故事」子列（含語音設定鈕）；輸入框提示
    「輸入書名或主題，我會整理成書籍介紹...」（語音說故事時「輸入書名，或請我用說故事方式介紹一本書...」）；不顯示推薦問題。
  - 聊天問答頁：推薦問題照舊；輸入框「輸入問題...」。
  - 匯出對話的 `page` 標籤：「聊天問答」/「書籍介紹」。
- 移除：`chatModes` 模式列、`ChatModeMenu.tsx`、收合狀態與 `chatModeBarCollapsed` key、
  `bookGuidePrompt` 設定與 `normalizeBookGuidePrompt`（改為通用 `normalizePrompt(v, fallback)`）。

非目標
- 顏如玉、朗讀、口型、資料來源等在兩頁完全相同，不動。
- 不做設定「從另一頁複製」。
- 不遷移舊的 `aiConfig.bookGuidePrompt`（上線一天內的欄位，直接忽略）。
- 首頁改版（另一份計畫）之後要改成三個入口；本計畫不碰首頁。

## 3. 資料模組

- `frontend/src/data/models.ts`（從 `Librarian.tsx` 搬出）：
  `export const availableModels = [...] as const; export const defaultModel = "openai:gpt-5.4-mini";
  export function normalizeModel(v: unknown): string`（不在清單 → `defaultModel`）。
- `frontend/src/data/personaModules.ts`：`BOOK_GUIDE_INSTRUCTION`（現在 `DEFAULT_BOOK_GUIDE_PROMPT` 的內容）、
  `DEFAULT_BOOK_GUIDE_SYSTEM_PROMPT = DEFAULT_SYSTEM_PROMPT + "\n\n" + BOOK_GUIDE_INSTRUCTION`、
  `normalizePrompt(v: unknown, fallback: string): string`（非字串或空白 → fallback）。
- `frontend/src/hooks/useLLMStream.ts`：`sessions: Map<string, Session>`；選項新增 `sessionKey: string`、`greeting: string`。

## 4. 留給實作者

- `Librarian.tsx` 內以 `const isBookGuide = page === "book-guide"` 取代所有 `chatMode === "book-guide"`。
- 模型下拉放在「進階參數」最上面，選項顯示去掉 `openai:` 前綴即可。
