from pathlib import Path
from typing import Literal, Self

from pydantic import Field, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

PROJECT_ROOT_DIR = Path(__file__).resolve().parents[3]
DOTENV_PATH = PROJECT_ROOT_DIR / ".env"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=str(DOTENV_PATH),
        env_ignore_empty=True,
        extra="ignore",
    )

    # API settings
    # TODO(youkwan): Add a way to switch between development and production mode.
    host: str = "0.0.0.0"
    port: int = 8000
    reload: bool = False  # uvicorn auto-reload; keep off in production (StatReload pins a CPU)
    allowed_origins: list[str] | None = Field(default_factory=list)

    # LLM API keys
    openai_api_key: str | None = None
    anthropic_api_key: str | None = None
    google_api_key: str | None = None
    groq_api_key: str | None = None

    # Langsmith settings
    langsmith_tracing: Literal["false", "true"] = (
        "false"  # Define as Literal instead of bool to avoid langsmith's parsing issues.
        # TODO(youkwan): Test if this is still needed.
    )
    langsmith_api_key: str | None = None
    langsmith_project: str | None = None
    langsmith_endpoint: str = "https://api.smith.langchain.com"

    # Tools credentials
    google_cse_id: str | None = None
    openweathermap_api_key: str | None = None

    @model_validator(mode="after")
    def validate_at_least_one_llm__key(self) -> Self:
        if all(
            key is None
            for key in [
                self.openai_api_key,
                self.anthropic_api_key,
                self.google_api_key,
                self.groq_api_key,
            ]
        ):
            raise ValueError(
                "At least one LLM API key must be provided "
                "(one of: openai_api_key, anthropic_api_key, google_api_key, groq_api_key)"
            )
        return self

    @model_validator(mode="after")
    def validate_langsmith_settings(self) -> Self:
        if self.langsmith_tracing == "true" and self.langsmith_api_key is None:
            raise ValueError("langsmith_api_key is required when langsmith_tracing is enabled.")
        return self


def setup_settings():
    if not DOTENV_PATH.is_file():
        raise FileNotFoundError(f".env file not found at expected location: {DOTENV_PATH}")
    return Settings()


settings = setup_settings()


def main():
    from rich.pretty import pprint

    pprint(settings)


if __name__ == "__main__":
    main()
