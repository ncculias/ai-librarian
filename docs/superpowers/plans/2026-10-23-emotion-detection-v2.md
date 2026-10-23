# 情緒判斷 v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 顏如玉依**使用者最新一句**的情緒先反應（回覆開始前就換表情），判斷標準明確、結果穩定，查資料時做思考動作，並有評估集可量測準確率。

**Architecture:** 判斷邏輯抽成 `emotion_classifier.py`（純函式 + 用 stub 可測的 async 分類函式）；`AsyncReactEmotionAgent` 把 `detect_emotion` 改成與 `invoke_llm` 平行的分支（只看使用者訊息）；API 串流在情緒 state 一出現就送事件，`tool_chosen` 時依規則補 `think`、`llm_start` 時切回；前端刪 `anger`、加 `think` 對應並把延伸問題改走無情緒 agent；評估腳本獨立於測試。

**Tech Stack:** Python 3.13、LangChain `init_chat_model` / `with_structured_output`、LangGraph、pytest（`uv run --group dev pytest`）；前端 TypeScript（`node --test`）。

**Spec:** `docs/superpowers/specs/2026-10-23-emotion-detection-v2-design.md`

## Global Constraints

- `Emotion` 列舉 = `NEUTRAL "neutral"`, `HAPPY "happy"`, `SAD "sad"`, `ANGRY "angry"`, `SURPRISED "surprised"`, `THINK "think"`；`ANGER` 刪除（全 repo grep 無殘留）。
- 分類 LLM：`EMOTION_MODEL` 預設 `"openai:gpt-5.4-mini"`（環境變數可覆蓋）、`temperature=0`、`max_tokens=16`，與聊天 `llm_config` 無關；只讀最後一則 `HumanMessage` 的前 `EMOTION_MAX_CHARS = 300` 字；空字串不呼叫 LLM、直接 `NEUTRAL`；例外/驗證失敗 → `NEUTRAL`。
- 提示詞中文，含 spec §3 的六個定義＋例句與七條規則。
- 工作流：`clear_used_tools` 同時進入 `detect_emotion`（→ END）與 `invoke_llm`（→ tools 迴圈 → END）；`detect_emotion` 不再接在回覆之後。
- 串流規則：情緒 state 出現即送（`turn_emotion`）；第一個 `tool_chosen` 且 `turn_emotion ∈ {None, NEUTRAL}` 且 `last_emotion ≠ THINK` → 送 `think`；第一個 `llm_start` 且 `last_emotion == THINK` → 送 `turn_emotion or NEUTRAL`；同值不重送；事件格式不變。
- 前端：`EMOTION_MAP` = `neutral→normal, happy→happy, angry→angry, sad→sad, surprised→think, think→think`；延伸問題 URL `/v1/react/run`。
- 單元測試不打網路；後端 `cd backend && uv run --group dev pytest -q`；前端 `cd frontend && npx tsc -b && npm test`。評估腳本需金鑰、手動執行。

## Review Focus

1. 使用者說「我最近心情很差」再問天氣（查工具）→ 情緒 sad 先送達、查工具期間**不**被 think 蓋掉、回覆開始也不切回 normal。（Task 3 單元測試 + 驗證 2）
2. 使用者 neutral 且一輪用兩個工具 → `think` 只送一次，`llm_start` 時送回 neutral 一次。（Task 3 單元測試）
3. 分類 LLM 拋例外或回傳不在列舉內 → `neutral`，主回覆串流不受影響。（Task 1 測試；Task 2 驗證）
4. 對話只有 system 訊息、沒有 HumanMessage → `latest_user_text` 回空字串、不呼叫 LLM。（Task 1 測試）
5. 舊前端收到 `think`／不再收到 `anger` → `mapEmotion("think")` 有對應、`mapEmotion("anger")` 回 null 不壞。（Task 3 前端測試）

---

### Task 1: `emotion_classifier.py` + `Emotion` 列舉整理 + 單元測試

