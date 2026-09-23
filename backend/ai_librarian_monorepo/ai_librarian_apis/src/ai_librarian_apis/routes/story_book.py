import asyncio
import base64
import io
import os
import re
import struct

import httpx
from ai_librarian_apis.core.logger import logger
from ai_librarian_apis.schemas.error import ErrorResponse
from ai_librarian_apis.schemas.story_book import (
    IllustrateRequest,
    SpeakRequest,
    StoryBook,
    StoryChatRequest,
    StoryChatResponse,
    StoryRequest,
)
from fastapi import APIRouter, HTTPException, Response
from langchain.chat_models import init_chat_model
from langchain_core.messages import AIMessage, HumanMessage, SystemMessage
from openai import AsyncOpenAI

story_book_router = APIRouter(prefix="/story-book", tags=["Story Book"])

# 看圖寫故事用最便宜的多模態模型（與專案預設一致）
STORY_MODEL = "openai:gpt-4o-mini"

# 把照片重繪成繪本插畫（2026-07-23 評估：1.5 忠實度較高且便宜 19%，汰換 gpt-image-1）
ILLUSTRATE_MODEL = "gpt-image-1.5"
ILLUSTRATE_QUALITY = "medium"  # low/medium/high；medium 兼顧品質與成本（約 NT$1.05/張）
ILLUSTRATE_PROMPT = (
    "把這張照片重繪成溫暖、柔和的兒童繪本插畫風格："
    "手繪水彩感、線條柔和、色彩溫暖明亮，"
    "盡量保留原本照片的主要構圖、人物姿態與場景氛圍。只輸出一張插畫圖片。"
)

# 朗讀：Gemini TTS（用同一把 GOOGLE_API_KEY，唸中文比 OpenAI 自然）
GEMINI_TTS_URL = (
    "https://generativelanguage.googleapis.com/v1beta/models/"
    "gemini-2.5-flash-preview-tts:generateContent"
)
GEMINI_TTS_VOICE = "Kore"  # 溫暖、沉穩的聲線


def _pcm_to_wav(pcm: bytes, sample_rate: int, channels: int = 1, bits: int = 16) -> bytes:
    """把 Gemini 回傳的原始 PCM 包成瀏覽器可播的 WAV。"""
    byte_rate = sample_rate * channels * bits // 8
    block_align = channels * bits // 8
    data_len = len(pcm)
    header = (
        b"RIFF"
        + struct.pack("<I", 36 + data_len)
        + b"WAVE"
        + b"fmt "
        + struct.pack("<IHHIIHH", 16, 1, channels, sample_rate, byte_rate, block_align, bits)
        + b"data"
        + struct.pack("<I", data_len)
    )
    return header + pcm

SYSTEM_PROMPT = (
    "你是一位溫暖、擅長說故事的繪本作家。"
    "使用者會給你幾張照片，這些照片承載著一段珍貴的回憶。"
    "請你先『看懂全部照片』，理解它們之間的關聯，再把它們編織成「一個」完整、動人的故事。\n"
    "最重要的原則：這是『一個連貫的故事』，不是各自獨立的『看圖說話』。\n"
    "規則：\n"
    "1. 先綜觀所有照片，找出它們可以串成的故事線；"
    "你可以『自行重新安排照片的順序』，挑選最適合當開頭、發展與結尾的排列，讓故事最自然動人。"
    "用每一頁的 photo_index 標明該頁對應第幾張照片（從 0 開始），每張照片只能用一次，頁數等於照片張數。\n"
    "2. 連貫性是重點：每一頁都要『承接上一頁、為下一頁鋪陳』，"
    "用時間推進、地點移動或情感變化把所有照片串起來，形成有開頭、發展、轉折、溫暖結尾的整體。"
    "不要只是分別描述每張照片裡有什麼。\n"
    "3. 以『溫暖回憶』的口吻書寫，並『依照片內容自然選擇人稱』，不要硬套不確定的稱呼：\n"
    "   - 若像是在記錄自己的經歷，可用「我」或「我們」；\n"
    "   - 若照片中有許多人一起，可用「大家」這類中立的說法；\n"
    "   - 若照片像是在描述他人（例如孫子、孫女、家人、朋友），就用合適、溫暖的稱呼或中立的描述。\n"
    "   原則：貼近照片裡實際看到的內容，寧可用中立的描述，也絕不要說出與照片不符的人稱或關係。\n"
    "4. 每頁有一個簡短小標（4~8 字）和一段約 70~100 字的故事文字，內容充實但不冗長。\n"
    "5. 全部使用繁體中文，語氣溫暖、口語、好讀，避免艱深詞彙。\n"
    "6. 為整本書取一個能貫穿全書的書名與一句副標。\n"
    "7. 另外寫一段獨立的『結尾語』(closing)，一到兩句、約 40~60 字，"
    "溫暖地為整段回憶做總結、呼應整個故事；"
    "這段是專屬的收尾，內容不可以和任何一頁的故事文字重複。"
)


