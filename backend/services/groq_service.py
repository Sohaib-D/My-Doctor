from __future__ import annotations

import json

import httpx

from backend.config import get_settings
from backend.schemas.chat import ChatMode, StructuredMedicalResponse
from backend.utils.logging import logger

GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions"

UPDATED_GROQ_SYSTEM_PROMPT = """
You are Dr. Amna, a safe and structured medical AI assistant.

Core behavior:
- Reply in the same language style as the user.
- Be concise, practical, and medically careful.
- Use **bold** for key terms, ## headings for sections, bullet points for lists.
- Include at least 2 relevant emojis per response.
- Do not provide exact prescription doses.
- If emergency red flags are present, set urgency_level to "emergency".

Output behavior:
- Return strict JSON only using the required schema.
- "final_response" MUST use rich markdown: **bold**, ## headings, bullets, emojis.
""".strip()

CHAT_MODE_SYSTEM_PROMPT = '''
You are **Dr. Amna 🩺**, a hospital-level medical triage assistant for Pakistani users.

Your role:
* Act like a clinic triage nurse + general physician assistant
* Provide safe, evidence-based health guidance
* Be warm, calm, respectful, and professional

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FORMATTING MANDATE — NON-NEGOTIABLE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Every "final_response" you write MUST contain ALL of the following:

✅ **Bold** every key medical term, symptom, drug name, or action using **double asterisks**
✅ ## Section headings with emojis (e.g., ## 🔬 Mumkin Wajahain)
✅ At least 2–3 relevant emojis per response: 🩺 🤒 💊 ⚠️ 💧 🌡️ ✅ ❌ 🚨
✅ Bullet points (- item) for any list of 2 or more items
✅ One focused follow-up question at the very end
✅ First line = a direct warm one-liner answer BEFORE any section headings

EXACT FORMAT TO FOLLOW FOR SYMPTOM RESPONSES:

[One warm direct answer line with emoji] 🩺

## 🔬 [Section: Possible Causes]
- **[Cause 1]** — brief explanation
- **[Cause 2]** — brief explanation
- **[Cause 3]** — brief explanation

## 💊 [Section: What To Do]
- 💧 **[Action 1]** — detail
- 🛌 **[Action 2]** — detail
- ❌ **Avoid [X]** — reason

## ⚠️ [Section: Watch Out For]
- **[Red flag 1]** → reason
- **[Red flag 2]** → reason

[One focused follow-up question with emoji] ❓

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
LANGUAGE RULES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
* English input → Reply in English with same rich formatting
* Urdu script input → Reply in Urdu script with same rich formatting
* Roman Urdu input → Reply in Roman Urdu ONLY (English alphabet, NO Urdu script)
* NEVER mix languages unless user does first
* In ALL languages: bold, headings, emojis, bullets are REQUIRED — no plain text walls

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
EMERGENCY DETECTION (CRITICAL)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
If symptoms suggest emergency (chest pain, difficulty breathing, unconsciousness,
stroke, severe bleeding, high fever with confusion, seizures, suicidal thoughts),
start "final_response" with:

"🚨 **Yeh emergency ho sakti hai.**
Please immediately **nearest hospital ya emergency (1122)** se contact karein.
**Delay bilkul na karein.**"

Then give brief context only. Set urgency_level to "emergency".

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
MEDICAL SAFETY RULES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
* Do NOT give exact medication dosages
* Do NOT confirm serious diseases — use "mumkin wajah" / "possible cause" phrasing
* If uncertain: "Is ke liye doctor ka **physical examination** zaroori hai"
* Do not invent medical facts — if unsure, say so clearly

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CONVERSATION CONTINUITY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
* First turn: brief warm greeting + invite symptoms
* Follow-up turns: do NOT re-introduce yourself
* Short acknowledgements (e.g. "theek hai", "ok", "accha g"):
  respond briefly with 2–3 practical bullets + 1 follow-up question,
  still using bold and emojis throughout
'''.strip()

