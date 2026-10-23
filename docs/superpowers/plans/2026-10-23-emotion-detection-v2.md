# 情緒判斷 v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 顏如玉的情緒判斷有明確標準、結果穩定、查工具時立刻做思考動作，並有評估集可量測準確率。

**Architecture:** 判斷邏輯抽成 `emotion_classifier.py`（純函式 + 一個用 stub 可測的 async 分類函式）；`AsyncReactEmotionAgent._detect_emotion` 只負責挑訊息與呼叫；API 串流在 `tool_chosen` 時多送一個 `think` 情緒事件；前端加一個對應並把延伸問題改走無情緒 agent；評估腳本獨立於測試。

**Tech Stack:** Python 3.13、LangChain `init_chat_model` / `with_structured_output`、LangGraph、pytest（`uv run --group dev pytest`）；前端 TypeScript（`node --test`）。

**Spec:** `docs/superpowers/specs/2026-10-23-emotion-detection-v2-design.md`

## Global Constraints

- 標籤：`neutral / happy / sad / angry / surprised / think`；`Emotion` 列舉保留既有值（含 `anger`），新增 `THINK = "think"`。分類器只會輸出這六個；例外或驗證失敗 → `NEUTRAL`。
- 分類用 LLM：`EMOTION_MODEL` 預設 `"openai:gpt-5.4-mini"`（環境變數可覆蓋）、`temperature=0`、`max_tokens=16`，與聊天的 `llm_config` 無關。
- 輸入只取最後一則 HumanMessage 與最後一則 AIMessage，各截前 `EMOTION_MAX_CHARS = 300` 字。
- 提示詞為中文、含 §3 的六個定義與「拿不準回 neutral」。
- 串流：第一個 `tool_chosen` 事件之後立刻 yield `emotion=think`（同一輪只送一次）；`detect_emotion` 結果與上一次不同才送（既有邏輯）。
- `emotion` SSE 事件格式不變。
- 前端：`EMOTION_MAP` 加 `think: "think"`（`surprised` 維持 `think`）；延伸問題 URL 改 `/v1/react/run`。
- 單元測試不打網路；後端測試指令 `cd backend && uv run --group dev pytest -q`；前端 `cd frontend && npx tsc -b && npm test`。
- 評估腳本需要金鑰、手動執行，不進測試。

## Review Focus

1. 回覆沒有工具呼叫（純聊天）→ 不會送 `think`，只送最終情緒。（Task 3 驗證 2）
2. 一輪用了兩個工具 → `think` 只送一次。（Task 3 單元測試）
3. 分類 LLM 回傳不在列舉內或拋例外 → `neutral`，串流不中斷。（Task 1 測試）
4. 對話裡沒有 AIMessage（例如 LLM 失敗）→ `pick_turn` 回空字串、分類回 `neutral`，不丟例外。（Task 1 測試）
5. 舊前端（沒有 `think` 對應）收到 `think` → `mapEmotion` 回 null、忽略，不壞。（Task 3：前端測試 `mapEmotion("think")`）

---

### Task 1: `emotion_classifier.py` + `Emotion.THINK` + 單元測試

**Files:**
- Modify: `backend/ai_librarian_monorepo/ai_librarian_core/src/ai_librarian_core/agents/react/state.py:18-24`（加 `THINK = "think"`）
- Create: `backend/ai_librarian_monorepo/ai_librarian_core/src/ai_librarian_core/agents/react/emotion_classifier.py`
- Create: `backend/ai_librarian_monorepo/ai_librarian_core/tests/__init__.py`（空）、`backend/ai_librarian_monorepo/ai_librarian_core/tests/test_emotion_classifier.py`

**Interfaces:**
- Produces:
  ```python
  EMOTION_MODEL: str            # os.environ.get("EMOTION_MODEL", "openai:gpt-5.4-mini")
  EMOTION_MAX_CHARS: int = 300
  EMOTION_PROMPT: str           # 中文，含六個標籤定義
  class EmotionOutput(BaseModel): emotion: Emotion   # 從 asynchronous_emotion.py 搬來
  def pick_turn(messages: Sequence[BaseMessage]) -> tuple[str, str]
  def build_emotion_input(user_text: str, reply_text: str) -> str
  async def classify_emotion(llm, user_text: str, reply_text: str) -> Emotion
  ```

- [ ] **Step 1: 寫失敗測試** `tests/test_emotion_classifier.py`

