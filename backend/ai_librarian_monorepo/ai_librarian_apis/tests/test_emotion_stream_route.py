import asyncio
import json
import time

from ai_librarian_apis.routes import react as react_routes
from ai_librarian_apis.schemas.react import AgentRequest
from ai_librarian_core.agents.react.state import Emotion
from fastapi import FastAPI, Request
from fastapi.testclient import TestClient
from langchain_core.messages import AIMessageChunk, ToolMessage


def _msg(node: str, content: str, **kwargs):
    return "messages", (AIMessageChunk(content=content, **kwargs), {"langgraph_node": node})


def _detected(emotion: str):
    """The custom chunk `detect_emotion` writes as soon as it has decided."""
    return "custom", {"emotion": emotion}


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
    return [label for block in text.split("\n\n") if (label := _label(block))]


def _label(block: str) -> str | None:
    lines = dict(line.split(": ", 1) for line in block.splitlines() if ": " in line)
    if "event" not in lines:
        return None
    data = json.loads(lines["data"])
    return f"emotion:{data['emotion']}" if lines["event"] == "emotion" else lines["event"]


class _ConnectedRequest:
    async def is_disconnected(self) -> bool:
        return False


def _timed_events(items, monkeypatch, hold: float | None = None) -> tuple[list[tuple[float, str]], float]:
    """Drive the route's generator directly and stamp each event with its arrival time."""
    monkeypatch.setattr(react_routes, "react_emotion_agent", _FakeAgent(items))
    if hold is not None:
        monkeypatch.setattr(react_routes, "EMOTION_HOLD_SECONDS", hold)

    async def run():
        body = AgentRequest(messages=[{"role": "user", "content": "hi"}], thread_id="t")
        response = await react_routes.stream_react_emotion_agent(body, _ConnectedRequest())
        started = time.monotonic()
        out = []
        async for chunk in response.body_iterator:
            text = chunk if isinstance(chunk, str) else chunk.decode()
            if label := _label(text):
                out.append((time.monotonic() - started, label))
        return out, time.monotonic() - started

    return asyncio.run(run())


def test_emotion_precedes_reply_even_when_classifier_is_slower(monkeypatch):
    items = [
        (0, _msg("invoke_llm", "你好")),
        (0, _msg("invoke_llm", "嗎")),
        (0.05, _detected("sad")),
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
        (0, _detected("neutral")),
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


def test_think_turn_emotion_is_sent_exactly_once(monkeypatch):
    items = [
        (0, _detected("think")),
        (0, _msg("invoke_llm", "我們")),
        (0, _msg("invoke_llm", "一起")),
        (0, _msg("invoke_llm", "想想")),
        (0, ("values", {"emotion": Emotion.THINK})),
    ]
    emotions = [e for e in _events(items, monkeypatch) if e.startswith("emotion:")]
    assert emotions == ["emotion:think"]


def test_reply_without_any_detect_result_is_released_at_the_hold_cap(monkeypatch):
    items = [
        (0, _msg("invoke_llm", "你好")),
        (0.6, _msg("invoke_llm", "嗎")),
    ]
    events, _total = _timed_events(items, monkeypatch, hold=0.2)
    assert [label for _t, label in events] == ["llm_start", "llm_delta"]
    first_at = events[0][0]
    assert 0.15 <= first_at < 0.5  # held until the cap, not until the next chunk


def test_custom_detect_chunk_releases_the_held_reply_immediately(monkeypatch):
    items = [
        (0, _msg("invoke_llm", "你好")),
        (0, _msg("invoke_llm", "嗎")),
        (0.05, _detected("sad")),
        (0, ("values", {"emotion": Emotion.SAD})),
    ]
    events, total = _timed_events(items, monkeypatch)  # default 2.5 s cap
    assert [label for _t, label in events] == ["emotion:sad", "llm_start", "llm_delta"]
    assert total < 1.0


def test_classifier_message_chunks_are_never_forwarded_as_reply(monkeypatch):
    tool_like = {"name": "EmotionOutput", "args": {"emotion": "sad"}, "id": "e"}
    items = [
        (0, _msg("detect_emotion", '{"emotion":"sad"}')),
        (0, _msg("detect_emotion", "", tool_calls=[tool_like])),
        (0, _detected("sad")),
        (0, _msg("invoke_llm", "你好")),
    ]
    assert _events(items, monkeypatch) == ["emotion:sad", "llm_start"]


def test_invalid_custom_emotion_releases_and_state_fallback_still_applies(monkeypatch):
    items = [
        (0, _msg("invoke_llm", "你好")),
        (0, _detected("bogus")),
        (0, ("values", {"emotion": Emotion.HAPPY})),
    ]
    events, total = _timed_events(items, monkeypatch)
    assert [label for _t, label in events] == ["llm_start", "emotion:happy"]
    assert total < 1.0
