"""天氣查詢工具。

2026-10-07 重寫：原本包 LangChain 的 OpenWeatherMapQueryRun（需金鑰，
金鑰已失效 401）。改用自家的 Open-Meteo wrapper（免金鑰）。
工具名稱維持 "open_weather_map" 不變，AI 與前端工具列表無感。
"""

from ai_librarian_core.wrapper.open_meteo import AsyncOpenMeteoWeather, OpenMeteoWeather
from langchain_core.callbacks import AsyncCallbackManagerForToolRun, CallbackManagerForToolRun
from langchain_core.tools import BaseTool
from pydantic import BaseModel, Field


class OpenWeatherMapInput(BaseModel):
    location: str = Field(description="The location to get the weather for.")


class SchemaedOpenWeatherMapQueryRun(BaseTool):
    """查詢指定地點即時天氣（Open-Meteo，免金鑰）。"""

    name: str = "open_weather_map"
    description: str = (
        "A tool for fetching current weather and today's forecast for a location, "
        "powered by the Open-Meteo open data API (no API key required). "
        "Input is a city name in Chinese or English (e.g. 台北, Tokyo, London). "
        "Returns a Chinese summary: condition, temperature, humidity, wind, "
        "and today's high/low with precipitation probability."
    )
    weather: OpenMeteoWeather = Field(default_factory=OpenMeteoWeather)
    async_weather: AsyncOpenMeteoWeather = Field(default_factory=AsyncOpenMeteoWeather)
    args_schema: type[BaseModel] = OpenWeatherMapInput

    def _run(
        self,
        location: str,
        run_manager: CallbackManagerForToolRun | None = None,
    ) -> str:
        return self.weather.run(location)

    async def _arun(
        self,
        location: str,
        run_manager: AsyncCallbackManagerForToolRun | None = None,
    ) -> str:
        return await self.async_weather.arun(location)
