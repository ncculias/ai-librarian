FROM python:3.13.3-slim-bookworm

COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/

ENV UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy

WORKDIR /app

COPY pyproject.toml uv.lock ./
COPY ai_librarian_monorepo/ai_librarian_apis/pyproject.toml ./ai_librarian_monorepo/ai_librarian_apis/
COPY ai_librarian_monorepo/ai_librarian_core/pyproject.toml ./ai_librarian_monorepo/ai_librarian_core/

RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --locked --no-dev --no-install-workspace

RUN .venv/bin/playwright install --with-deps

COPY . .

RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --locked --no-dev

CMD ["uv", "run", "--frozen", "--no-dev", "ai_librarian_monorepo/ai_librarian_apis/src/ai_librarian_apis/main.py"]
