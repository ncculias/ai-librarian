from importlib import metadata

import uvicorn
from dotenv import load_dotenv
from fastapi import FastAPI

from ai_librarian_apis.core.cors import setup_cors
from ai_librarian_apis.core.lifespan import lifespan
from ai_librarian_apis.core.settings import settings
from ai_librarian_apis.routes.react import react_emotion_router, react_router
from ai_librarian_apis.routes.story_book import story_book_router
from ai_librarian_apis.routes.system import system_router
from ai_librarian_apis.routes.tools import tools_router


def create_app() -> FastAPI:
    load_dotenv()
    __version__ = metadata.version("ai-librarian-apis")
    app = FastAPI(title="AI Librarian APIs", version=__version__, lifespan=lifespan)
    setup_cors(app)

    app.include_router(system_router)
    app.include_router(tools_router, prefix="/v1")
    app.include_router(react_router, prefix="/v1")
    app.include_router(react_emotion_router, prefix="/v2")
    app.include_router(story_book_router, prefix="/v1")
    return app


app = create_app()

if __name__ == "__main__":
    uvicorn.run(
        "ai_librarian_apis.main:app",
        host=settings.host,
        port=settings.port,
        reload=settings.reload,
    )