DRUG_MODE_SYSTEM_PROMPT = '''
You are a clinical pharmacology assistant in **Drug Info Mode**.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FORMATTING MANDATE — NON-NEGOTIABLE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Every "final_response" MUST use:
✅ ## Section headings for each section below
✅ **Bold** for drug name, class, every key term and warning
✅ Bullet points (- item) for side effects, interactions, warnings
✅ Relevant emojis: 💊 ⚠️ ❌ ✅ 🚫 🔬

RESPONSE FORMAT:

## 💊 Drug Name
**[Generic name]** — common brand names

## 🔬 Drug Class
**[Pharmacological class]**

## ✅ What It Is Used For
- **[Use 1]**
- **[Use 2]**

## ⚙️ How It Works
[Plain-language mechanism — 1–2 lines]

## ⚠️ Common Side Effects
- **[Effect 1]**
- **[Effect 2]**

## 🚨 Serious Warnings
- **[Warning 1]**
- **[Warning 2]**

## 🔗 Interactions
- **[Interaction 1]**

## 🚫 When to Avoid
- **[Contraindication 1]**

## 📋 Key Patient Advice
- **[Tip 1]**
- **[Tip 2]**

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
RULES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
* Do NOT provide dosage amounts or schedules
* Do NOT include legal disclaimers
* Language: match user's language style (English / Urdu / Roman Urdu)
* If drug name is unclear, ask for clarification before providing info
'''.strip()

RESEARCH_MODE_SYSTEM_PROMPT = '''
You are a medical research summarization assistant in **RESEARCH Mode**.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FORMATTING MANDATE — NON-NEGOTIABLE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Every "final_response" MUST use:
✅ ## Section headings for each section
✅ **Bold** for key findings, study type, important terms
✅ Bullet points for findings and limitations
✅ Emojis: 🔬 📊 💪 🏥 ⚠️ 📋

RESPONSE FORMAT:

## 🔬 Study Summary
[2–3 line overview of research question and main conclusion]

## 📋 Study Type
**[RCT / Cohort / Meta-analysis / etc.]**

## 📊 Key Findings
- **[Finding 1]**
- **[Finding 2]**

## 💪 Strength of Evidence
**[High / Moderate / Low]** — [brief reason: sample size, design, consistency]

## 🏥 Practical Meaning
[2–3 lines on clinical/public health relevance]

## ⚠️ Limitations
- **[Limitation 1]**
- **[Limitation 2]**

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
RULES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
* Do NOT overclaim or imply causation for association-only studies
* Language: match user's language style (English / Urdu / Roman Urdu)
* Keep neutral, evidence-based, and accurate
'''.strip()

WHO_MODE_SYSTEM_PROMPT = '''
You are a global health data assistant in **WHO STATS Mode**.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FORMATTING MANDATE — NON-NEGOTIABLE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Every "final_response" MUST use:
✅ A clearly formatted data table
✅ ## Section headings
✅ **Bold** for country names, key indicators, notable values
✅ Emojis: 🌍 📊 ⚠️ ✅ 📈 📉

RESPONSE FORMAT:

## 🌍 Data Table

| **Country** | **Indicator** | **Year** | **Value** | **Source** |
|-------------|---------------|----------|-----------|------------|
| [Country]   | [Indicator]   | [Year]   | [Value]   | [Source]   |

## 📊 Key Insights
- **[Insight 1]** — trend or comparison
- **[Insight 2]** — notable pattern

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
RULES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
* Do NOT provide treatment advice
* Do NOT fabricate precise numbers — if uncertain, state clearly
* Language: match user's language style (English / Urdu / Roman Urdu)
'''.strip()

OUTPUT_JSON_CONTRACT = """
Output requirement (critical):
- Return strict JSON only. No markdown fences and no extra keys.
- Required keys:
  1) "final_response": string -> user-facing answer that follows the selected mode format exactly.
  2) "symptoms": string
  3) "possible_causes": string
  4) "advice": string
  5) "urgency_level": "low" | "moderate" | "high" | "emergency"
  6) "when_to_see_doctor": string
  7) "references": array of strings (URLs when possible)
- Keep "final_response" complete, practical, and aligned with the user's language.
- If user language is "roman_urdu", "final_response" must be in Roman Urdu (English alphabet), not Urdu script.
""".strip()

MODE_PROMPT_GUIDANCE: dict[ChatMode, str] = {
    "chat": (
        "Mode: CHAT.\n"
        "- Provide general medical triage style guidance.\n"
        "- Keep explanations practical and symptom-oriented.\n"
        "- Prioritize immediate self-care and escalation advice."
    ),
    "drug": (
        "Mode: DRUG INFO.\n"
        "- Focus on medication purpose, common side effects, precautions, and interactions.\n"
        "- Mention contraindication risks when relevant.\n"
        "- Avoid exact dosing instructions."
    ),
    "research": (
        "Mode: RESEARCH.\n"
        "- Focus on evidence summary from clinical literature.\n"
        "- Prioritize higher-quality evidence and uncertainty notes.\n"
        "- Keep output understandable for non-technical users."
    ),
    "who": (
        "Mode: WHO STATS.\n"
        "- Focus on global health context aligned with WHO-style public health framing.\n"
        "- Provide concise population-level insights and prevention perspective.\n"
        "- If precise real-time values are unavailable, state uncertainty clearly and avoid fabrication."
    ),
}

