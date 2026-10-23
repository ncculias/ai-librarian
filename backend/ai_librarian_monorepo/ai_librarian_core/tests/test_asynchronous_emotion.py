import asyncio

import ai_librarian_core.agents.react.asynchronous_emotion as module
from ai_librarian_core.agents.react.asynchronous_emotion import AsyncReactEmotionAgent
from ai_librarian_core.agents.react.state import Emotion, MessagesEmotionState
from langchain_core.messages import AIMessage, HumanMessage

from tests.fakes import FakeLLM


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

    monkeypatch.setattr(module, "init_chat_model", boom)
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

    monkeypatch.setattr(module, "init_chat_model", fake_init)
    agent = AsyncReactEmotionAgent(tools=[])
    assert agent._emotion_llm is fake
    assert agent._emotion_llm is fake
    assert calls == [(module.EMOTION_MODEL, {"temperature": 0, "max_tokens": 16})]
