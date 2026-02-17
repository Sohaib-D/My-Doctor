from pydantic import BaseModel
from typing import Optional, List


class ChatRequest(BaseModel):
    message: str
    session_id: Optional[str] = None


class ChatResponse(BaseModel):
    response: str
    emergency: bool = False
    disclaimer: str = (
        "⚠️ This information is for educational purposes only and does not constitute medical advice. "
        "Always consult a qualified healthcare professional for diagnosis and treatment."
    )


class DrugInfo(BaseModel):
    name: str
    indications: List[str]
    warnings: List[str]
    side_effects: List[str]
    disclaimer: str = (
        "⚠️ Drug information is provided for educational purposes only. "
        "Never change your medication without consulting your doctor or pharmacist."
    )


class ResearchArticle(BaseModel):
    title: str
    publication_date: str
    summary: str
    pubmed_id: str


class ResearchResponse(BaseModel):
    query: str
    articles: List[ResearchArticle]
    total_found: int


class WHOStatsResponse(BaseModel):
    topic: str
    data: dict
    source: str = "World Health Organization (WHO) Global Health Observatory"
