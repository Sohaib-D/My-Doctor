from __future__ import annotations

import httpx

from backend.schemas.tools import WHOStatsResponse


WHO_GHO_BASE = "https://ghoapi.azureedge.net/api"

TOPIC_INDICATOR_MAP = {
    "malaria": "MALARIA_EST_INCIDENCE",
    "tuberculosis": "MDG_0000000020",
    "tb": "MDG_0000000020",
    "hiv": "HIV_0000000001",
    "aids": "HIV_0000000001",
    "diabetes": "NCD_GLUC_04",
    "obesity": "NCD_BMI_30C",
    "hypertension": "BP_04",
    "cancer": "NCD_CRA_CANCRMORTR",
    "cholera": "WHS3_57",
}
DEFAULT_INDICATOR = "MALARIA_EST_INCIDENCE"


def _resolve_indicator(topic: str) -> tuple[str, str]:
    lower = topic.lower()
    for keyword, code in TOPIC_INDICATOR_MAP.items():
        if keyword in lower:
            return code, keyword
    return DEFAULT_INDICATOR, "malaria (default)"


async def get_who_stats(topic: str) -> WHOStatsResponse:
    indicator_code, matched_topic = _resolve_indicator(topic)
    url = f"{WHO_GHO_BASE}/{indicator_code}"

    async with httpx.AsyncClient(timeout=20.0) as client:
        response = await client.get(url, params={"$top": 10, "$orderby": "TimeDim desc"})
        response.raise_for_status()
        payload = response.json()

    records = payload.get("value", [])
    simplified = [
        {
            "country": rec.get("SpatialDim", "N/A"),
            "year": rec.get("TimeDim", "N/A"),
            "value": rec.get("NumericValue", rec.get("Value", "N/A")),
            "dimension": rec.get("Dim1", ""),
        }
        for rec in records[:10]
    ]

    return WHOStatsResponse(
        topic=topic,
        data={
            "indicator_code": indicator_code,
            "matched_topic": matched_topic,
            "records": simplified,
            "total_records_returned": len(simplified),
        },
    )