@story_book_router.post(
    "/generate",
    description=(
        "接收使用者上傳的數張照片（建議 3~5 張，以 data URL/base64 夾帶），"
        "呼叫多模態 LLM 看懂照片後，串成一本前後連貫的故事書並回傳"
        "（書名、副標、每頁小標與故事文字）。"
    ),
    summary="依照片生成一本故事書",
    responses={400: {"model": ErrorResponse}, 500: {"model": ErrorResponse}},
)
async def generate_story_book(req: StoryRequest) -> StoryBook:
    photos = [p for p in req.photos if p]
    if not photos:
        raise HTTPException(status_code=400, detail="請至少上傳一張照片。")

    image_blocks = [
        {"type": "image_url", "image_url": {"url": url}} for url in photos
    ]
    human_content: list[dict] = [
        {
            "type": "text",
            "text": (
                f"這裡有 {len(image_blocks)} 張照片，請依照給你的順序，"
                f"把它們串成一個連貫的故事，總共要剛好 {len(image_blocks)} 頁。"
            ),
        },
        *image_blocks,
    ]
    messages = [
        SystemMessage(content=SYSTEM_PROMPT),
        HumanMessage(content=human_content),
    ]

    try:
        llm = init_chat_model(model=STORY_MODEL, temperature=0.8)
        structured_llm = llm.with_structured_output(StoryBook)
        result = await structured_llm.ainvoke(messages)
    except Exception as e:  # noqa: BLE001 - 對前端統一回 500
        logger.exception("Story book generation failed")
        raise HTTPException(status_code=500, detail="生成故事時發生錯誤，請稍後再試。") from e

    return result  # type: ignore[return-value]


@story_book_router.post(
    "/speak",
    description="把一段故事文字轉成自然真人語音（Gemini TTS，聲線 Kore），回傳 wav 音檔。",
    summary="文字轉語音（真人朗讀）",
    responses={400: {"model": ErrorResponse}, 500: {"model": ErrorResponse}},
)
async def speak(req: SpeakRequest) -> Response:
    text = req.text.strip()
    if not text:
        raise HTTPException(status_code=400, detail="沒有可朗讀的文字。")

    # 兩把鑰匙分工（2026-09-20）：GEMINI_API_KEY 專職語音（新版 AQ. 驗證金鑰），
    # GOOGLE_API_KEY 專職查書＋Google 搜尋（傳統 AIza 金鑰，Google 新制不允許一鑰通用）
    key = os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY")
    if not key:
        raise HTTPException(status_code=500, detail="伺服器未設定 GEMINI_API_KEY。")

    payload = {
        "contents": [
            {"parts": [{"text": f"請用溫柔、溫暖、自然的口氣，以一般正常、流暢的語速（不要太慢）念這段故事：{text}"}]}
        ],
        "generationConfig": {
            "responseModalities": ["AUDIO"],
            "speechConfig": {
                "voiceConfig": {"prebuiltVoiceConfig": {"voiceName": GEMINI_TTS_VOICE}}
            },
        },
    }

    try:
        async with httpx.AsyncClient(timeout=120) as client:
            # 免費版 Gemini TTS 限流很緊：每分鐘 3 次、每天 10 次。
            # 撞到「每分鐘」限流就等一下重試；「每日」額度用完重試也沒用，直接回明確訊息。
            for attempt in range(3):
                resp = await client.post(f"{GEMINI_TTS_URL}?key={key}", json=payload)
                if resp.status_code == 429:
                    if "PerDay" in resp.text:
                        raise HTTPException(
                            status_code=429,
                            detail="今天的語音額度用完了（免費版每天 10 次），明天會自動恢復。",
                        )
                    if attempt < 2:
                        await asyncio.sleep(22)
                        continue
                resp.raise_for_status()
                break
            data = resp.json()
        part = data["candidates"][0]["content"]["parts"][0]["inlineData"]
        pcm = base64.b64decode(part["data"])
        rate_match = re.search(r"rate=(\d+)", part.get("mimeType", ""))
        sample_rate = int(rate_match.group(1)) if rate_match else 24000
        wav_bytes = _pcm_to_wav(pcm, sample_rate)
    except HTTPException:
        raise  # 上面已包好明確訊息（如每日額度用完），原樣回給前端
    except Exception as e:  # noqa: BLE001 - 對前端統一回 500
        logger.exception("Text-to-speech failed")
        raise HTTPException(status_code=500, detail="朗讀產生失敗，請稍後再試。") from e

    return Response(content=wav_bytes, media_type="audio/wav")


