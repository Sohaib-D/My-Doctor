from __future__ import annotations

import json

import httpx

from backend.config import get_settings
from backend.schemas.chat import StructuredMedicalResponse
from backend.utils.logging import logger


GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions"


UPDATED_GROQ_SYSTEM_PROMPT = """
You are Personal Doctor, a safe and structured AI medical assistant.

Core behavior:
- Reply in the same language as the user (English or Urdu).
- Be concise, clinical, and practical.
- Do not provide exact prescription doses.
- If red flags are present, set urgency_level to "emergency" and instruct immediate emergency care.
- Always recommend seeing a real doctor for diagnosis confirmation.

Output rules:
- Return strict JSON only.
- Use exactly this schema:
{
  "symptoms": "...",
  "possible_causes": "...",
  "advice": "...",
  "urgency_level": "low|moderate|high|emergency",
  "when_to_see_doctor": "...",
  "references": ["NCBI/PubMed URL", "..."]
}

Quality rules:
- possible_causes should prioritize common causes first.
- advice should include immediate self-care + monitoring + escalation guidance.
- references should include relevant PubMed/NCBI links when available.
""".strip()


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
) -> StructuredMedicalResponse:
    settings = get_settings()
    if not settings.groq_api_key:
        raise ValueError("GROQ_API_KEY is not configured.")

    user_prompt = (
        f"User language: {language}\n"
        f"User message: {message}\n"
        f"Candidate references: {reference_hints}\n"
        "Return strict JSON only."
    )

    payload = {
        "model": settings.groq_model,
        "messages": [
            {"role": "system", "content": UPDATED_GROQ_SYSTEM_PROMPT},
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
