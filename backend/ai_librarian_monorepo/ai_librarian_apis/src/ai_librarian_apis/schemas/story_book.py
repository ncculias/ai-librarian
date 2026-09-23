from pydantic import BaseModel, Field


class StoryRequest(BaseModel):
    """前端送來的生成請求：照片以 data URL（base64）夾帶，避免依賴 multipart。"""

    photos: list[str] = Field(
        description="照片的 data URL 列表（data:image/...;base64,...），陣列順序即故事的頁面順序。"
    )


class SpeakRequest(BaseModel):
    """朗讀請求：把一段故事文字轉成自然真人語音。"""

    text: str = Field(description="要朗讀的故事文字（繁體中文）。")


class IllustrateRequest(BaseModel):
    """重繪請求：把一張照片重繪成繪本插畫風。"""

    photo: str = Field(description="要重繪的照片，data URL（data:image/...;base64,...）。")


class StoryPage(BaseModel):
    """繪本的一頁：對應一張照片。"""

    photo_index: int = Field(
        description=(
            "這一頁對應『第幾張上傳的照片』，從 0 開始（0=第一張）。"
            "你可以重新安排照片順序讓故事更動人，但每張照片在整本書只能使用一次。"
        )
    )
    heading: str = Field(description="這一頁的簡短小標，4~8 個字，例如「出發」「最重要的人」。")
    text: str = Field(description="這一頁的故事文字，繁體中文，約 70~100 字，溫暖好讀、與前後頁連貫。")


class ChatMessage(BaseModel):
    """一則對話：role 只會是 user（長輩）或 assistant（AI 陪伴者）。"""

    role: str = Field(description="user 或 assistant。")
    content: str = Field(description="這一句話的內容（繁體中文）。")


class StoryChatRequest(BaseModel):
    """繪本回憶問答：AI 拿整本故事＋當前頁照片當背景，引導長輩聊回憶。"""

    story: "StoryBook" = Field(description="整本故事書（generate 的回傳值原樣帶回）。")
    page_index: int = Field(
        default=0, description="目前翻到的故事頁（從 0 開始，對應 story.pages）。"
    )
    messages: list[ChatMessage] = Field(
        default_factory=list,
        description="到目前為止的對話歷史；空陣列代表請 AI 開口問第一個問題。",
    )
    photo: str | None = Field(
        default=None, description="當前頁照片的 data URL，讓 AI 能就照片細節提問（選傳）。"
    )


class StoryChatResponse(BaseModel):
    """AI 陪伴者的回話。"""

    reply: str = Field(description="AI 的一句回話（繁體中文、口語、最多一個問題）。")


class StoryBook(BaseModel):
    """一本完整的故事書（由 AI 看照片後生成）。"""

    title: str = Field(description="整本故事書的書名，溫暖、簡短，不超過 12 個字。")
    subtitle: str = Field(description="一句溫暖的副標，描述整本書的感覺。")
    pages: list[StoryPage] = Field(
        description="每一頁對應一張照片；頁數等於照片張數。"
    )
    closing: str = Field(
        description=(
            "整本書的結尾語：一到兩句、約 40~60 字，溫暖地為整段回憶收尾、呼應整個故事。"
            "這是獨立的收尾，不可以重複任何一頁已經寫過的內容。"
        )
    )
