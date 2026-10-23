"""The real AsyncReactEmotionAgent graph streamed through the SSE route, with fake models."""

import asyncio
import json
from collections.abc import AsyncIterator, Iterator
from typing import Any

from ai_librarian_apis.routes import react as react_routes
from ai_librarian_core.agents.react.asynchronous_emotion import AsyncReactEmotionAgent
from ai_librarian_core.models.llm_config import LLMConfig
from fastapi import FastAPI
from fastapi.testclient import TestClient
from langchain_core.language_models.chat_models import BaseChatModel
from langchain_core.messages import AIMessage, AIMessageChunk
from langchain_core.outputs import ChatGeneration, ChatGenerationChunk, ChatResult
from langchain_core.tools import tool
from pydantic import Field


class _Classifier:
    """Stands in for the classifier model's structured output; answers after `delay` seconds."""

    def __init__(self, emotion: str, delay: float = 0.0):  # noqa: D107
        self.emotion, self.delay = emotion, delay

    def with_structured_output(self, _schema):
        return self

    async def ainvoke(self, _prompt):
        await asyncio.sleep(self.delay)
        return {"emotion": self.emotion}


class _ReplyLLM(BaseChatModel):
    """Each call streams the next queued AIMessage; text content is split on "|"."""

    replies: list[AIMessage] = Field(default_factory=list)

    @property
    def _llm_type(self) -> str:
        return "fake-reply"

    def _generate(self, messages, stop=None, run_manager=None, **kwargs: Any) -> ChatResult:
        return ChatResult(generations=[ChatGeneration(message=self.replies.pop(0))])

    def _stream(self, messages, stop=None, run_manager=None, **kwargs: Any) -> Iterator[ChatGenerationChunk]:
        raise NotImplementedError

    async def _astream(
        self, messages, stop=None, run_manager=None, **kwargs: Any
    ) -> AsyncIterator[ChatGenerationChunk]:
        reply = self.replies.pop(0)
        if reply.tool_calls:
            calls = [
                {"name": c["name"], "args": "{}", "id": c["id"], "index": i} for i, c in enumerate(reply.tool_calls)
            ]
            chunks = [AIMessageChunk(content="", tool_call_chunks=calls)]
            finish = "tool_calls"
        else:
            chunks = [AIMessageChunk(content=part) for part in str(reply.content).split("|")]
            finish = "stop"
        chunks.append(AIMessageChunk(content="", response_metadata={"finish_reason": finish}))
        for chunk in chunks:
            generation = ChatGenerationChunk(message=chunk)
            if run_manager:
                await run_manager.on_llm_new_token(str(chunk.content), chunk=generation)
            yield generation


@tool
def weather() -> str:
    """Return today's weather."""
    return "25C"


def _sse_labels(agent: AsyncReactEmotionAgent, monkeypatch) -> list[str]:
    monkeypatch.setattr(react_routes, "react_emotion_agent", agent)
    app = FastAPI()
    app.include_router(react_routes.react_emotion_router, prefix="/v2")
    body = {"messages": [{"role": "user", "content": "今天天氣如何"}], "thread_id": "t"}
    with TestClient(app) as client:
        text = client.post("/v2/react/stream", json=body).text
    out = []
    for block in text.split("\n\n"):
        lines = dict(line.split(": ", 1) for line in block.splitlines() if ": " in line)
        if "event" in lines:
            data = json.loads(lines["data"])
            out.append(f"emotion:{data['emotion']}" if lines["event"] == "emotion" else lines["event"])
    return out


def _agent(classifier: _Classifier, *replies: AIMessage, tools=()) -> AsyncReactEmotionAgent:
    agent = AsyncReactEmotionAgent(tools=list(tools))
    agent._emotion_llm = classifier
    agent._llm_cache[LLMConfig()] = _ReplyLLM(replies=list(replies))
    return agent


def test_real_graph_emotion_precedes_reply_when_classifier_is_slower(monkeypatch):
    agent = _agent(_Classifier("happy", delay=0.1), AIMessage("太好|了"))
    assert _sse_labels(agent, monkeypatch) == ["emotion:happy", "llm_start", "llm_delta", "llm_end"]


def test_real_graph_tool_turn_order(monkeypatch):
    agent = _agent(
        _Classifier("neutral"),
        AIMessage("", tool_calls=[{"name": "weather", "args": {}, "id": "1"}]),
        AIMessage("今天|晴天"),
        tools=[weather],
    )
    assert _sse_labels(agent, monkeypatch) == [
        "emotion:neutral",
        "tool_chosen",
        "emotion:think",
        "tool_output",
        "llm_start",
        "emotion:neutral",
        "llm_delta",
        "llm_end",
    ]