@story_book_router.post(
    "/illustrate",
    description=(
        "把一張使用者照片重繪成繪本插畫風（OpenAI gpt-image-1.5），"
        "回傳重繪後的圖片 data URL。故事文字不變，只換圖。"
    ),
    summary="照片重繪成繪本插畫",
    responses={400: {"model": ErrorResponse}, 500: {"model": ErrorResponse}},
)
async def illustrate(req: IllustrateRequest) -> dict:
    m = re.match(r"data:(image/[\w.+-]+);base64,(.+)", req.photo, re.S)
    if not m:
        raise HTTPException(status_code=400, detail="照片格式不正確。")
    mime, b64 = m.group(1), m.group(2)
    try:
        data = base64.b64decode(b64)
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=400, detail="照片資料無法解析。") from e

    ext = mime.split("/")[-1].split("+")[0]
    try:
        client = AsyncOpenAI()  # 自動讀 OPENAI_API_KEY
        result = await client.images.edit(
            model=ILLUSTRATE_MODEL,
            image=(f"photo.{ext}", io.BytesIO(data), mime),
            prompt=ILLUSTRATE_PROMPT,
            size="1024x1024",
            quality=ILLUSTRATE_QUALITY,
        )
        out_b64 = result.data[0].b64_json
    except Exception as e:  # noqa: BLE001 - 對前端統一回 500
        logger.exception("Illustrate failed")
        raise HTTPException(status_code=500, detail="重繪插畫失敗，請稍後再試。") from e

    return {"image": f"data:image/png;base64,{out_b64}"}


CHAT_SYSTEM_PROMPT = (
    "你是一位溫暖的回憶陪伴者，正在陪一位長輩看他的相片故事書、聊聊照片裡的回憶。\n"
    "對話規則：\n"
    "1. 句子要短、口語、親切，像家人聊天，不用任何專有名詞。\n"
    "2. 一次只問一個問題，而且要是開放式的（在哪裡、跟誰、當時的心情）。\n"
    "3. 長輩說的回憶永遠是對的：不糾正、不查證，先接住他的話、給溫暖的回應，再延伸。\n"
    "4. 長輩不知道聊什麼時，就從照片或故事的細節找話題。\n"
    "5. 回話控制在兩三句以內，方便朗讀。"
)


@story_book_router.post(
    "/chat",
    description=(
        "繪本回憶問答：AI 以整本故事＋當前頁照片為背景，主動用開放式問題引導長輩聊回憶；"
        "messages 傳空陣列代表請 AI 開口問第一個問題。"
    ),
    summary="跟這本故事書聊聊（回憶陪伴）",
    responses={500: {"model": ErrorResponse}},
)
async def story_chat(req: StoryChatRequest) -> StoryChatResponse:
    story = req.story
    idx = min(max(req.page_index, 0), max(len(story.pages) - 1, 0))
    page = story.pages[idx] if story.pages else None
    page_brief = (
        f"目前翻到第 {idx + 1} 頁「{page.heading}」：{page.text}" if page else "目前在封面。"
    )
    context = (
        f"這本故事書叫《{story.title}》，副標是「{story.subtitle}」。\n"
        f"{page_brief}\n"
        "接下來請圍繞這一頁（和照片）陪長輩聊。"
    )

    history: list = [SystemMessage(content=CHAT_SYSTEM_PROMPT)]
    context_content: list[dict] = [{"type": "text", "text": context}]
    if req.photo:
        context_content.append({"type": "image_url", "image_url": {"url": req.photo}})
    history.append(HumanMessage(content=context_content))
    history.append(AIMessage(content="好的，我會溫暖地陪這位長輩聊這一頁的回憶。"))

    for m in req.messages:
        if m.role == "assistant":
            history.append(AIMessage(content=m.content))
        else:
            history.append(HumanMessage(content=m.content))
    if not req.messages:
        history.append(
            HumanMessage(content="（長輩剛翻開這一頁，請你先開口，用一個溫暖的問題開啟話題。）")
        )

    try:
        llm = init_chat_model(model=STORY_MODEL, temperature=0.7)
        result = await llm.ainvoke(history)
        reply = str(result.content).strip()
    except Exception as e:  # noqa: BLE001 - 對前端統一回 500
        logger.exception("Story chat failed")
        raise HTTPException(status_code=500, detail="聊天回應失敗，請稍後再試。") from e

    return StoryChatResponse(reply=reply)
