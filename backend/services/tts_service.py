from __future__ import annotations

from io import BytesIO
from typing import Iterator

def build_tts_bytes(text: str, language: str) -> bytes:
    try:
        from gtts import gTTS
    except ImportError as exc:  # pragma: no cover - runtime dependency check
        raise RuntimeError("gTTS is not installed. Run pip install -r requirements.txt.") from exc

    # gTTS language codes: en, ur
    lang_code = "ur" if language == "ur" else "en"
    tts = gTTS(text=text[:1800], lang=lang_code)
    buffer = BytesIO()
    tts.write_to_fp(buffer)
    return buffer.getvalue()


def iter_audio_chunks(audio_bytes: bytes, chunk_size: int = 4096) -> Iterator[bytes]:
    for idx in range(0, len(audio_bytes), chunk_size):
        yield audio_bytes[idx : idx + chunk_size]
