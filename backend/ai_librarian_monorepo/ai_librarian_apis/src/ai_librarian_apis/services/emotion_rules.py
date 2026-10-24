"""Pure rules deciding which ``emotion`` SSE events to send while a reply streams."""

from typing import Literal

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
        if back == last:
            return [], turn, last
        return [back], turn, back
    return [], turn, last
