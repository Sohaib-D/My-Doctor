from __future__ import annotations

EMERGENCY_KEYWORDS_EN = [
    "heart attack",
    "chest pain",
    "cannot breathe",
    "can't breathe",
    "stroke",
    "seizure",
    "unconscious",
    "overdose",
    "suicide",
    "suicidal",
    "self harm",
    "self-harm",
    "severe bleeding",
    "anaphylaxis",
    "poisoning",
    "kill myself",
    "want to die",
    "end my life",
    "not breathing",
]

EMERGENCY_KEYWORDS_UR = [
    "دل کا دورہ",
    "سانس نہیں آ رہا",
    "خودکشی",
    "بہت خون",
    "بے ہوش",
    "زہر",
]


def detect_emergency(message: str) -> bool:
    text = (message or "").lower()
    for key in EMERGENCY_KEYWORDS_EN:
        if key in text:
            return True

    for key in EMERGENCY_KEYWORDS_UR:
        if key in message:
            return True

    return False
