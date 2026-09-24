import requests
from langchain_core.utils import get_from_dict_or_env
from pydantic import BaseModel, Field, model_validator

GOOGLE_BOOKS_API_URL = "https://www.googleapis.com/books/v1/volumes"


class GoogleBooksAPIWrapperError(Exception):
    pass


class GoogleBooksAPIWrapperHTTPError(GoogleBooksAPIWrapperError):
    pass


class GoogleBooksAPIWrapperTimeoutError(GoogleBooksAPIWrapperError):
    pass


class GoogleBooksAPIWrapperTooManyRedirectsError(GoogleBooksAPIWrapperError):
    pass


class GoogleBooksAPIWrapperRequestExceptionError(GoogleBooksAPIWrapperError):
    pass


class GoogleBooksAPIWrapper(BaseModel):
    """A modified Google Books API wrapper.

    A wrapper around Google Books API that adds error handling for missing fields and empty author lists.
    Inherits from the original GoogleBooksAPIWrapper and overrides methods to add robustness.

    Original GoogleBooksAPIWrapper class:
        https://github.com/langchain-ai/langchain-community/blob/main/libs/community/langchain_community/utilities/google_books.py

    Modifications:
        1. Added null checks for volumeInfo fields (title, authors, description, infoLink)
        2. Fixed index out of range error when authors list is empty

    Args:
        google_api_key(str): API key for accessing Google Books API
        top_k_results(int): Maximum number of book results to return (default: 5)

    Attributes:
        google_api_key(str): API key for accessing Google Books API
        top_k_results(int): Maximum number of book results to return (default: 5)

    Returns:
        str: A formatted string containing book search results with title, authors, summary and source link

    Example:
        >>> api_wrapper=GoogleBooksAPIWrapper(google_api_key=your_google_api_key, top_k_results=5)
        >>> print(api_wrapper.run("AI"))
        Here are 5 suggestions for books related to AI:
        1. "AI Superpowers" by Kai-Fu Lee: An analysis of AI's future...
        ...
    """

    google_api_key: str | None = None
    top_k_results: int = Field(default=5, ge=1, le=20)

    @model_validator(mode="before")
    @classmethod
    def validate_environment(cls, values: dict) -> dict:
        """Validate that api key exists in environment."""
        google_api_key = get_from_dict_or_env(values, "google_api_key", "GOOGLE_API_KEY")
        values["google_api_key"] = google_api_key

        return values

    def run(self, query: str) -> str:
        params = (
            ("q", query),
            ("maxResults", self.top_k_results),
            ("key", self.google_api_key),
        )

        try:
            response = requests.get(GOOGLE_BOOKS_API_URL, params=params)
            response.raise_for_status()
            json = response.json()

        except requests.exceptions.HTTPError as e:
            code = response.status_code
            error = json.get("error", {}).get("message", "Internal failure")
            raise GoogleBooksAPIWrapperHTTPError(
                f"Unable to retrieve books got http status code {code}: {error}"
            ) from e
        except requests.exceptions.Timeout as e:
            raise GoogleBooksAPIWrapperTimeoutError("The request to retrieve books timed out.") from e
        except requests.exceptions.TooManyRedirects as e:
            raise GoogleBooksAPIWrapperTooManyRedirectsError(
                "Too many redirects occurred while trying to retrieve books."
            ) from e
        except requests.exceptions.RequestException as e:
            raise GoogleBooksAPIWrapperRequestExceptionError("An error occurred while trying to retrieve books.") from e
        except Exception as e:
            raise GoogleBooksAPIWrapperError("An unexpected error occurred while trying to retrieve books.") from e

        return self._format(query, json.get("items", []))

    def _format(self, query: str, books: list) -> str:
        if not books:
            return f"Sorry no books could be found for your query: {query}"

        start = f"Here are {len(books)} suggestions for books related to {query}:"

        results = []
        results.append(start)
        i = 1

        for book in books:
            volume_info = book["volumeInfo"]
            title = volume_info.get("title", "Unknown Title")
            authors = self._format_authors(volume_info.get("authors", []))
            summary = volume_info.get("description", "No summary available")
            source = volume_info.get("infoLink", "No source available")
            # 出版欄位一併帶出（2026-09-24）：模型拿不到 publishedDate 時，
            # 會從簡介文案裡的其他年份（如獎項年份）誤推出版年
            publisher = volume_info.get("publisher", "Unknown Publisher")
            published_date = volume_info.get("publishedDate", "Unknown Date")
            page_count = volume_info.get("pageCount", "")

            desc = f'{i}. "{title}" by {authors}\n'
            desc += f"Publisher: {publisher} | Published: {published_date}"
            desc += f" | Pages: {page_count}\n" if page_count else "\n"
            desc += f"Summary: {summary}\n"
            desc += f"You can read more at {source}"
            results.append(desc)

            i += 1

        return "\n\n".join(results)

    def _format_authors(self, authors: list) -> str:
        if not authors:
            return "Unknown Author"
        elif len(authors) == 1:
            return authors[0]
        else:
            return "{} and {}".format(", ".join(authors[:-1]), authors[-1])
