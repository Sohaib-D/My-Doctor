from __future__ import annotations

import json
import re
from typing import cast

from backend.schemas.chat import ChatMode, StructuredMedicalResponse
from backend.services.emergency import detect_emergency
from backend.services.groq_service import ask_groq_structured
from backend.services.pubmed_service import fetch_pubmed_references
from backend.utils.logging import logger


ROMAN_URDU_MARKERS = {
    "assalam", "salam", "salaam", "aap", "ap", "aapka", "aapki", "aapko",
    "aapke", "tum", "tumhara", "tumhari", "tumhare", "tumko", "mera", "meri",
    "mere", "meray", "merey", "mujhe", "mujay", "muje", "mujh", "mein",
    "main", "mai", "may", "me", "hain", "hai", "hay", "ho", "hoon", "hun",
    "hona", "raha", "rahi", "rahay", "nahi", "nahin", "nhi", "kya", "kia",
    "kaise", "kese", "kyun", "kyu", "kahan", "kab", "se", "ko", "ki", "ka",
    "ke", "aur", "ya", "agar", "lekin", "magar", "dard", "sirdard", "sar",
    "sir", "pet", "pait", "paet", "bukhar", "bukhaar", "khansi", "khaansi",
    "saans", "saas", "tabiyat", "thakan", "thakaan", "kamzori", "kamzoree",
    "chakkar", "dawai", "dawa", "dwa", "ilaaj", "masla", "sukoon", "thora",
    "thoraa", "bohat", "bohot", "zyada", "kam", "din", "raat", "neend",
    "pani", "bhook", "bhukh", "dil", "ghabrahat", "problem",
}

ENGLISH_MARKERS = {
    "hi", "hello", "the", "is", "are", "and", "for", "with", "what", "how",
    "when", "where", "why", "can", "could", "should", "would", "please",
    "help", "name", "your", "you", "my", "have",
}


def _is_roman_urdu(message: str) -> bool:
    text = str(message or "").strip().lower()
    if not text:
        return False
    if any("\u0600" <= ch <= "\u06ff" for ch in text):
        return False

    tokens = re.findall(r"[a-z']+", text)
    if not tokens:
        return False

    roman_hits = sum(1 for token in tokens if token in ROMAN_URDU_MARKERS)
    english_hits = sum(1 for token in tokens if token in ENGLISH_MARKERS)
    if roman_hits >= 3:
        return True
    if roman_hits >= 2 and roman_hits > english_hits:
        return True
    return False


def detect_language_variant(message: str, fallback: str | None = None) -> tuple[str, str]:
    text = str(message or "")
    for char in text:
        if "\u0600" <= char <= "\u06ff":
            return "ur", "ur"
    if _is_roman_urdu(text):
        return "ur", "roman_urdu"
    if fallback in {"en", "ur"}:
        return fallback, fallback
    return "en", "en"


def detect_language(message: str, fallback: str | None = None) -> str:
    language, _ = detect_language_variant(message, fallback)
    return language


def _emergency_alert(language: str, language_variant: str = "") -> str:
    if language_variant == "roman_urdu":
        return (
            "🚨 **Emergency Alert:** Yeh possible emergency ho sakti hai. "
            "Please foran **112/911** ya nearest emergency service se rabta karein."
        )
    if language == "ur":
        return "🚨 **ہنگامی الرٹ:** یہ ممکنہ ایمرجنسی ہے۔ فوری طور پر **112/911** یا قریبی ایمرجنسی سروس سے رابطہ کریں۔"
    return "🚨 **Emergency Alert:** This may be urgent. Call emergency services (**112/911**) immediately."