**Files:**
- Modify: `backend/ai_librarian_monorepo/ai_librarian_core/src/ai_librarian_core/agents/react/state.py:18-24`
- Create: `backend/ai_librarian_monorepo/ai_librarian_core/src/ai_librarian_core/agents/react/emotion_classifier.py`
- Create: `backend/ai_librarian_monorepo/ai_librarian_core/tests/__init__.py`、`backend/ai_librarian_monorepo/ai_librarian_core/tests/test_emotion_classifier.py`
- Modify: 所有引用 `Emotion.ANGER` 的地方（`grep -rn "ANGER\b\|\"anger\"" backend --include=*.py`）

**Interfaces:**
- Produces:
  ```python
  EMOTION_MODEL: str; EMOTION_MAX_CHARS: int = 300; EMOTION_PROMPT: str
  class EmotionOutput(BaseModel): emotion: Emotion      # 從 asynchronous_emotion.py 搬來
  def latest_user_text(messages: Sequence[BaseMessage]) -> str
  def build_emotion_input(user_text: str) -> str
  async def classify_emotion(llm, user_text: str) -> Emotion
  ```

- [ ] **Step 1: 寫失敗測試** `tests/test_emotion_classifier.py`

```python
import asyncio
from langchain_core.messages import AIMessage, HumanMessage, SystemMessage, ToolMessage
from ai_librarian_core.agents.react.emotion_classifier import (
    EMOTION_MAX_CHARS, EMOTION_PROMPT, EmotionOutput, build_emotion_input, classify_emotion, latest_user_text,
)
from ai_librarian_core.agents.react.state import Emotion


class _Structured:
    def __init__(self, result): self.result = result; self.calls = 0
    async def ainvoke(self, _prompt):
        self.calls += 1
        if isinstance(self.result, Exception): raise self.result
        return self.result


class _FakeLLM:
    def __init__(self, result): self.structured = _Structured(result)
    def with_structured_output(self, _schema): return self.structured


def test_latest_user_text_takes_last_human_message_only():
    msgs = [SystemMessage("sys"), HumanMessage("舊問題"), AIMessage("舊回覆"), HumanMessage("我最近心情很差"),
            AIMessage("", tool_calls=[{"name": "x", "args": {}, "id": "1"}]), ToolMessage("輸出", tool_call_id="1")]
    assert latest_user_text(msgs) == "我最近心情很差"
    assert latest_user_text([SystemMessage("sys")]) == ""
    assert latest_user_text([]) == ""


def test_build_emotion_input_truncates_and_contains_prompt_and_labels():
    text = build_emotion_input("使" * 500)
    assert text.startswith(EMOTION_PROMPT)
    assert text.count("使") == EMOTION_MAX_CHARS
    for label in ("happy", "sad", "angry", "surprised", "think", "neutral"):
        assert label in EMOTION_PROMPT
    for rule in ("最新", "禮貌", "拿不準"):
        assert rule in EMOTION_PROMPT


def test_emotion_enum_has_no_anger_and_has_think():
    assert {e.value for e in Emotion} == {"neutral", "happy", "sad", "angry", "surprised", "think"}


def test_classify_emotion_returns_model_label():
    assert asyncio.run(classify_emotion(_FakeLLM(EmotionOutput(emotion=Emotion.THINK)), "我在想要不要讀")) == Emotion.THINK
    assert asyncio.run(classify_emotion(_FakeLLM({"emotion": "sad"}), "心情很差")) == Emotion.SAD


def test_classify_emotion_falls_back_to_neutral_and_skips_empty():
    assert asyncio.run(classify_emotion(_FakeLLM(RuntimeError("boom")), "q")) == Emotion.NEUTRAL
    assert asyncio.run(classify_emotion(_FakeLLM({"emotion": "ecstatic"}), "q")) == Emotion.NEUTRAL
    llm = _FakeLLM({"emotion": "happy"})
    assert asyncio.run(classify_emotion(llm, "   ")) == Emotion.NEUTRAL
    assert llm.structured.calls == 0
```

