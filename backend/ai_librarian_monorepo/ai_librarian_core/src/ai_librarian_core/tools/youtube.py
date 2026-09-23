import json

from langchain_community.tools import YouTubeSearchTool
from pydantic import BaseModel, Field
from youtube_search import YoutubeSearch


class YouTubeSearchInput(BaseModel):
    query: str = Field(description="The query to search for on YouTube.")

class SchemaedYouTubeSearchTool(YouTubeSearchTool):
    """回傳「真實標題＋頻道＋連結」的 YouTube 搜尋。

    原版 YouTubeSearchTool 只回傳裸連結，LLM 拿不到標題就會自己編一個，
    造成「連結是真的、標題是掰的」（2026-09 系統測試回饋的錯誤回答問題）。
    """

    args_schema: type[BaseModel] = YouTubeSearchInput
    description: str = (
        "Search YouTube videos. Returns a JSON list of results with the REAL "
        "video title, channel and url. When presenting results to the user, "
        "you MUST use the returned titles verbatim — never invent, translate "
        "or rewrite them. 呈現給使用者時必須原樣使用回傳的 title，不可自行改寫。"
    )

    def _run(self, query: str) -> str:  # type: ignore[override]
        results = YoutubeSearch(query, max_results=5).to_dict()
        return json.dumps(
            [
                {
                    "title": r.get("title", ""),
                    "channel": r.get("channel", ""),
                    "duration": r.get("duration", ""),
                    "url": f"https://www.youtube.com{r.get('url_suffix', '')}",
                }
                for r in results
            ],
            ensure_ascii=False,
        )
