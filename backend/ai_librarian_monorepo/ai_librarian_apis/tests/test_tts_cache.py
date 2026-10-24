"""語音快取：key 穩定、記憶體／硬碟兩層讀寫、硬碟上限會修剪."""

import os
import time

from ai_librarian_apis.services.tts_cache import PROMPT_VERSION, TtsCache, cache_key


def test_cache_key_is_stable_and_sensitive_to_text_voice_and_version():
    k = cache_key("您好", "Kore")
    assert k == cache_key("  您好  ", "Kore")  # 頭尾空白不影響
    assert len(k) == 64
    assert k != cache_key("您好。", "Kore")
    assert k != cache_key("您好", "Puck")
    assert k != cache_key("您好", "Kore", prompt_version=PROMPT_VERSION + "x")


def test_put_then_get_from_memory_and_from_disk(tmp_path):
    c = TtsCache(directory=tmp_path, memory_max=8, disk_max=100)
    key = cache_key("測試", "Kore")
    assert c.get(key) is None
    c.put(key, b"RIFFdata")
    assert c.get(key) == b"RIFFdata"
    assert (tmp_path / f"{key}.wav").read_bytes() == b"RIFFdata"

    # 新的實例沒有記憶體層，仍能從硬碟讀回
    c2 = TtsCache(directory=tmp_path)
    assert c2.get(key) == b"RIFFdata"


def test_memory_layer_is_bounded_lru(tmp_path):
    c = TtsCache(directory=tmp_path, memory_max=2, disk_max=100)
    for i in range(3):
        c.put(f"k{i}", bytes([i]))
    assert list(c._memory.keys()) == ["k1", "k2"]  # k0 被擠出記憶體
    assert c.get("k0") == b"\x00"  # 但硬碟還有


def test_disk_layer_prunes_oldest_files(tmp_path):
    c = TtsCache(directory=tmp_path, memory_max=10, disk_max=2)
    for i in range(3):
        c.put(f"k{i}", b"x")
        later = time.time() + i  # 讓 mtime 明確遞增
        os.utime(tmp_path / f"k{i}.wav", (later, later))
        c._prune_disk()
    remaining = sorted(p.name for p in tmp_path.glob("*.wav"))
    assert remaining == ["k1.wav", "k2.wav"]


def test_env_override_for_directory(tmp_path, monkeypatch):
    monkeypatch.setenv("TTS_CACHE_DIR", str(tmp_path / "custom"))
    c = TtsCache()
    c.put("k", b"y")
    assert (tmp_path / "custom" / "k.wav").exists()