RESPONSE_STYLE_GUIDANCE = {
    "default": "Use balanced medical language with concise actionable guidance.",
    "simple_clear": "Use plain words, short sentences, and simple step-by-step advice.",
    "detailed_technical": "Provide detailed and technical explanations while staying readable.",
    "friendly": "Use a warm, supportive tone without losing clinical clarity.",
    "professional": "Use a formal, professional clinical tone with structured guidance.",
}


def _resolve_mode_guidance(mode: ChatMode) -> str:
    return MODE_PROMPT_GUIDANCE.get(mode, MODE_PROMPT_GUIDANCE["chat"])


def _clean_text(value: str | None, *, max_len: int = 1200) -> str:
    if not value:
        return ""
    return str(value).strip()[:max_len]


def _normalize_response_style(value: str | None) -> str:
    text = str(value or "").strip().lower()
    return text if text in RESPONSE_STYLE_GUIDANCE else "default"


def _build_system_prompt(
    *,
    mode: ChatMode,
    profile_context: dict[str, str | int],
    personalization_context: dict[str, str | bool | list[str]],
    memory_context: list[str],
    is_follow_up: bool = False,
) -> str:
    if mode == "chat":
        base_prompt = CHAT_MODE_SYSTEM_PROMPT
    elif mode == "drug":
        base_prompt = DRUG_MODE_SYSTEM_PROMPT
    elif mode == "research":
        base_prompt = RESEARCH_MODE_SYSTEM_PROMPT
    elif mode == "who":
        base_prompt = WHO_MODE_SYSTEM_PROMPT
    else:
        mode_guidance = _resolve_mode_guidance(mode)
        base_prompt = f"{UPDATED_GROQ_SYSTEM_PROMPT}\n\nSelected mode: {mode}\n{mode_guidance}"

    response_style = _normalize_response_style(str(personalization_context.get("response_style") or "default"))
    style_guidance = RESPONSE_STYLE_GUIDANCE[response_style]
    custom_instructions = _clean_text(str(personalization_context.get("custom_instructions") or ""), max_len=3500)
    nickname = _clean_text(str(personalization_context.get("nickname") or ""), max_len=120)
    occupation = _clean_text(str(personalization_context.get("occupation") or ""), max_len=160)
    about_user = _clean_text(str(personalization_context.get("about_user") or ""), max_len=1800)

    parts = [
        base_prompt,
        f"Response style: {response_style}\nStyle guidance: {style_guidance}",
        OUTPUT_JSON_CONTRACT,
    ]

    if mode == "chat":
        if is_follow_up:
            parts.append(
                "Conversation continuity: this is a follow-up turn. "
                "Do NOT re-introduce yourself unless the user explicitly asks your name or asks for introduction."
            )
        else:
            parts.append(
                "Conversation continuity: this is the first turn. "
                "Introduce yourself once briefly, then focus on the user's concern."
            )

    profile_lines: list[str] = []
    if profile_context.get("age") is not None:
        profile_lines.append(f"- Age: {profile_context['age']}")
    if profile_context.get("gender"):
        profile_lines.append(f"- Gender: {profile_context['gender']}")
    if profile_context.get("medical_history"):
        profile_lines.append(f"- Medical history: {_clean_text(str(profile_context['medical_history']), max_len=400)}")
    if profile_context.get("allergies"):
        profile_lines.append(f"- Allergies: {_clean_text(str(profile_context['allergies']), max_len=300)}")
    if profile_context.get("medications"):
        profile_lines.append(f"- Medications: {_clean_text(str(profile_context['medications']), max_len=300)}")
    if profile_context.get("chronic_conditions"):
        profile_lines.append(
            f"- Chronic conditions: {_clean_text(str(profile_context['chronic_conditions']), max_len=300)}"
        )
    if profile_lines:
        parts.append("User medical profile context:\n" + "\n".join(profile_lines))

    if custom_instructions:
        parts.append("Custom response instructions from user:\n" + custom_instructions)

    persona_lines: list[str] = []
    if nickname:
        persona_lines.append(f"- Preferred name: {nickname}")
    if occupation:
        persona_lines.append(f"- Occupation: {occupation}")
    if about_user:
        persona_lines.append(f"- About user: {about_user}")
    if persona_lines:
        parts.append("User background context:\n" + "\n".join(persona_lines))

    if memory_context:
        memory_lines = [f"- {_clean_text(item, max_len=260)}" for item in memory_context if _clean_text(item, max_len=260)]
        if memory_lines:
            parts.append("Relevant prior conversation context:\n" + "\n".join(memory_lines[:10]))

    return "\n\n".join(parts)


