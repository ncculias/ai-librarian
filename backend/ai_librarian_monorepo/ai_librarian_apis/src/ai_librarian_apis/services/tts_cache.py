"""語音合成快取：同一句話、同一聲線只合成一次.

Gemini TTS 每次呼叫固定要 4～5 秒（與字數無關），開場白、重聽同一則回覆這類重複的句子
沒必要每次都等。快取分兩層：記憶體（最近用過的，最快）＋硬碟（容器重啟前都在）。
key 由「聲線 + 提示詞版本 + 文字」雜湊而成，提示詞改了就自然失效。
"""

from __future__ import annotations

import hashlib
import os
from collections import OrderedDict
from pathlib import Path

# 提示詞或音訊格式一改就把這個版本號 +1，舊快取自動作廢
PROMPT_VERSION = "v1"

# 記憶體層最多留幾筆（每筆 wav 約 100～500 KB）
MEMORY_MAX_ENTRIES = 64
# 硬碟層最多留幾個檔案，超過就刪最舊的
DISK_MAX_FILES = int(os.environ.get("TTS_CACHE_MAX_FILES", "2000"))
# 硬碟層位置；容器內預設放在套件旁邊的 tts_cache/（與 logs/ 同一層）
DEFAULT_DIR = Path(__file__).resolve().parents[1] / "tts_cache"


def cache_key(text: str, voice: str, prompt_version: str = PROMPT_VERSION) -> str:
    """文字（去頭尾空白）＋聲線＋提示詞版本 → 穩定的 sha256 十六進位字串."""
    raw = f"{voice}\n{prompt_version}\n{text.strip()}".encode()
    return hashlib.sha256(raw).hexdigest()


class TtsCache:
    def __init__(
        self,
        directory: Path | None = None,
        memory_max: int = MEMORY_MAX_ENTRIES,
        disk_max: int = DISK_MAX_FILES,
    ):
        """快取目錄可用環境變數 TTS_CACHE_DIR 覆寫；memory_max／disk_max 是兩層的上限."""
        self.directory = Path(os.environ.get("TTS_CACHE_DIR") or directory or DEFAULT_DIR)
        self.memory_max = memory_max
        self.disk_max = disk_max
        self._memory: OrderedDict[str, bytes] = OrderedDict()

    def _path(self, key: str) -> Path:
        return self.directory / f"{key}.wav"

    def get(self, key: str) -> bytes | None:
        data = self._memory.get(key)
        if data is not None:
            self._memory.move_to_end(key)
            return data
        try:
            data = self._path(key).read_bytes()
        except OSError:
            return None
        self._remember(key, data)
        return data

    def put(self, key: str, data: bytes) -> None:
        self._remember(key, data)
        try:
            self.directory.mkdir(parents=True, exist_ok=True)
            tmp = self._path(key).with_suffix(".tmp")
            tmp.write_bytes(data)
            tmp.replace(self._path(key))  # 先寫暫存檔再換名，避免讀到寫一半的檔案
            self._prune_disk()
        except OSError:
            # 硬碟層失敗不影響服務：這次只留在記憶體
            return

    def _remember(self, key: str, data: bytes) -> None:
        self._memory[key] = data
        self._memory.move_to_end(key)
        while len(self._memory) > self.memory_max:
            self._memory.popitem(last=False)

    def _prune_disk(self) -> None:
        files = sorted(self.directory.glob("*.wav"), key=lambda p: p.stat().st_mtime)
        for p in files[: max(0, len(files) - self.disk_max)]:
            try:
                p.unlink()
            except OSError:
                pass


# 全站共用一份（FastAPI 單一程序）
tts_cache = TtsCache()
