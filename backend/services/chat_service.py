from __future__ import annotations

import json

from backend.schemas.chat import StructuredMedicalResponse
from backend.services.emergency import detect_emergency
from backend.services.groq_service import ask_groq_structured
from backend.services.pubmed_service import fetch_pubmed_references
from backend.utils.logging import logger


def detect_language(message: str, fallback: str | None = None) -> str:
    if fallback in {"en", "ur"}:
        return fallback

    for char in message:
        if "\u0600" <= char <= "\u06ff":
            return "ur"
    return "en"


def format_structured_for_chat(payload: StructuredMedicalResponse, language: str) -> str:
    if language == "ur":
        refs = "\n".join(f"- {ref}" for ref in payload.references) if payload.references else "- N/A"
        return (
            f"### علامات\n{payload.symptoms}\n\n"
            f"### ممکنہ وجوہات\n{payload.possible_causes}\n\n"
            f"### فوری مشورہ\n{payload.advice}\n\n"
            f"### ہنگامی سطح\n{payload.urgency_level}\n\n"
            f"### ڈاکٹر سے کب رجوع کریں\n{payload.when_to_see_doctor}\n\n"
            f"### ریفرنسز\n{refs}"
        )

    refs = "\n".join(f"- {ref}" for ref in payload.references) if payload.references else "- N/A"
    return (
        f"### Symptoms\n{payload.symptoms}\n\n"
        f"### Possible Causes\n{payload.possible_causes}\n\n"
        f"### Advice\n{payload.advice}\n\n"
        f"### Urgency Level\n{payload.urgency_level}\n\n"
        f"### When to See Doctor\n{payload.when_to_see_doctor}\n\n"
        f"### References\n{refs}"
    )


async def generate_medical_response(message: str, requested_language: str | None = None):
    language = detect_language(message, requested_language)
    emergency = detect_emergency(message)

    try:
        references = await fetch_pubmed_references(message, limit=3)
        reference_links = [ref.url for ref in references]
    except Exception:
        reference_links = []

    try:
        structured = await ask_groq_structured(
            message=message,
            language=language,
            reference_hints=reference_links,
        )
    except Exception as exc:
        logger.warning("Using fallback medical response. Reason: %s", str(exc))
        if language == "ur":
            structured = StructuredMedicalResponse(
                symptoms=message,
                possible_causes="یہ علامات کئی وجوہات کی وجہ سے ہو سکتی ہیں؛ درست تشخیص کے لیے کلینیکل معائنہ ضروری ہے۔",
                advice=(
                    "آرام کریں، پانی زیادہ پئیں، اور علامات کی نگرانی کریں۔ اگر علامات بڑھ رہی ہوں، "
                    "سانس میں دقت، سینے میں درد، یا بے ہوشی محسوس ہو تو فوری ایمرجنسی سے رابطہ کریں۔"
                ),
                urgency_level="moderate",
                when_to_see_doctor="اگر 24-48 گھنٹوں میں بہتری نہ ہو یا علامات شدید ہوں تو ڈاکٹر سے رجوع کریں۔",
                references=reference_links,
            )
        else:
            structured = StructuredMedicalResponse(
                symptoms=message,
                possible_causes="These symptoms can have multiple causes; a clinical exam is required for diagnosis.",
                advice=(
                    "Rest, stay hydrated, and monitor symptom progression. Seek urgent care immediately for chest pain, "
                    "breathing difficulty, fainting, or worsening severe symptoms."
                ),
                urgency_level="moderate",
                when_to_see_doctor="See a doctor within 24-48 hours if symptoms persist, worsen, or recur.",
                references=reference_links,
            )

    if emergency:
        structured.urgency_level = "emergency"
        if language == "ur":
            structured.when_to_see_doctor = (
                "یہ ہنگامی کیفیت ہو سکتی ہے۔ فوری طور پر 112/911 یا قریبی ایمرجنسی سے رابطہ کریں۔"
            )
        else:
            structured.when_to_see_doctor = (
                "This may be an emergency. Call emergency services (112/911) immediately."
            )

    if reference_links and not structured.references:
        structured.references = reference_links

    response_text = format_structured_for_chat(structured, language)
    return structured, response_text, emergency, language


def serialize_structured(payload: StructuredMedicalResponse) -> str:
    return json.dumps(payload.model_dump(), ensure_ascii=False)
