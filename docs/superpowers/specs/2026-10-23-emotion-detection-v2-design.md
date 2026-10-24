# 情緒判斷 v2 設計（依使用者這一句判斷）

日期：2026-10-23（依使用者決定改版：判斷對象＝使用者的訊息；anger/angry 合併；surprised 保留、前端對應 think 動作）
範圍：後端 `ai_librarian_core`（判斷邏輯）、`ai_librarian_apis`（串流事件）、前端一小段對應；加一份評估資料與腳本。
相關：`2026-10-18-yanruyu-live2d-integration-design.md`（前端情緒→動作對應）。

## 1. 現況與問題

`AsyncReactEmotionAgent._detect_emotion` 在回覆完成後，把最後 3 則訊息串成英文提示詞
「detect the emotion from the chat history」，用與聊天相同的模型與溫度（0.7）做結構化輸出。問題：
沒定義判斷誰的情緒與各標籤標準；溫度 0.7 結果不穩；輸入混了工具輸出；只在回覆完才判斷，
角色永遠在文字出完後才變臉；延伸問題那條路也白跑一次；沒有量測。

## 2. 目標 / 非目標

目標
- **判斷對象＝使用者最新這一則訊息**（每次送出都判一次），不看 AI 回覆。
- 使用者一送出就判斷，與主回覆**平行**進行，情緒事件在回覆文字之前送達前端 → 顏如玉先反應再回答。
- 標準明確（中文提示詞、每個標籤有定義、例句、預設規則），溫度 0，固定用便宜模型，只看這一句（截前 300 字）。
- 查工具時：若這一輪使用者情緒是 neutral，送 `think` 讓顏如玉做思考動作，回覆開始時切回 normal；
  使用者有明顯情緒（sad/angry/happy/surprised/think）時維持該情緒、不被 think 蓋掉。
- 延伸問題改走不帶情緒判斷的 agent。
- 標籤整理：`anger` 刪除（只留 `angry`）；`surprised` 保留（前端已對應 think 動作）；新增 `think`。
- 評估集（人工標註使用者句子）與腳本，先建立基準數字。
- `emotion` SSE 事件格式不變。

非目標
- 不改回覆模型的輸出格式；不訓練自己的分類模型。
- 不依 AI 回覆語氣再修正一次表情（v3 若需要再加）。

## 3. 判斷標準（提示詞內容，中文）

你是圖書館 AI 館員「顏如玉」的情緒感知器。請只看使用者**最新的一句話**，判斷使用者此刻的情緒，
讓館員用合適的表情回應。回傳六個標籤之一。

| 標籤 | 定義（使用者的狀態） | 例句 |
|---|---|---|
| happy | 開心、興奮、感謝、分享好消息、對館員表達喜歡 | 「太好了，終於找到這本書了！」「謝謝你，幫了大忙」 |
| sad | 難過、失落、孤單、疲憊、生病、提到親友過世或離別、想被安慰 | 「我最近心情很差」「我先生上個月走了」 |
| angry | 生氣、不耐煩、抱怨、不滿意（對館員、系統或其他人事物） | 「你怎麼又答錯」「等這麼久還查不到，很煩」 |
| surprised | 驚訝、意外、沒想到、「真的嗎？」式的反應 | 「什麼？這本書絕版了？」「哇，原來還有續集」 |
| think | 猶豫、思考中、拿不定主意、提出需要一起想的開放問題 | 「我在想要不要讀這本」「不知道該選哪一本好」 |
| neutral | 一般提問、查資料、下指令、閒聊問候；以及以上都不明確時 | 「幫我查今天台北的天氣」「介紹一下《小王子》」 |

規則：
1. 只看最新這一句，不看之前的對話。
2. 判斷的是**使用者本人**的情緒，不是話題的情緒：問「有沒有關於喪親的書」是查資料 → neutral；說「我媽媽走了，想找書看」是 sad。
3. 同一句有多種情緒時，取最明顯、或最後表達的那個。
4. 禮貌用語（請、謝謝、麻煩你）不等於 happy；一般的「謝謝」是 neutral，要有明顯高興才是 happy。
5. 很短或無法判讀的句子（「嗯」「好」「ok」「？」）→ neutral。
6. 拿不準一律 neutral。
7. 只回傳一個標籤。

## 4. 架構

- 新模組 `ai_librarian_core/agents/react/emotion_classifier.py`：
  - `EMOTION_PROMPT`（§3）、`EMOTION_MODEL = os.environ.get("EMOTION_MODEL", "openai:gpt-5.4-mini")`、`EMOTION_MAX_CHARS = 300`。
  - `latest_user_text(messages) -> str`（純函式：最後一則 HumanMessage 的 content，缺則空字串）。
  - `build_emotion_input(user_text) -> str`（純函式，截字、組版）。
  - `async classify_emotion(llm, user_text) -> Emotion`：`with_structured_output(EmotionOutput)`；空字串直接 `NEUTRAL`；例外或驗證失敗 → `NEUTRAL`。
- `Emotion` 列舉：刪 `ANGER`，加 `THINK = "think"`。順序 `NEUTRAL, HAPPY, SAD, ANGRY, SURPRISED, THINK`。
- `AsyncReactEmotionAgent` 流程改為 **平行**：`clear_used_tools → {detect_emotion, invoke_llm}`；
  `detect_emotion` 讀 `latest_user_text(state.messages)`，用專用 LLM（`init_chat_model(EMOTION_MODEL, temperature=0, max_tokens=16)`，lazy 快取在 `_emotion_llm`），結果寫進 `state.emotion` 後直接 `END`；
  `invoke_llm` 之後的工具迴圈不變，結束條件改為「沒有 tool_calls → END」（原本是 → detect_emotion）。
- `stream_react_emotion_agent`：
  - `values` 模式收到帶 `emotion` 的 state 就送 `emotion` 事件（通常在回覆文字之前到達）；記為 `turn_emotion`。
  - 第一個 `tool_chosen` 事件：若 `turn_emotion in (None, NEUTRAL)` 且 `last_emotion != THINK` → 送 `think`。
  - 第一個 `llm_start` 事件：若 `last_emotion == THINK` → 送 `turn_emotion or NEUTRAL`（切回 normal）。
  - 相同情緒不重送（既有邏輯）。
- 前端 `yanruyu.ts` `EMOTION_MAP`：刪 `anger`、加 `think: "think"`（`surprised: "think"` 維持）；延伸問題改打 `/v1/react/run`。
- 評估：`ai_librarian_core/tests/data/emotion_eval.jsonl`（每行 `{"user": …, "label": …}`），`backend/scripts/eval_emotion.py` 印準確率、各標籤 precision/recall、6×6 混淆矩陣（需金鑰，手動執行）。實作者先寫 36 筆（每標籤 6 筆，含 §3 規則 2、4、5 的邊界案例），團隊再從真實對話補到 60～100 筆。

## 5. 測試

`backend` 以 `uv run --group dev pytest` 執行（pyproject 已有 pytest；建立 `ai_librarian_core/tests/`）。單元測試不打網路：假 LLM（`with_structured_output()` 回傳可 `ainvoke` 的 stub）。

## 6. 留給實作者

- 提示詞措辭可微調，但六個標籤、七條規則不可少。
- LangGraph 平行分支寫法：`add_edge("clear_used_tools", "detect_emotion")`、`add_edge("clear_used_tools", "invoke_llm")`、`add_edge("detect_emotion", END)`；`_route` 回 `"tools"` 或 `END`。
