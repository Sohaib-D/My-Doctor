import httpx
from models.schemas import WHOStatsResponse

WHO_GHO_BASE = "https://ghoapi.azureedge.net/api"

# Map common topic keywords to WHO GHO indicator codes
TOPIC_INDICATOR_MAP = {
    "malaria": "MALARIA_EST_INCIDENCE",
    "tuberculosis": "MDG_0000000020",
    "tb": "MDG_0000000020",
    "hiv": "HIV_0000000001",
    "aids": "HIV_0000000001",
    "diabetes": "NCD_GLUC_04",
    "obesity": "NCD_BMI_30C",
    "smoking": "M_Est_smk_curr_std",
    "tobacco": "M_Est_smk_curr_std",
    "alcohol": "SA_0000001462",
    "mortality": "WHOSIS_000001",
    "life expectancy": "WHOSIS_000001",
    "hypertension": "BP_04",
    "blood pressure": "BP_04",
    "cancer": "NCD_CRA_CANCRMORTR",
    "cholera": "WHS3_57",
    "measles": "WHS4_544",
    "polio": "WHS4_117",
    "vaccination": "WHS4_544",
    "mental health": "MH_12",
    "depression": "MH_12",
    "suicide": "MH_12",
    "covid": "COVID_19_IMPACT",
    "coronavirus": "COVID_19_IMPACT",
    "water": "WSH_WATER_SAFELY_MANAGED",
    "sanitation": "WSH_SANITATION_SAFELY_MANAGED",
}

DEFAULT_INDICATOR = "MALARIA_EST_INCIDENCE"

URDU_TOPIC_MAP = {
    "ملیریا": "malaria",
    "ذیابیطس": "diabetes",
    "تپ دق": "tuberculosis",
    "ایڈز": "aids",
    "کینسر": "cancer",
    "بلڈ پریشر": "hypertension",
}


def _normalize_topic(topic: str) -> str:
    return URDU_TOPIC_MAP.get(topic.strip(), topic)


def _resolve_indicator(topic: str) -> tuple[str, str]:
    """Return (indicator_code, matched_topic)."""
    topic_lower = topic.lower()
    for keyword, code in TOPIC_INDICATOR_MAP.items():
        if keyword in topic_lower:
            return code, keyword
    return DEFAULT_INDICATOR, "malaria (default)"


async def get_who_stats(topic: str) -> WHOStatsResponse:
    indicator_code, matched_topic = _resolve_indicator(topic)

    url = f"{WHO_GHO_BASE}/{indicator_code}"
    params = {"$top": 10, "$orderby": "TimeDim desc"}

    async with httpx.AsyncClient(timeout=20.0) as client:
        response = await client.get(url, params=params)

        if response.status_code == 404:
            # Fallback: search available indicators
            search_url = f"{WHO_GHO_BASE}/Indicator"
            search_params = {"$filter": f"contains(IndicatorName,'{topic}')", "$top": 5}
            search_response = await client.get(search_url, params=search_params)
            if search_response.status_code == 200:
                indicators = search_response.json().get("value", [])
                return WHOStatsResponse(
                    topic=topic,
                    data={
                        "message": f"No direct data found for '{topic}'. Related WHO indicators found:",
                        "related_indicators": [
                            {
                                "code": ind.get("IndicatorCode"),
                                "name": ind.get("IndicatorName"),
                            }
                            for ind in indicators
                        ],
                    },
                )
            return WHOStatsResponse(
                topic=topic,
                data={"message": f"No WHO data found for topic: '{topic}'"},
            )

        response.raise_for_status()
        raw_data = response.json()

    records = raw_data.get("value", [])
    simplified = []
    for record in records[:10]:
        entry = {
            "country": record.get("SpatialDim", "N/A"),
            "year": record.get("TimeDim", "N/A"),
            "value": record.get("NumericValue", record.get("Value", "N/A")),
            "dimension_type": record.get("Dim1Type", ""),
            "dimension": record.get("Dim1", ""),
        }
        simplified.append(entry)

    return WHOStatsResponse(
        topic=topic,
        data={
            "indicator_code": indicator_code,
            "matched_topic": matched_topic,
            "total_records_returned": len(simplified),
            "records": simplified,
            "note": "Data sourced from WHO Global Health Observatory. Values may represent estimates.",
        },
    )