- [ ] **Step 2: 跑測試確認失敗**：`cd backend && uv run --group dev pytest -q ai_librarian_monorepo/ai_librarian_core/tests` → FAIL

- [ ] **Step 3: 實作**

- `state.py`：列舉改為 `NEUTRAL, HAPPY, SAD, ANGRY, SURPRISED, THINK`（刪 `ANGER`）；修掉其他引用。
- `emotion_classifier.py`：`EMOTION_PROMPT` 照 spec §3（開頭說明 + 六行定義與例句 + 七條規則）；`latest_user_text` 從後往前找第一個 `HumanMessage`（content 若是 list 取其中 text 部分合併）；`build_emotion_input` = `f"{EMOTION_PROMPT}\n\n使用者最新的一句話：{text[:EMOTION_MAX_CHARS]}\n\n只回傳 emotion 欄位。"`；`classify_emotion`：`text.strip()` 為空 → `NEUTRAL`；否則 `structured = llm.with_structured_output(EmotionOutput)`、`await structured.ainvoke(...)`，接受 `EmotionOutput` / dict / 有 `.emotion` 的物件，`Emotion(value)` 失敗或任何例外 → `NEUTRAL`。
- `EmotionOutput` 搬到此模組；`asynchronous_emotion.py` 改從這裡 import（Task 2 再改流程，本任務只確保可 import、測試可過）。

- [ ] **Step 4: 驗證**：測試全綠；`grep -rn "ANGER\b" backend --include=*.py` 為 0；`uv run ruff check` 無新錯誤。

- [ ] **Step 5: Commit**
```bash
git add backend/ai_librarian_monorepo/ai_librarian_core/src/ai_librarian_core/agents/react/state.py backend/ai_librarian_monorepo/ai_librarian_core/src/ai_librarian_core/agents/react/emotion_classifier.py backend/ai_librarian_monorepo/ai_librarian_core/src/ai_librarian_core/agents/react/asynchronous_emotion.py backend/ai_librarian_monorepo/ai_librarian_core/tests
git commit -m "feat(core): user-message emotion classifier with Chinese criteria; merge anger into angry; add think"
```

---

### Task 2: `detect_emotion` 改為與回覆平行、只看使用者訊息

**Files:**
- Modify: `backend/ai_librarian_monorepo/ai_librarian_core/src/ai_librarian_core/agents/react/asynchronous_emotion.py:46-121`（`_detect_emotion`、`_route`、`_init_workflow`）
- Create: `backend/ai_librarian_monorepo/ai_librarian_core/tests/test_asynchronous_emotion.py`

**Interfaces:**
- Consumes: Task 1。
- Produces: `AsyncReactEmotionAgent._emotion_llm`（lazy，`init_chat_model(EMOTION_MODEL, temperature=0, max_tokens=16)`，測試可直接指定為 `_FakeLLM`）；`_route` 回 `"tools"` 或 `END`。

- [ ] **Step 1: 寫失敗測試**

```python
def test_detect_emotion_reads_latest_user_message(monkeypatch):
    agent = AsyncReactEmotionAgent(tools=[])
    agent._emotion_llm = _FakeLLM({"emotion": "sad"})
    state = MessagesEmotionState(messages=[HumanMessage("我最近心情很差"), AIMessage("我在這裡陪你。")])
    assert asyncio.run(agent._detect_emotion(state)) == {"emotion": Emotion.SAD}


def test_workflow_runs_detect_emotion_in_parallel_with_llm():
    agent = AsyncReactEmotionAgent(tools=[])
    graph = agent.workflow.get_graph()
    edges = {(e.source, e.target) for e in graph.edges}
    assert ("clear_used_tools", "detect_emotion") in edges
    assert ("clear_used_tools", "invoke_llm") in edges
    assert ("detect_emotion", "__end__") in edges
    assert not any(src == "invoke_llm" and dst == "detect_emotion" for src, dst in edges)
```

