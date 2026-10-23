# 情緒判斷 v2 設計（顏如玉表情的後端判斷）

日期：2026-10-23
範圍：後端 `ai_librarian_core`（判斷邏輯）、`ai_librarian_apis`（串流事件）、前端一小段對應；加一份評估資料與腳本。
相關：`2026-10-18-yanruyu-live2d-integration-design.md`（前端情緒→動作對應）。

## 1. 現況與問題

`AsyncReactEmotionAgent._detect_emotion` 在回覆完成後，把最後 3 則訊息串成英文提示詞
「detect the emotion from the chat history」，用**與聊天相同的模型與溫度（0.7）**做結構化輸出，
標籤 `anger/sad/happy/neutral/angry/surprised`。問題：

- 沒定義「判斷誰的情緒」與各標籤的標準，模型只能猜；溫度 0.7 使同一段對話重跑結果不一。
- 輸入混了前一則與工具輸出，噪音多。
- 只在回覆完成後判斷，角色永遠在文字出完後才變臉；查資料時沒有反應。
- 產生延伸問題的 `/v2/react/run` 也跑一次判斷，結果沒人用（每輪白花一次呼叫）。
- 沒有任何量測，不知道準不準。

## 2. 目標 / 非目標

目標
- 判斷有明確標準（中文提示詞、每個標籤有定義與例句、拿不準一律 neutral），溫度 0，固定用便宜模型。
- 只看「使用者這一句 + AI 這一則回覆」（各截前 300 字）。
- 查工具時立刻送出 `think`，讓顏如玉邊查邊做思考動作；回覆完再送最終情緒。
- 延伸問題改走不帶情緒判斷的 agent。
- 有一份人工標註的評估集與腳本，能算準確率與混淆矩陣；本次先建立基準數字。
- API 相容：`emotion` 事件格式不變；既有六個標籤值保留，新增 `think`。

非目標
- 不改回覆模型的輸出格式（不走「主模型自標情緒」那條路，留作 v3 選項）。
- 不訓練自己的分類模型。
- 不做「使用者送出時先判使用者情緒」（可在 v3 以同一個 classifier 加上）。

## 3. 判斷標準（提示詞內容，中文）

判斷對象：**AI 館員這則回覆對使用者表現出的情緒態度**；若使用者明顯在表達難過或憤怒，
館員應呈現陪伴（sad）或嚴肅（angry），以使用者情緒為優先。

| 標籤 | 定義 | 例 |
|---|---|---|
| happy | 回覆帶正向情緒：恭喜、分享好消息、使用者開心而館員回應熱情 | 「太好了，恭喜你找到這本書！」 |
| sad | 使用者表達失落、生病、過世、孤單，或回覆在安慰、致歉 | 「聽到這件事我也覺得難過，…」 |
| angry | 使用者明顯憤怒或抱怨且回覆嚴肅處理；或回覆嚴正拒絕不當要求 | 「我無法協助這類內容。」 |
| surprised | 回覆對意外的資訊表達驚訝（哇、沒想到、真的嗎） | 「沒想到這本書已經再版十次！」 |
| think | 回覆表示需要查證、資訊不足而提出釐清問題、或正在整理複雜問題 | 「我需要再確認一下，請問你指的是…？」 |
| neutral | 一般資訊性回答；以上都不明確時一律 neutral | 「今天台北 24 度，降雨機率 10%。」 |

規則：只回傳一個標籤；拿不準回 neutral；不要因為回覆有禮貌用語就判 happy。

## 4. 架構

- 新模組 `ai_librarian_core/agents/react/emotion_classifier.py`：
  - `EMOTION_PROMPT`（§3 文字）、`EMOTION_MODEL = "openai:gpt-5.4-mini"`（可用環境變數 `EMOTION_MODEL` 覆蓋）、
    `EMOTION_MAX_CHARS = 300`。
  - `build_emotion_input(user_text: str, reply_text: str) -> str`（純函式，截字、組版）。
  - `pick_turn(messages) -> tuple[str, str]`（純函式：最後一則 HumanMessage 與最後一則 AIMessage 的 content，缺則空字串）。
  - `async classify_emotion(llm, user_text, reply_text) -> Emotion`：`llm.with_structured_output(EmotionOutput)`，
    任何例外或驗證失敗 → `Emotion.NEUTRAL`。
- `Emotion` 列舉新增 `THINK = "think"`（`state.py`）。
- `AsyncReactEmotionAgent._detect_emotion` 改為：`user, reply = pick_turn(state.messages)`；
  LLM 由 `init_chat_model(EMOTION_MODEL, temperature=0, max_tokens=16)` 建立並快取；呼叫 `classify_emotion`。
- `stream_react_emotion_agent`：第一次產生 `tool_chosen` 事件時，額外 yield 一個 `emotion: think` 事件
  （`last_emotion = THINK`）；之後 `detect_emotion` 的結果照常送出（與 think 不同就會送）。
- 前端 `yanruyu.ts` `EMOTION_MAP` 加 `think: "think"`；延伸問題改打 `/v1/react/run`。
- 評估：`ai_librarian_core/tests/data/emotion_eval.jsonl`（每行 `{"user": …, "reply": …, "label": …}`），
  `backend/scripts/eval_emotion.py` 讀檔逐筆呼叫 classifier，印準確率與 6×6 混淆矩陣（需 API 金鑰，手動執行）。
  先由實作者寫 30 筆涵蓋六個標籤的中文樣本（每標籤 5 筆），之後團隊從下載的真實對話補到 60～100 筆。

## 5. 測試

`backend` 以 `uv run --group dev pytest` 執行（pyproject 已有 pytest；目前沒有 tests 目錄，本案建立
`ai_librarian_core/tests/`）。單元測試不打網路：用假的 LLM 物件（`with_structured_output()` 回傳可 `ainvoke`
的 stub）。

## 6. 留給實作者

- 提示詞措辭可微調，但六個標籤與「拿不準回 neutral」不可動。
- `_llm_cache` 已存在於 `BaseReactAgent`，classifier 的 LLM 另用一個屬性快取即可。
