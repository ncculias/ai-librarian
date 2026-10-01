"""NBINet（全國圖書書目資訊網）聯合目錄查詢。

2026-09-30 重寫：原實作以 Playwright 爬國圖 aleweb 館藏系統，
(1) 本機 IP 網段遭 aleweb 反爬蟲 403 封鎖、(2) 瀏覽器爬蟲笨重（原作者 TODO 亦言明）。
改走 NBINet 新版聯合目錄（Ex Libris Primo，雲端主機）之公開 JSON 查詢介面：
無需瀏覽器與憑證、涵蓋全國圖書館館藏（含國圖）、回應快且不觸發反爬蟲。
類別與方法簽名維持不變（NCLSearch.run / AsyncNCLSearch.arun），tools 層無感。
"""

import asyncio
import time
import urllib.parse

import httpx
from pydantic import BaseModel, Field

PRIMO_BASE = "https://nbinet.primo.exlibrisgroup.com"
PRIMO_VID = "886NCL_NBINET:NBINET"
PRIMO_INST = "886NCL_NBINET"
USER_AGENT = "ai-librarian/1.0 (academic research; NCCU LIAS)"

# 禮貌性節流：兩次查詢至少間隔 NCL_MIN_INTERVAL 秒
NCL_MIN_INTERVAL = 2.0
_last_crawl_at = 0.0


class NCLCrawlerError(Exception):
    pass


class NCLCrawlerCookieTimeoutError(NCLCrawlerError):
    """保留舊名稱以維持相容（現行實作不再使用 cookie）。"""


class NCLCrawlerSessionIdNotFoundError(NCLCrawlerError):
    """保留舊名稱以維持相容。"""


class NCLCrawlerSearchTimeoutError(NCLCrawlerError):
    pass


class NCLCrawlerAccessDeniedError(NCLCrawlerError):
    """目錄服務拒絕存取。"""


class NCLCrawlerSearchNoResultsError(NCLCrawlerError):
    pass


def _throttle_sync() -> None:
    global _last_crawl_at
    wait = _last_crawl_at + NCL_MIN_INTERVAL - time.monotonic()
    if wait > 0:
        time.sleep(wait)
    _last_crawl_at = time.monotonic()


async def _throttle_async() -> None:
    global _last_crawl_at
    wait = _last_crawl_at + NCL_MIN_INTERVAL - time.monotonic()
    if wait > 0:
        await asyncio.sleep(wait)
    _last_crawl_at = time.monotonic()


def _search_url(query: str, limit: int) -> str:
    q = urllib.parse.quote(f"any,contains,{query}", safe="")
    return (
        f"{PRIMO_BASE}/primaws/rest/pub/pnxs"
        f"?citationTrailFilterByAvailability=true&limit={limit}&newspapersActive=false"
        f"&newspapersSearch=false&offset=0&pcAvailability=true&scope=MyInstitution"
        f"&searchInFulltextUserSelection=false&disableCache=false&skipDelivery=Y&sort=rank"
        f"&tab=LibraryCatalog&inst={PRIMO_INST}&rapido=false&refEntryActive=false&rtaLinks=true"
        f"&qInclude=&qExclude=&multiFacets=&q={q}&isCDSearch=false&lang=zh-tw&vid={PRIMO_VID}"
    )


def _first(values: list | None) -> str:
    if not values:
        return ""
    v = str(values[0])
    # Primo 欄位常帶 "$$Q..." 之類的內部標記，取乾淨前段
    return v.split("$$")[0].strip()


def _parse_docs(data: dict, top_k: int) -> list[dict[str, str]]:
    docs = data.get("docs", [])
    results: list[dict[str, str]] = []
    for doc in docs:
        display = doc.get("pnx", {}).get("display", {})
        control = doc.get("pnx", {}).get("control", {})
        title = _first(display.get("title"))
        if not title:
            continue
        author = _first(display.get("creator")) or _first(display.get("contributor"))
        date = _first(display.get("creationdate"))
        publisher = _first(display.get("publisher"))
        record_id = _first(control.get("recordid")) or doc.get("pnxId", "")
        link = (
            f"{PRIMO_BASE}/discovery/fulldisplay?docid={urllib.parse.quote(str(record_id))}"
            f"&vid={PRIMO_VID}&lang=zh-tw"
            if record_id
            else f"{PRIMO_BASE}/nde/home?vid={PRIMO_VID}"
        )
        results.append(
            {"title": title, "author": author, "date": date, "publisher": publisher, "link": link}
        )
        if len(results) >= top_k:
            break
    return results


def _format_results(results: list[dict[str, str]]) -> str:
    lines = []
    for i, r in enumerate(results):
        meta = "，".join(x for x in [r["author"], r["publisher"], r["date"]] if x)
        lines.append(f"{i + 1}. {r['title']}（{meta}） - {r['link']}")
    return "\n".join(lines)


def _raise_for_response(resp: httpx.Response, query: str) -> dict:
    if resp.status_code == 403:
        raise NCLCrawlerAccessDeniedError(
            "聯合目錄服務拒絕存取（403）。請改用其他資料來源回答，並告知使用者館藏查詢暫時無法使用。"
        )
    resp.raise_for_status()
    data = resp.json()
    if not data.get("docs"):
        raise NCLCrawlerSearchNoResultsError(
            f"No results found for query: {query}. Please try again with a different query."
        )
    return data


class BaseNCLSearch(BaseModel):
    """NBINet 聯合目錄查詢的共用設定。

    Attributes:
        top_k_results (int): 最多回傳幾筆（預設 10，1–20）。
        search_timeout (int): 查詢逾時（毫秒，預設 15000）。
    """

    top_k_results: int = Field(default=10, ge=1, le=20)
    # 保留欄位名以維持相容；cookie_timeout 於新實作無作用
    cookie_timeout: int = Field(default=10000)
    search_timeout: int = Field(default=15000)


class NCLSearch(BaseNCLSearch):
    """同步版聯合目錄查詢。"""

    def run(self, query: str) -> str:
        _throttle_sync()
        url = _search_url(query, self.top_k_results)
        try:
            with httpx.Client(timeout=self.search_timeout / 1000) as client:
                resp = client.get(url, headers={"User-Agent": USER_AGENT})
        except httpx.TimeoutException as e:
            raise NCLCrawlerSearchTimeoutError(
                f"Timeout while searching, exceeded search_timeout({self.search_timeout}ms)."
            ) from e
        data = _raise_for_response(resp, query)
        return _format_results(_parse_docs(data, self.top_k_results))


class AsyncNCLSearch(BaseNCLSearch):
    """非同步版聯合目錄查詢。"""

    async def arun(self, query: str) -> str:
        await _throttle_async()
        url = _search_url(query, self.top_k_results)
        try:
            async with httpx.AsyncClient(timeout=self.search_timeout / 1000) as client:
                resp = await client.get(url, headers={"User-Agent": USER_AGENT})
        except httpx.TimeoutException as e:
            raise NCLCrawlerSearchTimeoutError(
                f"Timeout while searching, exceeded search_timeout({self.search_timeout}ms)."
            ) from e
        data = _raise_for_response(resp, query)
        return _format_results(_parse_docs(data, self.top_k_results))
