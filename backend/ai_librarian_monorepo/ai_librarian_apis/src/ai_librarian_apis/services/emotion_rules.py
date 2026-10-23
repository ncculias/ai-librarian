"""Pure rules deciding which ``emotion`` SSE events to send while a reply streams."""

import json
from collections.abc import Sequence
from typing import Any, Literal

from ai_librarian_core.agents.react.state import Emotion

EmotionEventKind = Literal["state", "tool_chosen", "llm_start"]


def next_emotion_events(
    kind: EmotionEventKind,
    value: Emotion | None,
    turn: Emotion | None,
    last: Emotion | None,
) -> tuple[list[Emotion], Emotion | None, Emotion | None]:
    """Return ``(emotions_to_send, new_turn, new_last)``.

    ``turn`` is the emotion detected for the user's message (None until known); ``last`` is the
    emotion most recently sent to the client. The same value is never sent twice in a row.
    """
    if kind == "state":
        if value is None:
            return [], turn, last
        turn = value
        if last == value:
            return [], turn, last
        return [value], turn, value
    if kind == "tool_chosen":
        # Show "think" while tools run, but only if the user's own emotion is neutral/unknown.
        if turn in (None, Emotion.NEUTRAL) and last != Emotion.THINK:
            return [Emotion.THINK], turn, Emotion.THINK
        return [], turn, last
    # llm_start: the reply text begins, so leave "think" and go back to the turn's emotion.
    if last == Emotion.THINK:
        back = turn or Emotion.NEUTRAL
        return [back], turn, back
    return [], turn, last


def content_to_text(content: Any) -> str:
    if isinstance(content, str):
        return content
    if isinstance(content, Sequence):
        parts: list[str] = []
        for part in content:
            if isinstance(part, str):
                parts.append(part)
            elif isinstance(part, dict) and part.get("type", "text") == "text":
                parts.append(str(part.get("text", "")))
        return "".join(parts)
    return ""


def _to_emotion(value: Any) -> Emotion | None:
    if isinstance(value, Emotion):
        return value
    if isinstance(value, str):
        try:
            return Emotion(value)
        except ValueError:
            return None
    return None


def parse_emotion_from_message(
    content: Any,
    tool_calls: Sequence[Any] | None = None,
    additional_kwargs: dict[str, Any] | None = None,
) -> Emotion | None:
    """Extract the classifier's label from a ``detect_emotion`` message; None if absent or unparsable."""
    try:
        text = content_to_text(content).strip()
        if text:
            try:
                data = json.loads(text)
            except ValueError:
                data = None
            if isinstance(data, dict) and (emotion := _to_emotion(data.get("emotion"))):
                return emotion
        for call in tool_calls or []:
            args = call.get("args") if isinstance(call, dict) else None
            if isinstance(args, dict) and (emotion := _to_emotion(args.get("emotion"))):
                return emotion
        parsed = (additional_kwargs or {}).get("parsed")
        if isinstance(parsed, dict):
            return _to_emotion(parsed.get("emotion"))
        return _to_emotion(getattr(parsed, "emotion", None))
    except Exception:  # noqa: BLE001 - parsing must never break the stream
        return None
