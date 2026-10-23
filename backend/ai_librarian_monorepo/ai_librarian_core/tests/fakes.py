import asyncio
from collections.abc import AsyncIterator, Iterator
from typing import Any

from langchain_core.language_models.chat_models import BaseChatModel
from langchain_core.messages import AIMessage, AIMessageChunk
from langchain_core.outputs import ChatGeneration, ChatGenerationChunk, ChatResult
from pydantic import Field


class Structured:
    """Stub for the runnable returned by with_structured_output."""

    def __init__(self, result):  # noqa: D107
        self.result = result
        self.calls = 0

    async def ainvoke(self, _prompt):
        self.calls += 1
        if isinstance(self.result, Exception):
            raise self.result
        return self.result


class FakeLLM:
    """Stub chat model whose structured output returns (or raises) `result`."""

    def __init__(self, result):  # noqa: D107
        self.structured = Structured(result)

    def with_structured_output(self, _schema):
        return self.structured


class SlowLLM:
    """Stub classifier whose structured output takes `delay` seconds to answer."""

    def __init__(self, delay: float):  # noqa: D107
        self.delay = delay

    def with_structured_output(self, _schema):
        return self

    async def ainvoke(self, _prompt):
        await asyncio.sleep(self.delay)
        return {"emotion": "happy"}


class FakeReplyLLM(BaseChatModel):
    """Fake reply model: each call streams the next queued AIMessage (content split on "|")."""

    replies: list[AIMessage] = Field(default_factory=list)

    @property
    def _llm_type(self) -> str:
        return "fake-reply"

    def _next(self) -> AIMessage:
        return self.replies.pop(0) if self.replies else AIMessage("")

    def _generate(self, messages, stop=None, run_manager=None, **kwargs: Any) -> ChatResult:
        return ChatResult(generations=[ChatGeneration(message=self._next())])

    def _stream(self, messages, stop=None, run_manager=None, **kwargs: Any) -> Iterator[ChatGenerationChunk]:
        raise NotImplementedError

    async def _astream(
        self, messages, stop=None, run_manager=None, **kwargs: Any
    ) -> AsyncIterator[ChatGenerationChunk]:
        reply = self._next()
        if reply.tool_calls:
            tool_chunks = [
                {"name": call["name"], "args": "{}", "id": call["id"], "index": i}
                for i, call in enumerate(reply.tool_calls)
            ]
            chunks = [AIMessageChunk(content="", tool_call_chunks=tool_chunks)]
        else:
            chunks = [AIMessageChunk(content=part) for part in str(reply.content).split("|")]
        chunks.append(AIMessageChunk(content="", response_metadata={"finish_reason": "stop"}))
        for chunk in chunks:
            generation = ChatGenerationChunk(message=chunk)
            if run_manager:
                await run_manager.on_llm_new_token(str(chunk.content), chunk=generation)
            yield generation
