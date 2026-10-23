import asyncio
from typing import Any

from ai_librarian_apis.core.global_vars import react_agent, react_emotion_agent
from ai_librarian_apis.core.logger import logger
from ai_librarian_apis.schemas.error import ErrorResponse
from ai_librarian_apis.schemas.react import (
    AgentEmotionResponse,
    AgentRequest,
    AgentResponse,
    FlowchartResponse,
    ModelResponse,
    OpenAIMessage,
)
from ai_librarian_apis.schemas.sse import EmotionPayload, EventPayload, LLMChunkPayload, SSEEvent, ToolPayload
from ai_librarian_apis.services.emotion_rules import (
    EmotionEventKind,
    content_to_text,
    next_emotion_events,
    parse_emotion_from_message,
)
from ai_librarian_apis.utils.sse_example import get_sse_response_example
from ai_librarian_core.agents.react.state import Emotion
from ai_librarian_core.models.llm_config import Model
from ai_librarian_core.models.used_tool import UsedTool
from fastapi import APIRouter, Request
from fastapi.responses import StreamingResponse
from langchain_core.messages import AIMessage, ToolMessage

# How long to hold the reply back, at most, while waiting for the emotion classifier.
EMOTION_HOLD_SECONDS = 2.5

react_router = APIRouter(prefix="/react", tags=["ReAct Agent"])
react_emotion_router = APIRouter(prefix="/react", tags=["ReAct Agent With Emotion"])


@react_router.get(
    "/models",
    description=(
        "Retrieves a list of the LLMs currently configured and available "
        "for use with the agent endpoints (`/run` and `/stream`)."
    ),
    summary="List all available models",
    responses={500: {"model": ErrorResponse}},
)
def get_models() -> ModelResponse:
    return ModelResponse(models=list(Model))


@react_router.get(
    "/flowchart",
    description="Retrieves the flowchart of the ReAct Agent in Mermaid format.",
    summary="Retrieve the flowchart of the Agent",
    responses={500: {"model": ErrorResponse}},
)
def get_flowchart() -> FlowchartResponse:
    return FlowchartResponse(mermaid=react_agent.plot())


@react_router.post(
    "/run",
    description=(
        "Runs the ReAct Agent with the given request. "
        "The request should be a list of OpenAI style messages between user, assistant and system. "
        "A thread id can be provided to continue a conversation on a specific thread. "
        "If not provided, a new conversation thread will be created automatically."
    ),
    summary="Run the ReAct Agent",
    responses={500: {"model": ErrorResponse}},
)
async def run_react_agent(request: AgentRequest) -> AgentResponse:
    message, used_tools = await react_agent.run(
        request.get_langchain_messages(),
        thread_id=request.thread_id,
        llm_config=request.llm_config,
    )
    return AgentResponse(
        thread_id=request.thread_id,
        llm_config=request.llm_config,
        messages=[OpenAIMessage.from_langchain_message(message)],
        used_tools=used_tools,
    )


@react_emotion_router.post(
    "/run",
    description=(
        "Runs the ReAct Agent with the given request. "
        "The request should be a list of OpenAI style messages between user, assistant and system. "
        "A thread id can be provided to continue a conversation on a specific thread. "
        "If not provided, a new conversation thread will be created automatically."
    ),
    summary="Run the ReAct Agent",
    responses={500: {"model": ErrorResponse}},
)
async def run_react_emotion_agent(request: AgentRequest) -> AgentEmotionResponse:
    message, used_tools, emotion = await react_emotion_agent.run(
        request.get_langchain_messages(),
        thread_id=request.thread_id,
        llm_config=request.llm_config,
    )
    return AgentEmotionResponse(
        thread_id=request.thread_id,
        llm_config=request.llm_config,
        messages=[OpenAIMessage.from_langchain_message(message)],
        used_tools=used_tools,
        emotion=emotion,
    )


def _process_tool_message(message: ToolMessage, thread_id: str, llm_config: dict) -> str:
    return SSEEvent(
        event=EventPayload.TOOL_OUTPUT,
        data=ToolPayload(
            thread_id=thread_id, llm_config=llm_config, used_tools=UsedTool(name=message.name, output=message.content)
        ),
    ).to_sse_format()


def _process_ai_message(
    message: AIMessage, thread_id: str, llm_config: dict, has_llm_started: bool
) -> tuple[str, bool] | None:
    if message.tool_calls and (tool_name := message.tool_calls[0].get("name")):
        event = SSEEvent(
            event=EventPayload.TOOL_CHOSEN,
            data=ToolPayload(
                thread_id=thread_id,
                llm_config=llm_config,
                used_tools=UsedTool(name=tool_name, output=message.content),
            ),
        )
        return event.to_sse_format(), has_llm_started
    elif message.content:
        if has_llm_started:
            event = SSEEvent(
                event=EventPayload.LLM_DELTA,
                data=LLMChunkPayload(
                    thread_id=thread_id,
                    llm_config=llm_config,
                    message_chunk=message.content,
                ),
            )
            return event.to_sse_format(), True
        else:
            event = SSEEvent(
                event=EventPayload.LLM_START,
                data=LLMChunkPayload(
                    thread_id=thread_id,
                    llm_config=llm_config,
                    message_chunk=message.content,
                ),
            )
            return event.to_sse_format(), True
    elif message.response_metadata.get("finish_reason") == "stop":
        event = SSEEvent(
            event=EventPayload.LLM_END,
            data=LLMChunkPayload(
                thread_id=thread_id,
                llm_config=llm_config,
                message_chunk=message.content,
            ),
        )
        return event.to_sse_format(), False
    return None


