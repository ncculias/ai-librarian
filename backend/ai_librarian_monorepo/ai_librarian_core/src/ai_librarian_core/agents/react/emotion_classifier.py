import os
from collections.abc import Sequence
from typing import Any

from ai_librarian_core.agents.react.state import Emotion
from langchain_core.messages import BaseMessage, HumanMessage
from pydantic import BaseModel

EMOTION_MODEL = os.environ.get("EMOTION_MODEL", "openai:gpt-5.4-mini")
EMOTION_MAX_CHARS = 300

EMOTION_PROMPT = """你是圖書館 AI 館員「顏如玉」的情緒感知器。請只看使用者**最新的一句話**，判斷使用者此刻的情緒，
讓館員用合適的表情回應。回傳六個標籤之一。

- happy：開心、興奮、感謝、分享好消息、對館員表達喜歡。例：「太好了，終於找到這本書了！」「謝謝你，幫了大忙」
- sad：難過、失落、孤單、疲憊、生病、提到親友過世或離別、想被安慰。例：「我最近心情很差」「我先生上個月走了」
- angry：生氣、不耐煩、抱怨、不滿意（對館員、系統或其他人事物）。例：「你怎麼又答錯」「等這麼久還查不到，很煩」
- surprised：驚訝、意外、沒想到、「真的嗎？」式的反應。例：「什麼？這本書絕版了？」「哇，原來還有續集」
- think：猶豫、思考中、拿不定主意、提出需要一起想的開放問題。例：「我在想要不要讀這本」「不知道該選哪一本好」
- neutral：一般提問、查資料、下指令、閒聊問候；以及以上都不明確時。例：「幫我查今天台北的天氣」「介紹一下《小王子》」

規則：
1. 只看最新這一句，不看之前的對話。
2. 判斷的是**使用者本人**的情緒，不是話題的情緒：問「有沒有關於喪親的書」是查資料 → neutral；說「我媽媽走了，想找書看」是 sad。
3. 同一句有多種情緒時，取最明顯、或最後表達的那個。
4. 禮貌用語（請、謝謝、麻煩你）不等於 happy；一般的「謝謝」是 neutral，要有明顯高興才是 happy。
5. 很短或無法判讀的句子（「嗯」「好」「ok」「？」）→ neutral。
6. 拿不準一律 neutral。
7. 只回傳一個標籤。"""  # noqa: E501


class EmotionOutput(BaseModel):
    emotion: Emotion


def latest_user_text(messages: Sequence[BaseMessage]) -> str:
    """Return the text of the most recent HumanMessage, or "" if there is none."""
    for message in reversed(messages):
        if not isinstance(message, HumanMessage):
            continue
        content = message.content
        if isinstance(content, str):
            return content
        parts: list[str] = []
        for part in content:
            if isinstance(part, str):
                parts.append(part)
            elif isinstance(part, dict) and part.get("type", "text") == "text":
                parts.append(str(part.get("text", "")))
        return "".join(parts)
    return ""


def build_emotion_input(user_text: str) -> str:
    return f"{EMOTION_PROMPT}\n\n使用者最新的一句話：{user_text[:EMOTION_MAX_CHARS]}\n\n只回傳 emotion 欄位。"


async def classify_emotion(llm: Any, user_text: str) -> Emotion:
    """Classify the user's emotion; any failure or empty input yields NEUTRAL."""
    if not user_text.strip():
        return Emotion.NEUTRAL
    try:
        structured = llm.with_structured_output(EmotionOutput)
        response = await structured.ainvoke(build_emotion_input(user_text.strip()))
        if isinstance(response, EmotionOutput):
            value: Any = response.emotion
        elif isinstance(response, dict):
            value = response.get("emotion")
        else:
            value = getattr(response, "emotion", None)
        return value if isinstance(value, Emotion) else Emotion(value)
    except Exception:
        return Emotion.NEUTRAL
