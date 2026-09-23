from enum import StrEnum

from pydantic import BaseModel, ConfigDict, Field


class Model(StrEnum):
    """Enumeration of supported language models (LLMs).

    This enum can be extended with any model listed in the LangChain chat models documentation:
    https://python.langchain.com/docs/integrations/chat/

    Note: The first model in this enum will be displayed as the default model in ReDoc,
    since ReDoc does not respect Pydantic's default settings like Swagger and uses the first enum value as default.
    """

    # OpenAI（2026-09 更新：GPT-5.4 世代為現役主力；gpt-4o 系列為 legacy 備援）
    OPENAI_GPT_5_4_MINI = "openai:gpt-5.4-mini"  # First model will be the default in ReDoc
    OPENAI_GPT_5_4 = "openai:gpt-5.4"
    OPENAI_GPT_5_4_NANO = "openai:gpt-5.4-nano"
    OPENAI_GPT_5_1 = "openai:gpt-5.1"
    OPENAI_GPT_4O_MINI = "openai:gpt-4o-mini"
    OPENAI_GPT_4O = "openai:gpt-4o"
    OPENAI_GPT_O4_MINI = "openai:o4-mini"
    OPENAI_GPT_4_1 = "openai:gpt-4.1"
    OPENAI_GPT_4_1_MINI = "openai:gpt-4.1-mini"
    OPENAI_GPT_4_1_NANO = "openai:gpt-4.1-nano"
    OPENAI_O3_MINI = "openai:o3-mini"
    OPENAI_O1 = "openai:o1"

    # Anthropic
    ANTHROPIC_CLAUDE_3_7_SONNET = "anthropic:claude-3-7-sonnet-latest"
    ANTHROPIC_CLAUDE_3_5_HAIKU = "anthropic:claude-3-5-haiku-latest"
    ANTHROPIC_CLAUDE_3_5_SONNET_V2 = "anthropic:claude-3-5-sonnet-latest"
    ANTHROPIC_CLAUDE_3_5_SONNET = "anthropic:claude-3-5-sonnet-20240620"

    # Google GenAI
    GEMINI_2_5_PRO = "google_genai:gemini-2.5-pro"
    GEMINI_2_5_FLASH = "google_genai:gemini-2.5-flash"
    GEMINI_2_5_FLASH_LITE = "google_genai:gemini-2.5-flash-lite"

    # Groq
    LLAMA_3_3_70B_VERSATILE = "groq:llama-3.3-70b-versatile"
    LLAMA_3_1_8B_INSTANT = "groq:llama-3.1-8b-instant"

    @classmethod
    def list(cls) -> list[str]:
        return [model.value for model in cls]


class LLMConfig(BaseModel):
    """The settings behind the Agent's LLM core.

    Controls the behavior and output characteristics of the language model.
    """

    model: Model = Field(
        default=Model.OPENAI_GPT_4O_MINI,
        description="The specific LLM model identifier to use for processing requests.",
        examples=[Model.OPENAI_GPT_4O_MINI],
    )
    temperature: float = Field(
        default=1,
        description=(
            "Controls randomness of outputs. "
            "Higher values make output more random, lower values make output more deterministic."
        ),
        examples=[1],
        ge=0,
        le=2,
    )
    max_tokens: int | None = Field(
        default=2000,
        description=(
            "Maximum number of tokens (words/word pieces) to generate in the response. "
            "None means no specific limit beyond model's context length."
        ),
        examples=[2000],
    )

    model_config = ConfigDict(frozen=True)
