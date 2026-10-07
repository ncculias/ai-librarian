"""Open-Meteo 天氣查詢（免金鑰）。

2026-10-07 新增：原 OpenWeatherMap 金鑰失效（401），且金鑰制服務有
「鑰匙無預警死亡」的維運風險。改接 Open-Meteo 開放天氣介面：
免註冊、免金鑰、非商業／學術使用免費。
流程：地名 → 地理編碼取得座標 → 查即時天氣與當日預報 → 組中文摘要。
"""

import httpx
from pydantic import BaseModel, Field

GEOCODE_URL = "https://geocoding-api.open-meteo.com/v1/search"
FORECAST_URL = "https://api.open-meteo.com/v1/forecast"
USER_AGENT = "ai-librarian/1.0 (academic research; NCCU LIAS)"

# WMO 天氣代碼 → 中文描述（Open-Meteo 使用國際標準代碼）
WMO_CODES: dict[int, str] = {
    0: "晴朗",
    1: "大致晴朗",
    2: "局部多雲",
    3: "陰天",
    45: "有霧",
    48: "霧凇",
    51: "毛毛雨（小）",
    53: "毛毛雨（中）",
    55: "毛毛雨（大）",
    61: "小雨",
    63: "中雨",
    65: "大雨",
    66: "凍雨（小）",
    67: "凍雨（大）",
    71: "小雪",
    73: "中雪",
    75: "大雪",
    77: "霰",
    80: "零星陣雨",
    81: "陣雨",
    82: "強陣雨",
    85: "小陣雪",
    86: "大陣雪",
    95: "雷雨",
    96: "雷雨夾小冰雹",
    99: "雷雨夾大冰雹",
}


class WeatherLookupError(Exception):
    pass


def _geocode_params(location: str) -> dict:
    return {"name": location, "count": 1, "language": "zh", "format": "json"}


# 台灣縣市中英對照：Open-Meteo 的中文地名資料不全（台中市查不到、
# 新竹市查得到），英文名則齊全；中文查不到時以英文名重試。
TW_CITY_EN: dict[str, str] = {
    "台北": "Taipei",
    "新北": "New Taipei",
    "桃園": "Taoyuan",
    "台中": "Taichung",
    "台南": "Tainan",
    "高雄": "Kaohsiung",
    "基隆": "Keelung",
    "新竹": "Hsinchu",
    "苗栗": "Miaoli",
    "彰化": "Changhua",
    "南投": "Nantou",
    "雲林": "Yunlin",
    "嘉義": "Chiayi",
    "屏東": "Pingtung",
    "宜蘭": "Yilan",
    "花蓮": "Hualien",
    "台東": "Taitung",
    "澎湖": "Penghu",
    "金門": "Kinmen",
    "馬祖": "Matsu Islands",
    "連江": "Matsu Islands",
}


def _candidates(location: str) -> list[str]:
    """Open-Meteo 查中文地名需要全名且資料不全：
    短名先補「市」「縣」重試，台灣縣市再以英文名兜底。"""
    loc = location.strip()
    cands = [loc]
    if loc and all("\u4e00" <= ch <= "\u9fff" for ch in loc):
        if loc[-1] not in "市縣鄉鎮區":
            cands += [f"{loc}市", f"{loc}縣"]
        base = loc.replace("臺", "台").rstrip("市縣")
        en = TW_CITY_EN.get(base)
        if en:
            cands.append(en)
    return cands


def _forecast_params(lat: float, lon: float) -> dict:
    return {
        "latitude": lat,
        "longitude": lon,
        "current": (
            "temperature_2m,relative_humidity_2m,apparent_temperature,"
            "weather_code,wind_speed_10m"
        ),
        "daily": "temperature_2m_max,temperature_2m_min,precipitation_probability_max",
        "forecast_days": 1,
        "timezone": "auto",
    }


def _pick_place(geo: dict) -> dict | None:
    results = geo.get("results") or []
    return results[0] if results else None


def _not_found(location: str) -> WeatherLookupError:
    return WeatherLookupError(
        f"找不到地點「{location}」，請改用完整城市名稱（如：台北市、Tokyo）再試一次。"
    )


def _format_report(place: dict, data: dict) -> str:
    cur = data.get("current", {})
    daily = data.get("daily", {})

    name = place.get("name", "")
    country = (place.get("country") or "").replace("台湾", "台灣")
    where = f"{name}（{country}）" if country and country not in name else name

    desc = WMO_CODES.get(cur.get("weather_code", -1), "")
    lines = [f"{where} 目前天氣：{desc}" if desc else f"{where} 目前天氣："]
    if cur.get("temperature_2m") is not None:
        feel = cur.get("apparent_temperature")
        feel_part = f"（體感 {feel}°C）" if feel is not None else ""
        lines.append(f"氣溫 {cur['temperature_2m']}°C{feel_part}")
    if cur.get("relative_humidity_2m") is not None:
        lines.append(f"濕度 {cur['relative_humidity_2m']}%")
    if cur.get("wind_speed_10m") is not None:
        lines.append(f"風速 {cur['wind_speed_10m']} km/h")

    tmax = (daily.get("temperature_2m_max") or [None])[0]
    tmin = (daily.get("temperature_2m_min") or [None])[0]
    rain = (daily.get("precipitation_probability_max") or [None])[0]
    today = []
    if tmax is not None and tmin is not None:
        today.append(f"最高 {tmax}°C／最低 {tmin}°C")
    if rain is not None:
        today.append(f"降雨機率 {rain}%")
    if today:
        lines.append(f"今日預報：{'，'.join(today)}")

    lines.append("資料來源：Open-Meteo")
    return "\n".join(lines)


class OpenMeteoWeather(BaseModel):
    """同步版天氣查詢。

    Attributes:
        timeout (int): 查詢逾時（毫秒，預設 10000）。
    """

    timeout: int = Field(default=10000)

    def run(self, location: str) -> str:
        try:
            with httpx.Client(
                timeout=self.timeout / 1000, headers={"User-Agent": USER_AGENT}
            ) as client:
                place = None
                for cand in _candidates(location):
                    geo = client.get(GEOCODE_URL, params=_geocode_params(cand))
                    geo.raise_for_status()
                    place = _pick_place(geo.json())
                    if place:
                        break
                if not place:
                    raise _not_found(location)
                fc = client.get(
                    FORECAST_URL,
                    params=_forecast_params(place["latitude"], place["longitude"]),
                )
                fc.raise_for_status()
        except httpx.TimeoutException as e:
            raise WeatherLookupError("天氣服務回應逾時，請稍後再試。") from e
        return _format_report(place, fc.json())


class AsyncOpenMeteoWeather(BaseModel):
    """非同步版天氣查詢。"""

    timeout: int = Field(default=10000)

    async def arun(self, location: str) -> str:
        try:
            async with httpx.AsyncClient(
                timeout=self.timeout / 1000, headers={"User-Agent": USER_AGENT}
            ) as client:
                place = None
                for cand in _candidates(location):
                    geo = await client.get(GEOCODE_URL, params=_geocode_params(cand))
                    geo.raise_for_status()
                    place = _pick_place(geo.json())
                    if place:
                        break
                if not place:
                    raise _not_found(location)
                fc = await client.get(
                    FORECAST_URL,
                    params=_forecast_params(place["latitude"], place["longitude"]),
                )
                fc.raise_for_status()
        except httpx.TimeoutException as e:
            raise WeatherLookupError("天氣服務回應逾時，請稍後再試。") from e
        return _format_report(place, fc.json())
