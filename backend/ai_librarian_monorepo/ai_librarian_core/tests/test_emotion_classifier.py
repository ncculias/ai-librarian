import asyncio
import logging

from ai_librarian_core.agents.react.emotion_classifier import (
    EMOTION_MAX_CHARS,
    EMOTION_PROMPT,
    EmotionOutput,
    build_emotion_input,
    classify_emotion,
    latest_user_text,
)
from ai_librarian_core.agents.react.state import Emotion
from langchain_core.messages import AIMessage, HumanMessage, SystemMessage, ToolMessage

from tests.fakes import FakeLLM


def test_latest_user_text_takes_last_human_message_only():
    msgs = [
        SystemMessage("sys"),
        HumanMessage("舊問題"),
        AIMessage("舊回覆"),
        HumanMessage("我最近心情很差"),
        AIMessage("", tool_calls=[{"name": "x", "args": {}, "id": "1"}]),
        ToolMessage("輸出", tool_call_id="1"),
    ]
    assert latest_user_text(msgs) == "我最近心情很差"
    assert latest_user_text([SystemMessage("sys")]) == ""
    assert latest_user_text([]) == ""


def test_latest_user_text_joins_text_parts_of_list_content():
    msg = HumanMessage(
        content=[
            {"type": "text", "text": "第一段"},
            {"type": "image_url", "image_url": {"url": "http://x/y.png"}},
            {"type": "text", "text": "第二段"},
        ]
    )
    assert latest_user_text([msg]) == "第一段第二段"


def test_build_emotion_input_truncates_and_contains_prompt_and_labels():
    filler = "囧"  # a character that appears nowhere in the prompt or the input template
    assert filler not in EMOTION_PROMPT
    text = build_emotion_input(filler * 500)
    assert text.startswith(EMOTION_PROMPT)
    assert text.count(filler) == EMOTION_MAX_CHARS
    for label in ("happy", "sad", "angry", "surprised", "think", "neutral"):
        assert label in EMOTION_PROMPT
    for rule in ("最新", "禮貌", "拿不準"):
        assert rule in EMOTION_PROMPT


def test_emotion_enum_has_no_anger_and_has_think():
    assert {e.value for e in Emotion} == {"neutral", "happy", "sad", "angry", "surprised", "think"}


def test_classify_emotion_returns_model_label():
    assert (
        asyncio.run(classify_emotion(FakeLLM(EmotionOutput(emotion=Emotion.THINK)), "我在想要不要讀")) == Emotion.THINK
    )
    assert asyncio.run(classify_emotion(FakeLLM({"emotion": "sad"}), "心情很差")) == Emotion.SAD


def test_classify_emotion_falls_back_to_neutral_and_skips_empty():
    assert asyncio.run(classify_emotion(FakeLLM(RuntimeError("boom")), "q")) == Emotion.NEUTRAL
    assert asyncio.run(classify_emotion(FakeLLM({"emotion": "ecstatic"}), "q")) == Emotion.NEUTRAL
    llm = FakeLLM({"emotion": "happy"})
    assert asyncio.run(classify_emotion(llm, "   ")) == Emotion.NEUTRAL
    assert llm.structured.calls == 0


def test_classify_emotion_logs_failure_class_without_user_text(caplog):
    secret = "我先生上個月走了"
    with caplog.at_level(logging.WARNING):
        assert asyncio.run(classify_emotion(FakeLLM(RuntimeError("boom")), secret)) == Emotion.NEUTRAL
    warnings = [r for r in caplog.records if r.levelno == logging.WARNING]
    assert len(warnings) == 1
    assert "RuntimeError" in warnings[0].getMessage()
    for record in caplog.records:
        assert secret not in record.getMessage()
        assert secret not in str(record.args)
