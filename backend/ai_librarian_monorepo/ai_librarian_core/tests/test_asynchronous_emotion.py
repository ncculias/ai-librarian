import asyncio

from ai_librarian_core.agents.react.asynchronous_emotion import AsyncReactEmotionAgent
from ai_librarian_core.agents.react.state import Emotion, MessagesEmotionState
from langchain_core.messages import AIMessage, HumanMessage

from tests.test_emotion_classifier import _FakeLLM


def test_detect_emotion_reads_latest_user_message():
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
