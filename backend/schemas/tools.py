from __future__ import annotations

from pydantic import BaseModel


class DrugInfo(BaseModel):
    name: str
    indications: list[str]
    warnings: list[str]
    side_effects: list[str]


class ResearchArticle(BaseModel):
    title: str
    publication_date: str
    summary: str
    pubmed_id: str


class ResearchResponse(BaseModel):
    query: str
    articles: list[ResearchArticle]
    total_found: int


class WHOStatsResponse(BaseModel):
    topic: str
    data: dict
    source: str = "World Health Organization (WHO) Global Health Observatory"
