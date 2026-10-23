import asyncio
import json

from ai_librarian_apis.routes import react as react_routes
from ai_librarian_core.agents.react.state import Emotion
from fastapi import FastAPI, Request
from fastapi.testclient import TestClient
from langchain_core.messages import AIMessageChunk, ToolMessage


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


def test_switches_back_from_think_on_first_content_after_tool(monkeypatch):
    items = [
        (0, _msg("detect_emotion", '{"emotion":"neutral"}')),
        (0, _msg("invoke_llm", "好的，我幫你查")),  # preamble -> llm_start
        (0, _msg("invoke_llm", "", tool_call_chunks=[], tool_calls=[{"name": "weather", "args": {}, "id": "1"}])),
        (0, ("messages", (ToolMessage(content="25C", name="weather", tool_call_id="1"), {"langgraph_node": "tools"}))),
        (0, _msg("invoke_llm", "今天")),  # llm_delta, must still leave think
        (0, _msg("invoke_llm", "晴天")),
    ]
    emotions = [e for e in _events(items, monkeypatch) if e.startswith("emotion:")]
    assert emotions == ["emotion:neutral", "emotion:think", "emotion:neutral"]


def test_client_disconnect_with_chunk_in_flight_does_not_raise(monkeypatch):
    calls = {"n": 0}

    async def fake_is_disconnected(self):
        calls["n"] += 1
        return calls["n"] >= 3

    monkeypatch.setattr(Request, "is_disconnected", fake_is_disconnected)
    items = [(0, _msg("invoke_llm", "你好")), (5, ("values", {"emotion": Emotion.NEUTRAL}))]
    # Held reply is released by the timeout, then the disconnect is seen while the next chunk is in flight.
    assert _events(items, monkeypatch, hold=0.05) == ["llm_start"]


def test_shutdown_stream_waits_for_in_flight_anext():
    async def run():
        async def gen():
            await asyncio.sleep(5)
            yield 1

        iterator = gen().__aiter__()
        in_flight = asyncio.ensure_future(iterator.__anext__())
        await asyncio.sleep(0)
        await react_routes._shutdown_stream(iterator, in_flight)
        assert in_flight.cancelled()

    asyncio.run(run())
