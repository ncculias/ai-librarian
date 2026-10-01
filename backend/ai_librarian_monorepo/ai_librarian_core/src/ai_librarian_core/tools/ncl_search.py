from ai_librarian_core.wrapper.ncl_search import AsyncNCLSearch, NCLSearch
from langchain_core.callbacks import AsyncCallbackManagerForToolRun, CallbackManagerForToolRun
from langchain_core.tools import BaseTool
from pydantic import BaseModel, Field


class NCLSearchInput(BaseModel):
    """The input of the NCLSearch tool."""

    query: str = Field(description="The query to search the NCL catalog.")


class NCLSearchRun(BaseTool):
    """A tool for searching the Taiwan National Central Library(NCL, 國家圖書館) catalog.

    This tool allows searching books in the NCL catalog by keywords. It returns a formatted
    string containing book information including title, author and link.

    Example:
        >>> ncl_search_tool = NCLSearchRun()
        >>> result = ncl_search_tool.invoke({"query": "Artificial Intelligence"})
        >>> print(result)
        1. Artificial Intelligence: A Modern Approach (Stuart Russell) - https://aleweb.ncl.edu.tw/F/...
        2. Artificial Intelligence and Deep Learning (Ian Goodfellow) - https://aleweb.ncl.edu.tw/F/...
        ...
    """

    name: str = "ncl_search"
    description: str = (
        "A tool for searching NBINet（全國圖書書目資訊網）, the Taiwan national union catalog "
        "hosted by the National Central Library(NCL, 國家圖書館), covering holdings of libraries nationwide."
        "The search results are returned in a string, containing the title, author, publisher, year and link."
        "Use the returned fields verbatim; the link opens the full catalog record."
    )
    ncl_search: NCLSearch = Field(default_factory=NCLSearch)
    async_ncl_search: AsyncNCLSearch = Field(default_factory=AsyncNCLSearch)
    args_schema: type[BaseModel] = NCLSearchInput

    def _run(
        self,
        query: str,
        run_manager: CallbackManagerForToolRun | None = None,
    ) -> str:
        return self.ncl_search.run(query)

    async def _arun(
        self,
        query: str,
        run_manager: AsyncCallbackManagerForToolRun | None = None,
    ) -> str:
        return await self.async_ncl_search.arun(query)
