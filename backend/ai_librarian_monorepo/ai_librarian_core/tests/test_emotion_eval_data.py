import json
from collections import Counter
from pathlib import Path

from ai_librarian_core.agents.react.emotion_classifier import EMOTION_PROMPT
from ai_librarian_core.agents.react.state import Emotion

DATA_PATH = Path(__file__).parent / "data" / "emotion_eval.jsonl"


def _rows() -> list[dict]:
    return [json.loads(line) for line in DATA_PATH.read_text(encoding="utf-8").splitlines() if line.strip()]


def test_eval_set_has_36_rows_six_per_label():
    rows = _rows()
    assert len(rows) == 36
    counts = Counter(row["label"] for row in rows)
    assert counts == {emotion.value: 6 for emotion in Emotion}


def test_eval_rows_are_well_formed():
    valid = {emotion.value for emotion in Emotion}
    for row in _rows():
        assert row["label"] in valid
        assert isinstance(row["user"], str)
        assert row["user"].strip()


def test_eval_samples_are_not_copied_from_the_prompt():
    for row in _rows():
        assert row["user"] not in EMOTION_PROMPT, row["user"]