- [ ] **Step 2: 實作**：`_detect_emotion` → `{"emotion": await classify_emotion(self._emotion_llm, latest_user_text(state.messages))}`；`_route` 的非工具分支回 `END`（`Literal["tools", "__end__"]`）；`_init_workflow` 照 spec §6 的平行邊；`_emotion_llm` 用 `functools.cached_property`（dataclass 可用）或 `__post_init__` 內設 `None` + 首次使用時建立。`run()` 仍回傳 `result["emotion"]`。

- [ ] **Step 3: 驗證**：`uv run --group dev pytest -q`；本機 `docker compose up -d --build backend` 後，在聊天頁送「我最近心情很差」：`docker logs` 看到分類請求（`gpt-5.4-mini`、`temperature: 0`）與主回覆請求幾乎同時發出；前端 emotion 標籤在回覆文字出現前就變 sad。

- [ ] **Step 4: Commit**
```bash
git add backend/ai_librarian_monorepo/ai_librarian_core/src/ai_librarian_core/agents/react/asynchronous_emotion.py backend/ai_librarian_monorepo/ai_librarian_core/tests
git commit -m "feat(core): detect user emotion in parallel with the reply, before any text streams"
```

---

### Task 3: 串流規則（情緒先送、think 補送與切回）；前端對應與延伸問題改路由

**Files:**
- Modify: `backend/ai_librarian_monorepo/ai_librarian_apis/src/ai_librarian_apis/routes/react.py:243-330`（`stream_react_emotion_agent`）
- Create: `backend/ai_librarian_monorepo/ai_librarian_apis/tests/__init__.py`、`backend/ai_librarian_monorepo/ai_librarian_apis/tests/test_emotion_stream_rules.py`
- Modify: `frontend/src/components/live2d/yanruyu.ts:20-27`、`frontend/src/components/live2d/yanruyu.test.ts`、`frontend/src/hooks/useLLMStream.ts:153`

**Interfaces:**
- Produces（apis）：純函式 `next_emotion_events(kind: Literal["state","tool_chosen","llm_start"], value: Emotion | None, turn: Emotion | None, last: Emotion | None) -> tuple[list[Emotion], Emotion | None, Emotion | None]` 回傳（要送的情緒列表、新的 turn、新的 last），放在 `routes/react.py` 或新檔 `services/emotion_rules.py`，串流路由只呼叫它。

- [ ] **Step 1: 寫失敗測試**（規則表，對應 spec §4）

```python
from ai_librarian_apis.services.emotion_rules import next_emotion_events as nxt
from ai_librarian_core.agents.react.state import Emotion as E

def test_state_emotion_is_sent_once():
    assert nxt("state", E.SAD, None, None) == ([E.SAD], E.SAD, E.SAD)
    assert nxt("state", E.SAD, E.SAD, E.SAD) == ([], E.SAD, E.SAD)

def test_think_only_when_turn_is_neutral_and_only_once():
    assert nxt("tool_chosen", None, None, None) == ([E.THINK], None, E.THINK)
    assert nxt("tool_chosen", None, E.NEUTRAL, E.NEUTRAL) == ([E.THINK], E.NEUTRAL, E.THINK)
    assert nxt("tool_chosen", None, E.SAD, E.SAD) == ([], E.SAD, E.SAD)
    assert nxt("tool_chosen", None, E.NEUTRAL, E.THINK) == ([], E.NEUTRAL, E.THINK)

def test_llm_start_switches_back_from_think():
    assert nxt("llm_start", None, E.NEUTRAL, E.THINK) == ([E.NEUTRAL], E.NEUTRAL, E.NEUTRAL)
    assert nxt("llm_start", None, None, E.THINK) == ([E.NEUTRAL], None, E.NEUTRAL)
    assert nxt("llm_start", None, E.SAD, E.SAD) == ([], E.SAD, E.SAD)
```