def _mode_fallback_final_response(
    mode: ChatMode, language: str, message: str, language_variant: str = ""
) -> str:
    """Rich-formatted fallback responses when the AI response is missing or empty."""
    if language_variant == "roman_urdu":
        if mode == "drug":
            return (
                "💊 Please **dawa ka exact naam** (generic ya brand) likhein.\n\n"
                "Main yeh information doon ga:\n"
                "- 🔬 **Drug class** (category)\n"
                "- ✅ **Istemaal** (uses)\n"
                "- ⚠️ **Common side effects**\n"
                "- ❌ **Important warnings / interactions**\n"
                "- 🚫 **Kin halat mein avoid karein**"
            )
        if mode == "research":
            return (
                "📋 Please **research ka topic, abstract, ya link** share karein.\n\n"
                "Main evidence-based summary doon ga:\n"
                "- 🔬 **Study type**\n"
                "- 📊 **Key findings**\n"
                "- 💪 **Strength of evidence**\n"
                "- 🏥 **Practical meaning**\n"
                "- ⚠️ **Limitations**"
            )
        if mode == "who":
            return (
                "🌍 Please **indicator, country/region, aur year range** batayein\n"
                "*(misal: maternal mortality Pakistan 2015–2023)*\n\n"
                "Main **data table** aur short **key insights** doon ga. 📊"
            )
        return (
            "🩺 Aap ki behtar madad ke liye yeh batayein:\n\n"
            "- 🤒 **Main symptom** kya hai?\n"
            "- 🕐 **Kitne din** se hai?\n"
            "- ⚠️ Koi **red flags** hain? (chest pain, saans ki takleef, tez bukhar)"
        )

    if language == "ur":
        if mode == "drug":
            return (
                "💊 براہ کرم **دوا کا درست نام** (Generic یا Brand) لکھیں۔\n\n"
                "میں یہ معلومات فراہم کروں گا:\n"
                "- 🔬 **Drug Class**\n"
                "- ✅ **استعمال**\n"
                "- ⚠️ **عام مضر اثرات**\n"
                "- ❌ **اہم وارننگز اور Interactions**\n"
                "- 🚫 **کن حالات میں پرہیز ضروری ہے**"
            )
        if mode == "research":
            return (
                "📋 براہ کرم **تحقیق کا عنوان، لنک، یا خلاصہ** شیئر کریں۔\n\n"
                "میں Evidence-based انداز میں خلاصہ دوں گا:\n"
                "- 🔬 **Study type**\n"
                "- 📊 **Key findings**\n"
                "- 💪 **Evidence strength**\n"
                "- 🏥 **Practical meaning**\n"
                "- ⚠️ **Limitations**"
            )
        if mode == "who":
            return (
                "🌍 براہ کرم **indicator، country/region اور year range** بتائیں\n"
                "*(مثال: maternal mortality Pakistan 2015–2023)*\n\n"
                "میں **جدول** اور مختصر **insights** دوں گا۔ 📊"
            )
        return (
            "🩺 آپ کی مدد کے لیے مجھے چند معلومات چاہیے:\n\n"
            "- 🤒 **بنیادی علامت** کیا ہے؟\n"
            "- 🕐 **کتنے دن** سے مسئلہ ہے؟\n"
            "- ⚠️ **بخار، سانس میں دقت، یا سینے میں درد** تو نہیں؟"
        )

    # English fallbacks
    if mode == "drug":
        return (
            "💊 Please share the **exact drug name** (generic or brand).\n\n"
            "I will provide:\n"
            "- 🔬 **Drug class**\n"
            "- ✅ **Main uses**\n"
            "- ⚠️ **Common side effects**\n"
            "- ❌ **Serious warnings / interactions**\n"
            "- 🚫 **When to avoid**"
        )
    if mode == "research":
        return (
            "📋 Please share the **study topic, abstract, or link**.\n\n"
            "I will summarize:\n"
            "- 🔬 **Study type**\n"
            "- 📊 **Key findings**\n"
            "- 💪 **Strength of evidence**\n"
            "- 🏥 **Practical meaning**\n"
            "- ⚠️ **Limitations**"
        )
    if mode == "who":
        return (
            "🌍 Please provide the **indicator, country/region, and year range**\n"
            "*(example: maternal mortality Pakistan 2015–2023)*\n\n"
            "I will return a **data table** and brief **key insights**. 📊"
        )
    return (
        "🩺 I can help best if you share:\n\n"
        "- 🤒 Your **main symptom**\n"
        "- 🕐 **How long** you've had it\n"
        "- ⚠️ Any **red flags** like chest pain, breathing difficulty, or high fever"
    )


