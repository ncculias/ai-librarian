import asyncio
import time

import ai_librarian_core.agents.react.asynchronous_emotion as module
import ai_librarian_core.agents.react.emotion_classifier as classifier_module
from ai_librarian_core.agents.react.asynchronous_emotion import AsyncReactEmotionAgent
from ai_librarian_core.agents.react.state import Emotion, MessagesEmotionState
from ai_librarian_core.models.llm_config import LLMConfig
from langchain_core.messages import AIMessage, HumanMessage

from tests.fakes import FakeLLM, FakeReplyLLM, SlowLLM


def test_detect_emotion_reads_latest_user_message():
    agent = AsyncReactEmotionAgent(tools=[])
    agent._emotion_llm = FakeLLM({"emotion": "sad"})
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


def test_detect_emotion_falls_back_to_neutral_when_model_init_fails_and_retries(monkeypatch):
    calls = []

    def boom(*args, **kwargs):
        calls.append(kwargs)
        raise ValueError("missing api key")

    monkeypatch.setattr(classifier_module, "init_chat_model", boom)
    agent = AsyncReactEmotionAgent(tools=[])
    state = MessagesEmotionState(messages=[HumanMessage("我最近心情很差")])
    assert asyncio.run(agent._detect_emotion(state)) == {"emotion": Emotion.NEUTRAL}
    assert asyncio.run(agent._detect_emotion(state)) == {"emotion": Emotion.NEUTRAL}
    assert len(calls) == 2  # failed init is not cached


def test_emotion_llm_is_built_once_with_deterministic_settings(monkeypatch):
    calls = []
    fake = FakeLLM({"emotion": "happy"})

    def fake_init(model, **kwargs):
        calls.append((model, kwargs))
        return fake

    monkeypatch.setattr(classifier_module, "init_chat_model", fake_init)
    agent = AsyncReactEmotionAgent(tools=[])
    assert agent._emotion_llm is fake
    assert agent._emotion_llm is fake
    assert calls == [
        (classifier_module.EMOTION_MODEL, {"temperature": 0, "max_tokens": 16, "timeout": 5, "max_retries": 1})
    ]


def _agent_with_fakes(emotion_llm, *replies) -> AsyncReactEmotionAgent:
    agent = AsyncReactEmotionAgent(tools=[])
    agent._emotion_llm = emotion_llm
    agent._llm_cache[LLMConfig()] = FakeReplyLLM(replies=list(replies))
    return agent


async def _collect(agent: AsyncReactEmotionAgent, text: str) -> list[tuple[str, object]]:
    stream = await agent.stream([HumanMessage(text)])
    return [item async for item in stream]


def test_slow_classifier_times_out_to_neutral_without_holding_the_run(monkeypatch):
    monkeypatch.setattr(module, "EMOTION_TIMEOUT_SECONDS", 0.2)
    agent = _agent_with_fakes(SlowLLM(delay=5), AIMessage("你好|呀"))
    started = time.monotonic()
    items = asyncio.run(_collect(agent, "今天好開心"))
    assert time.monotonic() - started < 1.0
    values = [payload for mode, payload in items if mode == "values"]
    assert values[-1]["emotion"] == Emotion.NEUTRAL
    assert values[-1]["messages"][-1].content == "你好呀"


def _custom(items: list[tuple[str, object]]) -> list[object]:
    return [payload for mode, payload in items if mode == "custom"]


def test_detect_emotion_emits_a_custom_chunk_with_the_label():
    agent = _agent_with_fakes(FakeLLM({"emotion": "sad"}), AIMessage("我在|這裡"))
    assert _custom(asyncio.run(_collect(agent, "我最近心情很差"))) == [{"emotion": "sad"}]


def test_custom_chunk_is_emitted_on_every_fallback_path(monkeypatch):
    # classifier error
    agent = _agent_with_fakes(FakeLLM(RuntimeError("boom")), AIMessage("好"))
    assert _custom(asyncio.run(_collect(agent, "q"))) == [{"emotion": "neutral"}]
    # blank user text
    agent = _agent_with_fakes(FakeLLM({"emotion": "happy"}), AIMessage("好"))
    assert _custom(asyncio.run(_collect(agent, "   "))) == [{"emotion": "neutral"}]
    # timeout
    monkeypatch.setattr(module, "EMOTION_TIMEOUT_SECONDS", 0.05)
    agent = _agent_with_fakes(SlowLLM(delay=5), AIMessage("好"))
    assert _custom(asyncio.run(_collect(agent, "q"))) == [{"emotion": "neutral"}]

    # model init failure
    def boom(*_args, **_kwargs):
        raise ValueError("missing api key")

    monkeypatch.setattr(classifier_module, "init_chat_model", boom)
    agent = AsyncReactEmotionAgent(tools=[])
    agent._llm_cache[LLMConfig()] = FakeReplyLLM(replies=[AIMessage("好")])
    assert _custom(asyncio.run(_collect(agent, "q"))) == [{"emotion": "neutral"}]


def test_run_without_a_stream_still_returns_the_emotion():
    agent = _agent_with_fakes(FakeLLM({"emotion": "happy"}), AIMessage("太好了"))
    message, _tools, emotion = asyncio.run(agent.run([HumanMessage("終於找到了！")]))
    assert emotion == Emotion.HAPPY
    assert message.content == "太好了"
