from collections.abc import AsyncIterator
from dataclasses import dataclass
from typing import Any, Literal

from ai_librarian_core.agents.react.base import _cleanup_thread, BaseReactAgent, MissingAIMessageError, ReactAgentError
from ai_librarian_core.agents.react.state import Emotion, MessagesEmotionState
from ai_librarian_core.models.llm_config import LLMConfig
from ai_librarian_core.models.used_tool import UsedTool
from ai_librarian_core.utils.uuid import get_thread_id
from langchain_core.messages import AIMessage, BaseMessage, ToolMessage
from langgraph.graph import StateGraph
from langgraph.graph.state import CompiledStateGraph
from langgraph.prebuilt import ToolNode
from pydantic import BaseModel, ValidationError


class EmotionOutput(BaseModel):
    emotion: Emotion


@dataclass
class AsyncReactEmotionAgent(BaseReactAgent):
    def __post_init__(self):
        super().__post_init__()
        self.state_schema = MessagesEmotionState

    @property
    def workflow(self) -> CompiledStateGraph:
        return self._init_workflow()

    async def _clear_used_tools(self, state: MessagesEmotionState) -> dict[str, Any]:
        return {"used_tools": [], "tool_cursor": len(state.messages)}

    async def _invoke_llm(self, state: MessagesEmotionState) -> dict[str, list[BaseMessage]]:
        llm_config = state.llm_config
        llm = self._init_llm(llm_config)
        messages = state.messages

        try:
            response = await llm.ainvoke(messages)
            return {"messages": [response]}
        # TODO(youkwan): Handle specific errors (couldn't find docs).
        except Exception as e:
            raise ReactAgentError("An unexpected error occurred while trying to invoke the chat model.") from e

    async def _detect_emotion(self, state: MessagesEmotionState) -> dict[str, Emotion]:
        llm_config = state.llm_config
        llm = self._init_llm(llm_config).with_structured_output(EmotionOutput)
        recent_messages = state.messages[-3:]
        history = "\n".join(
            f"{message.type.upper()}: {getattr(message, 'content', '')}"
            for message in recent_messages
            if getattr(message, "content", None)
        )
        try:
            response = await llm.ainvoke(
                f"""
        You are a helpful assistant that detects the emotion from the chat history.
        The chat history is:
        {history}
        Return the emotion of the chat history.
        """,
            )
        except ValidationError:
            return {"emotion": Emotion.NEUTRAL}

        emotion_value: Any
        if isinstance(response, EmotionOutput):
            emotion_value = response.emotion
        elif isinstance(response, dict):
            emotion_value = response.get("emotion", Emotion.NEUTRAL)
        else:
            emotion_value = getattr(response, "emotion", Emotion.NEUTRAL)

        try:
            emotion = emotion_value if isinstance(emotion_value, Emotion) else Emotion(emotion_value)
        except ValueError:
            emotion = Emotion.NEUTRAL

        return {"emotion": emotion}

    async def _route(self, state: MessagesEmotionState) -> Literal["tools", "detect_emotion"]:
        messages = state.messages
        last_message = messages[-1]
        if not isinstance(last_message, AIMessage):
            raise MissingAIMessageError(f"Expected AIMessage in output edges, but got {type(last_message).__name__}")
        if last_message.tool_calls:
            return "tools"
        return "detect_emotion"

    async def _catch_tool_massage(self, state: MessagesEmotionState) -> dict[str, Any]:
        start_index = state.tool_cursor
        new_tools: list[UsedTool] = []
        for message in state.messages[start_index:]:
            if isinstance(message, ToolMessage):
                new_tools.append(UsedTool(name=message.name, output=message.content))

        updates: dict[str, Any] = {"tool_cursor": len(state.messages)}
        if new_tools:
            updates["used_tools"] = [*state.used_tools, *new_tools]
        return updates

    def _init_workflow(self) -> CompiledStateGraph:
        workflow = StateGraph(state_schema=self.state_schema)
        invoke_llm = self._invoke_llm
        workflow.add_node("clear_used_tools", self._clear_used_tools)
        workflow.add_node("invoke_llm", invoke_llm)
        workflow.add_node("detect_emotion", self._detect_emotion)
        tool_node = ToolNode(self.tools)
        workflow.add_node("catch_tool_massage", self._catch_tool_massage)
        workflow.add_node("tools", tool_node)
        workflow.set_entry_point("clear_used_tools")
        workflow.add_edge("clear_used_tools", "invoke_llm")
        workflow.add_conditional_edges(
            "invoke_llm",
            self._route,
        )
        workflow.add_edge("catch_tool_massage", "invoke_llm")
        workflow.add_edge("tools", "catch_tool_massage")
        workflow.add_edge("detect_emotion", "__end__")
        return workflow.compile(name=self.name, checkpointer=self.checkpointer)

    async def run(
        self, messages: list[BaseMessage], thread_id: str | None = None, llm_config: LLMConfig = LLMConfig()
    ) -> tuple[AIMessage, list[UsedTool], Emotion]:
        state = MessagesEmotionState(messages=messages, llm_config=llm_config)
        tid = thread_id or get_thread_id()
        try:
            result = await self.workflow.ainvoke(
                state, config={"configurable": {"thread_id": tid}}
            )
        finally:
            _cleanup_thread(self.checkpointer, tid)
        return result["messages"][-1], result["used_tools"], result["emotion"]

    async def stream(
        self, messages: list[BaseMessage], thread_id: str | None = None, llm_config: LLMConfig = LLMConfig()
    ) -> AsyncIterator[tuple[str, Any]]:
        state = MessagesEmotionState(messages=messages, llm_config=llm_config)
        tid = thread_id or get_thread_id()

        async def _gen() -> AsyncIterator[tuple[str, Any]]:
            try:
                async for item in self.workflow.astream(
                    state,
                    stream_mode=["messages", "values"],
                    config={"configurable": {"thread_id": tid}},
                ):
                    yield item
            finally:
                _cleanup_thread(self.checkpointer, tid)

        return _gen()

    def plot(self) -> str:
        return self.workflow.get_graph().draw_mermaid()