def _is_placeholder_structured(payload: StructuredMedicalResponse) -> bool:
    return (
        not str(payload.final_response or "").strip()
        and payload.symptoms == "Not specified"
        and payload.possible_causes == "Needs clinical evaluation"
        and payload.advice == "Consult a licensed doctor for personalized care."
        and payload.when_to_see_doctor == "Seek medical care if symptoms worsen or persist."
    )


def _preserve_rich_formatting(text: str) -> str:
    """
    Preserves ALL markdown formatting from the model (bold, headings, emojis, bullets).
    Only collapses excessive blank lines.
    Previously this function stripped all markdown — that was the root cause of
    plain-text responses. Now it does nothing destructive.
    """
    raw = str(text or "").strip()
    if not raw:
        return raw
    # Collapse 3+ consecutive blank lines → 2 (keep intentional spacing)
    return re.sub(r"\n{3,}", "\n\n", raw)


# ── Backward-compat alias — delegates to _preserve_rich_formatting ──────────
def _clean_markdown_artifacts(text: str) -> str:
    """
    CHANGED: No longer strips **bold**, ## headings, emojis, or bullet points.
    Preserves all rich formatting so the frontend can render it correctly.
    """
    return _preserve_rich_formatting(text)


def _ensure_visual_formatting(text: str, language: str, language_variant: str = "") -> str:
    """
    CHANGED: Preserves all rich formatting without modification.
    The system prompt is the primary enforcement mechanism.
    """
    return _preserve_rich_formatting(text)


def format_structured_for_chat(payload: StructuredMedicalResponse, language: str) -> str:
    """
    Returns final_response directly (preserving all markdown).
    Falls back to a richly-formatted markdown structure when final_response is empty.
    """
    direct = str(payload.final_response or "").strip()
    if direct:
        return direct

    # Rich formatted fallback from structured fields
    urgency_emoji = {"low": "🟢", "moderate": "🟡", "high": "🟠", "emergency": "🔴"}.get(
        str(payload.urgency_level).lower(), "🟡"
    )
    refs_block = (
        "\n".join(f"- {ref}" for ref in payload.references) if payload.references else "- N/A"
    )

    if language == "ur":
        return (
            f"## 🤒 علامات\n{payload.symptoms}\n\n"
            f"## 🔬 ممکنہ وجوہات\n{payload.possible_causes}\n\n"
            f"## 💊 فوری مشورہ\n{payload.advice}\n\n"
            f"## {urgency_emoji} ہنگامی سطح\n**{payload.urgency_level}**\n\n"
            f"## 🏥 ڈاکٹر سے کب رجوع کریں\n{payload.when_to_see_doctor}\n\n"
            f"## 📋 ریفرنسز\n{refs_block}"
        )

    return (
        f"## 🤒 Symptoms\n{payload.symptoms}\n\n"
        f"## 🔬 Possible Causes\n{payload.possible_causes}\n\n"
        f"## 💊 Advice\n{payload.advice}\n\n"
        f"## {urgency_emoji} Urgency Level\n**{payload.urgency_level.capitalize()}**\n\n"
        f"## 🏥 When to See a Doctor\n{payload.when_to_see_doctor}\n\n"
        f"## 📋 References\n{refs_block}"
    )


def _normalize_mode(mode: str | None) -> ChatMode:
    if mode in {"chat", "drug", "research", "who"}:
        return cast(ChatMode, mode)
    return "chat"


def _mode_reference_query(mode: ChatMode, message: str) -> str:
    if mode == "drug":
        return f"{message} medication safety interactions contraindications"
    if mode == "research":
        return f"{message} systematic review clinical evidence"
    if mode == "who":
        return f"{message} global health epidemiology public health"
    return message