```python
import pytest
from langchain_core.messages import AIMessage, HumanMessage, ToolMessage
from ai_librarian_core.agents.react.emotion_classifier import (
    EMOTION_MAX_CHARS, EMOTION_PROMPT, build_emotion_input, classify_emotion, pick_turn,
)
from ai_librarian_core.agents.react.state import Emotion


class _Structured:
    def __init__(self, result): self.result = result
    async def ainvoke(self, _prompt):
        if isinstance(self.result, Exception): raise self.result
        return self.result


class _FakeLLM:
    def __init__(self, result): self.result = result
    def with_structured_output(self, _schema): return _Structured(self.result)


def test_pick_turn_takes_last_human_and_last_ai_and_ignores_tools():
    msgs = [HumanMessage("舊問題"), AIMessage("舊回覆"), HumanMessage("我最近很難過"),
            AIMessage("", tool_calls=[{"name": "x", "args": {}, "id": "1"}]), ToolMessage("輸出", tool_call_id="1"),
            AIMessage("聽到這件事我也覺得難過。")]
    assert pick_turn(msgs) == ("我最近很難過", "聽到這件事我也覺得難過。")


def test_pick_turn_without_ai_message_returns_empty_reply():
    assert pick_turn([HumanMessage("哈囉")]) == ("哈囉", "")
    assert pick_turn([]) == ("", "")


def test_build_emotion_input_truncates_and_contains_prompt_and_labels():
    text = build_emotion_input("使" * 500, "回" * 500)
    assert text.startswith(EMOTION_PROMPT)
    assert text.count("使") == EMOTION_MAX_CHARS and text.count("回") == EMOTION_MAX_CHARS
    for label in ("happy", "sad", "angry", "surprised", "think", "neutral"):
        assert label in EMOTION_PROMPT


@pytest.mark.asyncio
async def test_classify_emotion_returns_model_label():
    from ai_librarian_core.agents.react.emotion_classifier import EmotionOutput
    assert await classify_emotion(_FakeLLM(EmotionOutput(emotion=Emotion.THINK)), "q", "a") == Emotion.THINK
    assert await classify_emotion(_FakeLLM({"emotion": "sad"}), "q", "a") == Emotion.SAD


@pytest.mark.asyncio
async def test_classify_emotion_falls_back_to_neutral():
    assert await classify_emotion(_FakeLLM(RuntimeError("boom")), "q", "a") == Emotion.NEUTRAL
    assert await classify_emotion(_FakeLLM({"emotion": "ecstatic"}), "q", "a") == Emotion.NEUTRAL
    assert await classify_emotion(_FakeLLM(None), "", "") == Emotion.NEUTRAL
```
（若 `pytest-asyncio` 未安裝：改用 `asyncio.run(...)` 包住 await，不新增依賴。）

- [ ] **Step 2: 跑測試確認失敗**：`cd backend && uv run --group dev pytest -q ai_librarian_monorepo/ai_librarian_core/tests` → FAIL（module not found）

- [ ] **Step 3: 實作**

- `state.py`：`THINK = "think"` 加在列舉最後。
- `emotion_classifier.py`：`EMOTION_PROMPT` 照 spec §3 的表格寫成中文段落（判斷對象 + 六個定義各一行例句 + 規則）；`pick_turn` 從後往前找第一個 `HumanMessage` 與第一個 `content` 非空的 `AIMessage`；`build_emotion_input` = `f"{EMOTION_PROMPT}\n\n使用者：{user[:300]}\n館員回覆：{reply[:300]}\n\n只回傳 emotion 欄位。"`；`classify_emotion`：`structured = llm.with_structured_output(EmotionOutput)`，`result = await structured.ainvoke(build_emotion_input(...))`，接受 `EmotionOutput`、dict（取 `emotion`）或帶 `.emotion` 屬性的物件，`Emotion(value)` 失敗或任何例外 → `NEUTRAL`。
- `EmotionOutput` 搬到此模組，`asynchronous_emotion.py` 改從這裡 import（Task 2 再接線，本任務只確保可 import）。

- [ ] **Step 4: 驗證**：測試全綠；`uv run ruff check` 與 `pyright`（若專案有設定）無新錯誤。

- [ ] **Step 5: Commit**
```bash
git add backend/ai_librarian_monorepo/ai_librarian_core/src/ai_librarian_core/agents/react/state.py backend/ai_librarian_monorepo/ai_librarian_core/src/ai_librarian_core/agents/react/emotion_classifier.py backend/ai_librarian_monorepo/ai_librarian_core/tests
git commit -m "feat(core): emotion classifier with Chinese criteria, fixed cheap model, think label"
```

---

### Task 2: `_detect_emotion` 接上分類器

**Files:**
- Modify: `backend/ai_librarian_monorepo/ai_librarian_core/src/ai_librarian_core/agents/react/asynchronous_emotion.py:17-19`（刪本地 `EmotionOutput`，改 import）、`:46-80`（重寫 `_detect_emotion`）
- Modify: `backend/ai_librarian_monorepo/ai_librarian_core/tests/test_emotion_classifier.py`（加一個 agent 層測試，或新檔 `test_asynchronous_emotion.py`）

**Interfaces:**
- Consumes: Task 1 全部。
- Produces: `AsyncReactEmotionAgent._emotion_llm` 屬性（lazy，`init_chat_model(EMOTION_MODEL, temperature=0, max_tokens=16)`），可在測試中被替換成 `_FakeLLM`。

- [ ] **Step 1: 寫失敗測試**

```python
@pytest.mark.asyncio
async def test_detect_emotion_uses_classifier_on_last_turn(monkeypatch):
    agent = AsyncReactEmotionAgent(tools=[])
    agent._emotion_llm = _FakeLLM({"emotion": "sad"})       # 不碰網路
    state = MessagesEmotionState(messages=[HumanMessage("我最近很難過"), AIMessage("我在這裡陪你。")])
    assert await agent._detect_emotion(state) == {"emotion": Emotion.SAD}
```

