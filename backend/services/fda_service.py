from __future__ import annotations

import httpx

from backend.schemas.tools import DrugInfo


FDA_BASE_URL = "https://api.fda.gov/drug/label.json"


def _extract_field(label: dict, *keys: str) -> list[str]:
    for key in keys:
        value = label.get(key)
        if value and isinstance(value, list):
            result: list[str] = []
            for item in value:
                lines = [line.strip() for line in item.split("\n") if line.strip()]
                result.extend(lines[:5])
            return result[:10]
    return ["Information not available."]


async def get_drug_info(drug_name: str) -> DrugInfo:
    params = {
        "search": f"openfda.brand_name:\"{drug_name}\"+openfda.generic_name:\"{drug_name}\"",
        "limit": 1,
    }

    async with httpx.AsyncClient(timeout=15.0) as client:
        response = await client.get(FDA_BASE_URL, params=params)
        if response.status_code == 404:
            response = await client.get(FDA_BASE_URL, params={"search": drug_name, "limit": 1})
        response.raise_for_status()
        data = response.json()

    results = data.get("results", [])
    if not results:
        return DrugInfo(
            name=drug_name,
            indications=["No FDA label information found for this drug."],
            warnings=["Consult a pharmacist or physician for accurate information."],
            side_effects=["Information not available."],
        )

    label = results[0]
    return DrugInfo(
        name=drug_name,
        indications=_extract_field(label, "indications_and_usage", "purpose", "description"),
        warnings=_extract_field(label, "warnings", "warnings_and_cautions", "boxed_warning", "contraindications"),
        side_effects=_extract_field(label, "adverse_reactions", "adverse_reactions_table"),
    )