async def _shutdown_stream(iterator: Any, next_item: "asyncio.Future | None") -> None:
    """Stop an in-flight ``__anext__`` and close the agent stream without raising."""
    if next_item is not None:
        if not next_item.done():
            next_item.cancel()
            # Wait until the cancelled call has really finished; closing a running generator raises.
            await asyncio.wait({next_item})
        if not next_item.cancelled():
            next_item.exception()  # mark retrieved
    aclose = getattr(iterator, "aclose", None)
    if aclose is not None:
        try:
            await aclose()
        except Exception:  # noqa: BLE001 - cleanup must never raise
            logger.debug("Closing the emotion stream failed.", exc_info=True)


@react_router.post(
    "/stream",
    description=(
        "Streams the ReAct Agent's response. "
        "The request should be a list of OpenAI style messages between user, assistant and system. "
        "A thread id can be provided to continue a conversation on a specific thread. "
        "If not provided, a new conversation thread will be created automatically. "
        "Note that Swagger UI does not support SSE demo, it is recommended to use Postman to test this endpoint."
    ),
    summary="Stream the ReAct Agent",
    responses={
        200: {
            "content": {
                "text/event-stream": {
                    "schema": {
                        "type": "string",
                        "format": "binary",
                        "description": "A stream of server-sent events (SSE).",
                    },
                    "examples": {"example1": {"summary": "Example SSE stream", "value": get_sse_response_example()}},
                }
            },
            "description": "Stream data using Server-Sent Events.",
        },
        500: {"model": ErrorResponse},
    },
)
async def stream_react_agent(agent_request: AgentRequest, request: Request):
    # TODO(youkwan): Add heartbeat.
    async def stream_chunk():
        has_llm_started = False
        stream = await react_agent.stream(
            agent_request.get_langchain_messages(),
            thread_id=agent_request.thread_id,
            llm_config=agent_request.llm_config,
        )
        async for chunk in stream:
            if await request.is_disconnected():
                logger.info("Client disconnected.")
                break

            message = chunk[0]
            llm_config_dict = agent_request.llm_config.model_dump(mode="json")

            if isinstance(message, ToolMessage):
                yield _process_tool_message(message, agent_request.thread_id, llm_config_dict)
            elif isinstance(message, AIMessage):
                result = _process_ai_message(message, agent_request.thread_id, llm_config_dict, has_llm_started)
                if result:
                    event_str, has_llm_started = result
                    yield event_str

    return StreamingResponse(
        stream_chunk(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache"},
    )


@react_emotion_router.post(
    "/stream",
    description=(
        "Streams the ReAct Agent's response. "
        "The request should be a list of OpenAI style messages between user, assistant and system. "
        "A thread id can be provided to continue a conversation on a specific thread. "
        "If not provided, a new conversation thread will be created automatically. "
        "Note that Swagger UI does not support SSE demo, it is recommended to use Postman to test this endpoint."
    ),
    summary="Stream the ReAct Agent",
    responses={
        200: {
            "content": {
                "text/event-stream": {
                    "schema": {
                        "type": "string",
                        "format": "binary",
                        "description": "A stream of server-sent events (SSE).",
                    },
                    "examples": {"example1": {"summary": "Example SSE stream", "value": get_sse_response_example()}},
                }
            },
            "description": "Stream data using Server-Sent Events.",
        },
        500: {"model": ErrorResponse},
    },
)
async def stream_react_emotion_agent(agent_request: AgentRequest, request: Request):
    async def stream_chunk():
        has_llm_started = False
        turn_emotion: Emotion | None = None  # the user's emotion for this turn, once detected
        last_emotion: Emotion | None = None  # what the client was last told
        detect_seen = False  # a detect_emotion chunk has arrived, so state.emotion is meaningful
        detect_buffer = ""
        state_emotion: Emotion | None = None  # latest emotion seen in a `values` state
        hold_over = False  # stop holding reply events (emotion arrived, or waited too long)
        pending: list[ToolMessage | AIMessage] = []  # reply messages held back until the emotion is known
        llm_config_dict = agent_request.llm_config.model_dump(mode="json")

        def emotion_events(kind: EmotionEventKind, value: Emotion | None = None) -> list[str]:
            nonlocal turn_emotion, last_emotion
            emotions, turn_emotion, last_emotion = next_emotion_events(kind, value, turn_emotion, last_emotion)
            return [
                SSEEvent(
                    event=EventPayload.EMOTION,
                    data=EmotionPayload(
                        thread_id=agent_request.thread_id,
                        llm_config=llm_config_dict,
                        emotion=emotion,
                    ),
                ).to_sse_format()
                for emotion in emotions
            ]

        def reply_events(message: ToolMessage | AIMessage) -> list[str]:
            nonlocal has_llm_started
            if isinstance(message, ToolMessage):
                return [_process_tool_message(message, agent_request.thread_id, llm_config_dict)]
            result = _process_ai_message(message, agent_request.thread_id, llm_config_dict, has_llm_started)
            if not result:
                return []
            event_str, started_now = result
            events = [event_str]
            if message.tool_calls and message.tool_calls[0].get("name"):
                events += emotion_events("tool_chosen")
            elif started_now:
                # First reply content after a think (llm_start or a later llm_delta) leaves "think".
                events += emotion_events("llm_start")
            has_llm_started = started_now
            return events

        def release() -> list[str]:
            nonlocal pending, hold_over
            hold_over = True
            held, pending = pending, []
            return [event for message in held for event in reply_events(message)]

        def on_chunk(chunk: object) -> list[str]:
            nonlocal detect_seen, detect_buffer, state_emotion
            mode: str
            payload: object
            if (
                isinstance(chunk, tuple)
                and len(chunk) == 2
                and isinstance(chunk[0], str)
                and chunk[0] in {"messages", "values"}
            ):
                mode, payload = chunk
            else:
                mode, payload = "messages", chunk

            events: list[str] = []
            if mode == "messages":
                metadata: dict[str, Any] | None = None
                if isinstance(payload, tuple) and len(payload) == 2:
                    message, metadata = payload
                else:
                    message = payload

                if metadata and metadata.get("langgraph_node") == "detect_emotion":
                    # The classifier's own output: send the user's emotion as soon as it parses.
                    detect_seen = True
                    if turn_emotion is None and isinstance(message, AIMessage):
                        detect_buffer += content_to_text(message.content)
                        detected = parse_emotion_from_message(
                            message.content, message.tool_calls, message.additional_kwargs
                        ) or parse_emotion_from_message(detect_buffer)
                        events += emotion_events("state", detected)
                elif isinstance(message, ToolMessage | AIMessage):
                    # The classifier can finish a little after the reply's first token; hold the reply back
                    # briefly so the emotion always reaches the client first.
                    if turn_emotion is None and not hold_over:
                        pending.append(message)
                    else:
                        events += reply_events(message)
            elif mode == "values":
                if hasattr(payload, "model_dump") and callable(payload.model_dump):
                    state_dict = payload.model_dump()
                elif isinstance(payload, dict):
                    state_dict = payload
                else:
                    state_dict = {}
                try:
                    state_emotion = Emotion(str(state_dict.get("emotion")))
                except ValueError:
                    return events
                # Fallback when the classifier chunk could not be parsed: the state still has its label.
                if detect_seen and turn_emotion is None:
                    logger.warning(
                        "detect_emotion chunks did not parse; falling back to state emotion %s.", state_emotion
                    )
                    events += emotion_events("state", state_emotion)

            if turn_emotion is not None and pending:
                events += release()
            return events

        stream = await react_emotion_agent.stream(
            agent_request.get_langchain_messages(),
            thread_id=agent_request.thread_id,
            llm_config=agent_request.llm_config,
        )
        iterator = stream.__aiter__()
        loop = asyncio.get_running_loop()
        deadline = loop.time() + EMOTION_HOLD_SECONDS
        next_item: asyncio.Future | None = None
        try:
            while True:
                if await request.is_disconnected():
                    logger.info("Client disconnected.")
                    return
                if next_item is None:
                    next_item = asyncio.ensure_future(iterator.__anext__())
                timeout = max(0.0, deadline - loop.time()) if pending and not hold_over else None
                done, _ = await asyncio.wait({next_item}, timeout=timeout)
                if not done:
                    # Classifier is slow or silent: stop holding and let the reply through.
                    logger.warning("No emotion within %.1fs; releasing the held reply.", EMOTION_HOLD_SECONDS)
                    for event_str in release():
                        yield event_str
                    continue
                item_future, next_item = next_item, None
                try:
                    chunk = item_future.result()
                except StopAsyncIteration:
                    break
                for event_str in on_chunk(chunk):
                    yield event_str

            for event_str in release() if pending else []:
                yield event_str
            # Fallback when no classifier chunk ever arrived (e.g. classifier failed -> neutral in state).
            if turn_emotion is None and state_emotion is not None:
                for event_str in emotion_events("state", state_emotion):
                    yield event_str
        finally:
            await _shutdown_stream(iterator, next_item)

    return StreamingResponse(
        stream_chunk(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache"},
    )
