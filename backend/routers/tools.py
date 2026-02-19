from __future__ import annotations

import httpx
from fastapi import APIRouter, HTTPException, Query

from backend.schemas.tools import DrugInfo, ResearchResponse, WHOStatsResponse
from backend.services.fda_service import get_drug_info
from backend.services.pubmed_service import search_pubmed
from backend.services.who_service import get_who_stats


router = APIRouter(tags=["tools"])


@router.get("/drug", response_model=DrugInfo)
async def drug_info(
    name: str = Query(..., min_length=2, max_length=100, description="Drug brand or generic name"),
):
    try:
        return await get_drug_info(name.strip())
    except httpx.HTTPStatusError as exc:
        if exc.response.status_code == 404:
            raise HTTPException(status_code=404, detail=f"No FDA data found for '{name}'.")
        raise HTTPException(status_code=502, detail=f"OpenFDA API error: {exc.response.status_code}")
    except httpx.RequestError as exc:
        raise HTTPException(status_code=503, detail=f"OpenFDA unavailable: {str(exc)}")


@router.get("/research", response_model=ResearchResponse)
async def research(
    query: str = Query(..., min_length=3, max_length=200, description="Medical research query"),
):
    try:
        return await search_pubmed(query.strip())
    except httpx.HTTPStatusError as exc:
        raise HTTPException(status_code=502, detail=f"PubMed API error: {exc.response.status_code}")
    except httpx.RequestError as exc:
        raise HTTPException(status_code=503, detail=f"PubMed unavailable: {str(exc)}")


@router.get("/stats", response_model=WHOStatsResponse)
async def stats(
    topic: str = Query(..., min_length=2, max_length=100, description="Health topic"),
):
    try:
        return await get_who_stats(topic.strip())
    except httpx.HTTPStatusError as exc:
        raise HTTPException(status_code=502, detail=f"WHO API error: {exc.response.status_code}")
    except httpx.RequestError as exc:
        raise HTTPException(status_code=503, detail=f"WHO service unavailable: {str(exc)}")
