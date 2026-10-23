"""Evaluate the user-emotion classifier against the labelled set.

Run from ``backend/``::

    uv run python scripts/eval_emotion.py [--limit N] [--model ID] [--data PATH] [--show-errors]

Needs ``OPENAI_API_KEY`` (loaded from the environment or ``ai_librarian_monorepo/ai_librarian_apis/.env``).
"""

import argparse
import asyncio
import json
from pathlib import Path

from ai_librarian_core.agents.react.emotion_classifier import EMOTION_MODEL, classify_emotion
from ai_librarian_core.agents.react.state import Emotion
from dotenv import load_dotenv
from langchain.chat_models import init_chat_model

DEFAULT_DATA = (
    Path(__file__).resolve().parent.parent
    / "ai_librarian_monorepo"
    / "ai_librarian_core"
    / "tests"
    / "data"
    / "emotion_eval.jsonl"
)
CONCURRENCY = 4
LABELS = [emotion.value for emotion in Emotion]


def load_rows(path: Path, limit: int | None) -> list[dict[str, str]]:
    rows = [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]
    return rows[:limit] if limit else rows


async def predict_all(model: str, rows: list[dict[str, str]]) -> list[str]:
    llm = init_chat_model(model, temperature=0, max_tokens=16)
    semaphore = asyncio.Semaphore(CONCURRENCY)

    async def one(row: dict[str, str]) -> str:
        async with semaphore:
            return (await classify_emotion(llm, row["user"])).value

    return list(await asyncio.gather(*(one(row) for row in rows)))


def report(rows: list[dict[str, str]], preds: list[str], show_errors: bool) -> None:
    gold = [row["label"] for row in rows]
    total = len(rows)
    correct = sum(g == p for g, p in zip(gold, preds, strict=True))
    print(f"accuracy: {correct}/{total} = {100 * correct / total:.1f}%\n")

    matrix = {g: dict.fromkeys(LABELS, 0) for g in LABELS}
    for g, p in zip(gold, preds, strict=True):
        matrix[g][p] += 1

    print(f"{'label':<10}{'support':>8}{'precision':>11}{'recall':>8}")
    for label in LABELS:
        support = sum(matrix[label].values())
        predicted = sum(matrix[g][label] for g in LABELS)
        tp = matrix[label][label]
        precision = f"{tp / predicted:.2f}" if predicted else "-"
        recall = f"{tp / support:.2f}" if support else "-"
        print(f"{label:<10}{support:>8}{precision:>11}{recall:>8}")

    print("\nconfusion matrix (rows = gold, columns = predicted)")
    print(f"{'':<10}" + "".join(f"{label:>10}" for label in LABELS))
    for g in LABELS:
        print(f"{g:<10}" + "".join(f"{matrix[g][p]:>10}" for p in LABELS))

    if show_errors:
        print("\nmisclassified")
        for row, pred in zip(rows, preds, strict=True):
            if row["label"] != pred:
                print(f"{row['label']} → {pred}: {row['user']}")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--data", type=Path, default=DEFAULT_DATA, help="path to the jsonl evaluation set")
    parser.add_argument("--model", default=EMOTION_MODEL, help="classifier model id (default: EMOTION_MODEL)")
    parser.add_argument("--limit", type=int, default=None, help="only evaluate the first N rows")
    parser.add_argument("--show-errors", action="store_true", help="list misclassified sentences")
    args = parser.parse_args()

    load_dotenv()
    load_dotenv("ai_librarian_monorepo/ai_librarian_apis/.env")

    rows = load_rows(args.data, args.limit)
    print(f"model: {args.model}  samples: {len(rows)}\n")
    report(rows, asyncio.run(predict_all(args.model, rows)), args.show_errors)


if __name__ == "__main__":
    main()