- [ ] **Step 2: 實作**：`_detect_emotion`：`user, reply = pick_turn(state.messages)`；`return {"emotion": await classify_emotion(self._emotion_llm, user, reply)}`。`_emotion_llm` 用 `functools.cached_property` 或 `__post_init__` 內 lazy 屬性；不再使用 `state.llm_config`。

- [ ] **Step 3: 驗證**：`uv run --group dev pytest -q`；本機 Docker 後端重建（`docker compose up -d --build backend`）後問一句「我今天心情很差」，`docker logs` 看到分類請求用的是 `gpt-5.4-mini`、`temperature: 0`，前端收到 `emotion` 事件。

- [ ] **Step 4: Commit**
```bash
git add backend/ai_librarian_monorepo/ai_librarian_core/src/ai_librarian_core/agents/react/asynchronous_emotion.py backend/ai_librarian_monorepo/ai_librarian_core/tests
git commit -m "feat(core): detect_emotion judges only the last turn with the dedicated classifier"
```

---

### Task 3: 查工具時送 `think`；前端對應與延伸問題改路由

**Files:**
- Modify: `backend/ai_librarian_monorepo/ai_librarian_apis/src/ai_librarian_apis/routes/react.py:243-330`（`stream_react_emotion_agent`）
- Modify: `frontend/src/components/live2d/yanruyu.ts:20-27`、`frontend/src/components/live2d/yanruyu.test.ts`、`frontend/src/hooks/useLLMStream.ts:153`

**Interfaces:**
- Consumes: `Emotion.THINK`。

- [ ] **Step 1: 後端**：在 `mode == "messages"` 分支，當 `_process_ai_message` 回傳的事件是 `TOOL_CHOSEN`（判斷方式：`message.tool_calls` 非空）且 `last_emotion is not Emotion.THINK`，先 yield 該事件，再 yield 一個 `EMOTION` 事件 `emotion=Emotion.THINK`，並設 `last_emotion = Emotion.THINK`。（`detect_emotion` 之後的最終情緒與 think 不同時照常送出。）
- [ ] **Step 2: 前端**：`EMOTION_MAP` 加 `think: "think"`；測試加 `assert.equal(mapEmotion("think"), "think")`；`requestFollowUps` 的 URL 改為 `${API_BASE}/v1/react/run`（`react_router` 的 `/run` 存在，見 `react.py:51`）。
- [ ] **Step 3: 驗證**：前端 `npx tsc -b && npm test`；後端重建後在瀏覽器：
  1. 問「請幫我查詢今天台北的天氣」→ 查工具期間顏如玉做思考動作（emotion 標籤顯示 think），回覆完切到最終情緒（多半 neutral）。
  2. 問「你好」（不查工具）→ 沒有 think，直接最終情緒。（Review Focus 1）
  3. `docker logs` 確認 `/v1/react/run` 不再觸發分類請求。
- [ ] **Step 4: Commit**
```bash
git add backend/ai_librarian_monorepo/ai_librarian_apis/src/ai_librarian_apis/routes/react.py frontend/src/components/live2d/yanruyu.ts frontend/src/components/live2d/yanruyu.test.ts frontend/src/hooks/useLLMStream.ts
git commit -m "feat(emotion): emit think while tools run; follow-up questions skip emotion detection"
```

---

### Task 4: 評估集與腳本，記錄基準

**Files:**
- Create: `backend/ai_librarian_monorepo/ai_librarian_core/tests/data/emotion_eval.jsonl`（30 筆：每標籤 5 筆中文樣本，`{"user","reply","label"}`）
- Create: `backend/scripts/eval_emotion.py`
- Modify: `backend/ai_librarian_monorepo/ai_librarian_core/README.md`（加「情緒判斷評估」一節：怎麼標、怎麼跑）

- [ ] **Step 1: 腳本**：讀 jsonl → 對每筆呼叫 `classify_emotion(init_chat_model(EMOTION_MODEL, temperature=0, max_tokens=16), user, reply)` → 印整體準確率、每標籤的 precision/recall、6×6 混淆矩陣（純文字表格）；參數 `--limit N`、`--model`。
- [ ] **Step 2: 樣本**：30 筆涵蓋六標籤，含 5 筆刻意的邊界案例（禮貌用語但內容中性 → neutral；使用者難過但回覆在查資料 → sad）。
- [ ] **Step 3: 跑一次基準**：`cd backend && uv run python scripts/eval_emotion.py`（需 `OPENAI_API_KEY`）；把準確率與混淆矩陣貼進 README 該節作為 v2 基準。
- [ ] **Step 4: Commit**
```bash
git add backend/ai_librarian_monorepo/ai_librarian_core/tests/data/emotion_eval.jsonl backend/scripts/eval_emotion.py backend/ai_librarian_monorepo/ai_librarian_core/README.md
git commit -m "feat(emotion): labelled evaluation set and accuracy/confusion script with v2 baseline"
```