async def generate_medical_response(
    message: str,
    requested_language: str | None = None,
    mode: ChatMode = "chat",
    profile_context: dict[str, str | int] | None = None,
    personalization_context: dict[str, str | bool | list[str]] | None = None,
    memory_context: list[str] | None = None,
    is_follow_up: bool = False,
):
    selected_mode = _normalize_mode(mode)
    language, language_variant = detect_language_variant(message, requested_language)
    emergency = detect_emergency(message)
    references_query = _mode_reference_query(selected_mode, message)

    try:
        references = await fetch_pubmed_references(references_query, limit=3)
        reference_links = [ref.url for ref in references]
    except Exception:
        reference_links = []

    try:
        structured = await ask_groq_structured(
            message=message,
            language=language_variant,
            reference_hints=reference_links,
            mode=selected_mode,
            profile_context=profile_context or {},
            personalization_context=personalization_context or {},
            memory_context=memory_context or [],
            is_follow_up=is_follow_up,
        )
    except Exception as exc:
        logger.warning("Using fallback medical response. Reason: %s", str(exc))
        if language == "ur":
            structured = StructuredMedicalResponse(
                symptoms=message,
                possible_causes=(
                    "یہ علامات کئی وجوہات کی وجہ سے ہو سکتی ہیں؛ "
                    "درست تشخیص کے لیے کلینیکل معائنہ ضروری ہے۔"
                ),
                advice=(
                    "آرام کریں، **پانی** زیادہ پئیں، اور علامات کی نگرانی کریں۔ "
                    "اگر **سانس میں دقت**، **سینے میں درد**، یا **بے ہوشی** ہو تو فوری ایمرجنسی سے رابطہ کریں۔"
                ),
                urgency_level="moderate",
                when_to_see_doctor="اگر **24–48 گھنٹوں** میں بہتری نہ ہو تو ڈاکٹر سے رجوع کریں۔",
                final_response=_mode_fallback_final_response(
                    selected_mode, language, message, language_variant
                ),
                references=reference_links,
            )
        else:
            structured = StructuredMedicalResponse(
                symptoms=message,
                possible_causes=(
                    "These symptoms can have multiple causes; a clinical exam is required for diagnosis."
                ),
                advice=(
                    "Rest, stay **hydrated**, and monitor symptom progression. "
                    "Seek urgent care immediately for **chest pain**, **breathing difficulty**, "
                    "**fainting**, or worsening severe symptoms."
                ),
                urgency_level="moderate",
                when_to_see_doctor=(
                    "See a doctor within **24–48 hours** if symptoms persist, worsen, or recur."
                ),
                final_response=_mode_fallback_final_response(
                    selected_mode, language, message, language_variant
                ),
                references=reference_links,
            )

    if _is_placeholder_structured(structured):
        structured.final_response = _mode_fallback_final_response(
            selected_mode, language, message, language_variant
        )
    elif selected_mode == "chat" and not str(structured.final_response or "").strip():
        advice_fallback = str(structured.advice or "").strip()
        if advice_fallback and advice_fallback != "Consult a licensed doctor for personalized care.":
            structured.final_response = advice_fallback
        else:
            structured.final_response = _mode_fallback_final_response(
                selected_mode, language, message, language_variant
            )

    if emergency:
        structured.urgency_level = "emergency"
        if language == "ur":
            structured.when_to_see_doctor = (
                "⚠️ یہ ہنگامی کیفیت ہو سکتی ہے۔ فوری طور پر **112/911** سے رابطہ کریں۔"
            )
        else:
            structured.when_to_see_doctor = (
                "⚠️ This may be an emergency. Call emergency services (**112/911**) immediately."
            )
        alert = _emergency_alert(language, language_variant)
        if str(structured.final_response or "").strip():
            if alert not in structured.final_response:
                structured.final_response = f"{alert}\n\n{structured.final_response}"
        else:
            structured.final_response = alert

    if reference_links and not structured.references:
        structured.references = reference_links

    # Preserve rich formatting — do NOT strip markdown
    structured.final_response = _ensure_visual_formatting(
        structured.final_response,
        language=language,
        language_variant=language_variant,
    )

    response_text = format_structured_for_chat(structured, language)
    return structured, response_text, emergency, language, selected_mode


def serialize_structured(payload: StructuredMedicalResponse) -> str:
    return json.dumps(payload.model_dump(), ensure_ascii=False)