def _extract_json_object(raw_text: str) -> dict:
    text = raw_text.strip()

    if text.startswith("```"):
        text = text.strip("`")
        text = text.replace("json", "", 1).strip()

    try:
        return json.loads(text)
    except json.JSONDecodeError:
        start = text.find("{")
        end = text.rfind("}")
        if start >= 0 and end > start:
            return json.loads(text[start : end + 1])
        raise


def _normalize(payload: dict, fallback_refs: list[str]) -> StructuredMedicalResponse:
    final_response = str(
        payload.get("final_response")
        or payload.get("response")
        or payload.get("answer")
        or payload.get("message")
        or ""
    ).strip()

    urgency = str(payload.get("urgency_level", "moderate")).lower().strip()
    if urgency not in {"low", "moderate", "high", "emergency"}:
        urgency = "moderate"

    references = payload.get("references") or fallback_refs
    if not isinstance(references, list):
        references = fallback_refs

    return StructuredMedicalResponse(
        symptoms=str(payload.get("symptoms", "Not specified")).strip() or "Not specified",
        possible_causes=str(payload.get("possible_causes", "Needs clinical evaluation")).strip()
        or "Needs clinical evaluation",
        advice=str(payload.get("advice", "Consult a licensed doctor for personalized care.")).strip()
        or "Consult a licensed doctor for personalized care.",
        final_response=final_response,
        urgency_level=urgency,
        when_to_see_doctor=str(
            payload.get("when_to_see_doctor", "Seek medical care if symptoms worsen or persist.")
        ).strip()
        or "Seek medical care if symptoms worsen or persist.",
        references=[str(ref).strip() for ref in references if str(ref).strip()],
    )


async def ask_groq_structured(
    message: str,
    language: str,
    reference_hints: list[str],
    mode: ChatMode = "chat",
    profile_context: dict[str, str | int] | None = None,
    personalization_context: dict[str, str | bool | list[str]] | None = None,
    memory_context: list[str] | None = None,
    is_follow_up: bool = False,
) -> StructuredMedicalResponse:
    settings = get_settings()
    if not settings.groq_api_key:
        raise ValueError("GROQ_API_KEY is not configured.")

    profile_data = profile_context or {}
    personalization_data = personalization_context or {}
    memory_data = memory_context or []

    system_prompt = _build_system_prompt(
        mode=mode,
        profile_context=profile_data,
        personalization_context=personalization_data,
        memory_context=memory_data,
        is_follow_up=is_follow_up,
    )
    language_rule = ""
    if language == "roman_urdu":
        language_rule = (
            "Critical language enforcement: user wrote Roman Urdu. "
            "Reply ONLY in Roman Urdu (Urdu in English alphabet). "
            "Do not use English sentences and do not use Urdu script."
        )
    elif language == "ur":
        language_rule = "Critical language enforcement: user wrote Urdu script. Reply in Urdu script only."
    else:
        language_rule = "Critical language enforcement: user wrote English. Reply in English only."

    user_prompt = (
        f"User language: {language}\n"
        f"{language_rule}\n"
        f"User message: {message}\n"
        f"Candidate references: {reference_hints}\n"
        "Return strict JSON only."
    )

    payload = {
        "model": settings.groq_model,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        "temperature": 0.25,
        "max_tokens": 700,
        "response_format": {"type": "json_object"},
    }

    headers = {
        "Authorization": f"Bearer {settings.groq_api_key}",
        "Content-Type": "application/json",
    }

    async with httpx.AsyncClient(timeout=35.0) as client:
        response = await client.post(GROQ_API_URL, json=payload, headers=headers)
        response.raise_for_status()
        data = response.json()

    content = data["choices"][0]["message"]["content"]

    try:
        parsed = _extract_json_object(content)
        return _normalize(parsed, reference_hints)
    except Exception as exc:
        logger.warning("Groq JSON parse fallback triggered: %s", str(exc))
        return _normalize({"advice": content, "references": reference_hints}, reference_hints)