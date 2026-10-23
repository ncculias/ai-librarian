import asyncio
import json

from ai_librarian_apis.routes import react as react_routes
from ai_librarian_core.agents.react.state import Emotion
from fastapi import FastAPI
from fastapi.testclient import TestClient
from langchain_core.messages import AIMessageChunk


def _msg(node: str, content: str, **kwargs):
    return "messages", (AIMessageChunk(content=content, **kwargs), {"langgraph_node": node})


class _FakeAgent:
    def __init__(self, items):
        self.items = items

    async def stream(self, *_args, **_kwargs):
        async def gen():
            for delay, item in self.items:
                await asyncio.sleep(delay)
                yield item

        return gen()


def _events(items, monkeypatch, hold: float | None = None):
    monkeypatch.setattr(react_routes, "react_emotion_agent", _FakeAgent(items))
    if hold is not None:
        monkeypatch.setattr(react_routes, "EMOTION_HOLD_SECONDS", hold)
    app = FastAPI()
    app.include_router(react_routes.react_emotion_router, prefix="/v2")
    body = {"messages": [{"role": "user", "content": "hi"}], "thread_id": "t"}
    with TestClient(app) as client:
        text = client.post("/v2/react/stream", json=body).text
    out = []
    for block in text.split("\n\n"):
        lines = dict(line.split(": ", 1) for line in block.splitlines() if ": " in line)
        if "event" in lines:
            data = json.loads(lines["data"])
            out.append(f"emotion:{data['emotion']}" if lines["event"] == "emotion" else lines["event"])
    return out


def test_emotion_precedes_reply_even_when_classifier_is_slower(monkeypatch):
    items = [
        (0, _msg("invoke_llm", "你好")),
        (0, _msg("invoke_llm", "嗎")),
        (0.05, _msg("detect_emotion", '{"emotion":"sad"}')),
        (0, ("values", {"emotion": Emotion.SAD})),
    ]
    assert _events(items, monkeypatch) == ["emotion:sad", "llm_start", "llm_delta"]


def test_reply_is_released_after_timeout_and_state_emotion_still_arrives(monkeypatch):
    items = [
        (0, _msg("invoke_llm", "你好")),
        (0.3, ("values", {"emotion": Emotion.NEUTRAL})),
    ]
    assert _events(items, monkeypatch, hold=0.05) == ["llm_start", "emotion:neutral"]