- [ ] **Step 2: 實作**：`services/emotion_rules.py` 純函式；串流路由：`values` 模式只要 state 有 `emotion` 就走 `"state"`；`_process_ai_message` 產生 `TOOL_CHOSEN`（`message.tool_calls` 非空）後走 `"tool_chosen"`；產生 `LLM_START`（`has_llm_started` 由 False 變 True）後走 `"llm_start"`；每個回傳的情緒各 yield 一個 `EMOTION` 事件。移除原本「`langgraph_node == detect_emotion` 才 `emotion_ready`」的門檻。
- [ ] **Step 3: 前端**：`EMOTION_MAP` 刪 `anger`、加 `think: "think"`；測試改 `assert.equal(mapEmotion("anger"), null)`、加 `assert.equal(mapEmotion("think"), "think")`；`requestFollowUps` URL → `/v1/react/run`。
- [ ] **Step 4: 驗證**：前端 `npx tsc -b && npm test`；後端 `uv run --group dev pytest -q`；重建後端後在瀏覽器：
  1. 「請幫我查今天台北的天氣」→ 送出後立刻 neutral、查工具時 think（托腮）、回覆開始切回 normal。
  2. 「我最近心情很差，幫我查台北天氣」→ 立刻 sad，查工具與回覆期間維持 sad。（Review Focus 1）
  3. 「你好」→ 沒有 think。
  4. `docker logs` 確認 `/v1/react/run` 不觸發分類請求。
- [ ] **Step 5: Commit**
```bash
git add backend/ai_librarian_monorepo/ai_librarian_apis/src/ai_librarian_apis frontend/src/components/live2d/yanruyu.ts frontend/src/components/live2d/yanruyu.test.ts frontend/src/hooks/useLLMStream.ts backend/ai_librarian_monorepo/ai_librarian_apis/tests
git commit -m "feat(emotion): send user emotion before the reply, think while tools run; follow-ups skip detection"
```

---

### Task 4: 評估集與腳本，記錄基準

**Files:**
- Create: `backend/ai_librarian_monorepo/ai_librarian_core/tests/data/emotion_eval.jsonl`（36 筆：每標籤 6 筆，`{"user","label"}`，含規則 2/4/5 的邊界案例）
- Create: `backend/scripts/eval_emotion.py`
- Modify: `backend/ai_librarian_monorepo/ai_librarian_core/README.md`（加「情緒判斷評估」一節：標註準則連結 spec §3、怎麼跑、基準數字）

- [ ] **Step 1: 腳本**：讀 jsonl → 逐筆 `classify_emotion(init_chat_model(EMOTION_MODEL, temperature=0, max_tokens=16), user)` → 印整體準確率、每標籤 precision/recall、6×6 混淆矩陣（純文字）；參數 `--limit N`、`--model`、`--show-errors`（列出判錯的句子）。
- [ ] **Step 2: 樣本**：36 筆，邊界案例至少：「有沒有關於喪親的書」→ neutral、「謝謝」→ neutral、「嗯」→ neutral、「我媽媽走了，想找書看」→ sad、「什麼？絕版了？」→ surprised、「不知道該選哪本」→ think。
- [ ] **Step 3: 跑基準**：`cd backend && uv run python scripts/eval_emotion.py --show-errors`（需 `OPENAI_API_KEY`），把準確率與混淆矩陣貼進 README 作為 v2 基準；判錯的句子列進報告供調整提示詞。
- [ ] **Step 4: Commit**
```bash
git add backend/ai_librarian_monorepo/ai_librarian_core/tests/data/emotion_eval.jsonl backend/scripts/eval_emotion.py backend/ai_librarian_monorepo/ai_librarian_core/README.md
git commit -m "feat(emotion): labelled evaluation set (user sentences) and accuracy/confusion script with v2 baseline"
```
