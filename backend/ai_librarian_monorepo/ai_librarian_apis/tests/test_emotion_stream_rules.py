from ai_librarian_apis.services.emotion_rules import next_emotion_events as nxt
from ai_librarian_apis.services.emotion_rules import parse_emotion_from_message
from ai_librarian_core.agents.react.state import Emotion as E


def test_state_emotion_is_sent_once():
    assert nxt("state", E.SAD, None, None) == ([E.SAD], E.SAD, E.SAD)
    assert nxt("state", E.SAD, E.SAD, E.SAD) == ([], E.SAD, E.SAD)


def test_think_only_when_turn_is_neutral_and_only_once():
    assert nxt("tool_chosen", None, None, None) == ([E.THINK], None, E.THINK)
    assert nxt("tool_chosen", None, E.NEUTRAL, E.NEUTRAL) == ([E.THINK], E.NEUTRAL, E.THINK)
    assert nxt("tool_chosen", None, E.SAD, E.SAD) == ([], E.SAD, E.SAD)
    assert nxt("tool_chosen", None, E.NEUTRAL, E.THINK) == ([], E.NEUTRAL, E.THINK)


def test_llm_start_switches_back_from_think():
    assert nxt("llm_start", None, E.NEUTRAL, E.THINK) == ([E.NEUTRAL], E.NEUTRAL, E.NEUTRAL)
    assert nxt("llm_start", None, None, E.THINK) == ([E.NEUTRAL], None, E.NEUTRAL)
    assert nxt("llm_start", None, E.SAD, E.SAD) == ([], E.SAD, E.SAD)


def test_late_state_after_think_switches_to_the_detected_emotion():
    assert nxt("state", E.SAD, None, E.THINK) == ([E.SAD], E.SAD, E.SAD)


def test_parse_json_content_str_and_parts():
    assert parse_emotion_from_message('{"emotion": "sad"}') == E.SAD
    parts = [{"type": "text", "text": '{"emotion":'}, {"type": "text", "text": ' "angry"}'}]
    assert parse_emotion_from_message(parts) == E.ANGRY


def test_parse_tool_call_args_and_parsed_kwargs():
    assert parse_emotion_from_message("", [{"name": "EmotionOutput", "args": {"emotion": "think"}}]) == E.THINK
    assert parse_emotion_from_message("", [], {"parsed": {"emotion": "happy"}}) == E.HAPPY


def test_parse_partial_or_garbage_is_none():
    assert parse_emotion_from_message('{"emot') is None
    assert parse_emotion_from_message("hello") is None
    assert parse_emotion_from_message('{"emotion": "bogus"}') is None
    assert parse_emotion_from_message(None, None, None) is None
