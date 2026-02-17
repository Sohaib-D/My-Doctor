"""
My Doctor — AI-powered Medical Information API
Built with FastAPI, Groq LLM, OpenFDA, PubMed, and WHO GHO.
"""

from dotenv import load_dotenv

load_dotenv()

import httpx
from fastapi import FastAPI, Query, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from models.schemas import ChatRequest, ChatResponse, DrugInfo, ResearchResponse, WHOStatsResponse
from services.groq_service import chat_with_groq
from services.fda_service import get_drug_info
from services.pubmed_service import search_pubmed
from services.who_service import get_who_stats

app = FastAPI(
    title="My Doctor — Medical AI Assistant",
    description=(
        "An AI-powered medical information API providing drug data, research articles, "
        "global health statistics, and conversational medical guidance. "
        "⚠️ Not a substitute for professional medical advice."
    ),
    version="1.0.0",
    contact={"name": "My Doctor API Support"},
    license_info={"name": "MIT"},
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ─── Health Check ────────────────────────────────────────────────────────────

@app.get("/", tags=["Health"])
async def root():
    return {
        "service": "My Doctor — Medical AI Assistant",
        "status": "online",
        "version": "1.0.0",
        "disclaimer": (
            "This API provides general medical information for educational purposes only. "
            "It does not constitute medical advice, diagnosis, or treatment. "
            "Always consult a qualified healthcare professional."
        ),
        "endpoints": {
            "chat": "POST /chat",
            "drug_info": "GET /drug?name=<drug_name>",
            "research": "GET /research?query=<search_query>",
            "who_stats": "GET /stats?topic=<topic>",
        },
    }


@app.get("/health", tags=["Health"])
async def health_check():
    return {"status": "healthy"}


# ─── Chat Endpoint ────────────────────────────────────────────────────────────

@app.post("/chat", response_model=ChatResponse, tags=["AI Chat"])
async def chat(request: ChatRequest):
    """
    Send a medical question to the AI assistant (powered by Groq LLM).
    
    The system automatically detects emergency keywords and returns urgent
    instructions to contact emergency services when needed.
    """
    if not request.message or not request.message.strip():
        raise HTTPException(status_code=400, detail="Message cannot be empty.")

    if len(request.message) > 2000:
        raise HTTPException(
            status_code=400, detail="Message too long. Maximum 2000 characters."
        )

    try:
        result = await chat_with_groq(request.message.strip())
        return result
    except ValueError as e:
        raise HTTPException(status_code=500, detail=str(e))
    except httpx.HTTPStatusError as e:
        raise HTTPException(
            status_code=502,
            detail=f"AI service error: {e.response.status_code} — {e.response.text[:200]}",
        )
    except httpx.RequestError as e:
        raise HTTPException(status_code=503, detail=f"AI service unreachable: {str(e)}")


# ─── Drug Info Endpoint ───────────────────────────────────────────────────────

@app.get("/drug", response_model=DrugInfo, tags=["Drug Information"])
async def drug_info(
    name: str = Query(..., min_length=2, max_length=100, description="Drug brand or generic name"),
):
    """
    Retrieve FDA-sourced drug information including indications, warnings, and side effects.
    Data is fetched from the OpenFDA drug label API.
    """
    try:
        result = await get_drug_info(name.strip())
        return result
    except httpx.HTTPStatusError as e:
        if e.response.status_code == 404:
            raise HTTPException(
                status_code=404,
                detail=f"No FDA data found for drug: '{name}'. Try a different spelling or generic name.",
            )
        raise HTTPException(
            status_code=502, detail=f"OpenFDA API error: {e.response.status_code}"
        )
    except httpx.RequestError as e:
        raise HTTPException(status_code=503, detail=f"OpenFDA service unreachable: {str(e)}")


# ─── Research Endpoint ────────────────────────────────────────────────────────

@app.get("/research", response_model=ResearchResponse, tags=["Medical Research"])
async def research(
    query: str = Query(..., min_length=3, max_length=200, description="Medical research query"),
):
    """
    Search PubMed for peer-reviewed medical research articles.
    Returns title, publication date, authors, and journal info for top results.
    """
    try:
        result = await search_pubmed(query.strip())
        return result
    except httpx.HTTPStatusError as e:
        raise HTTPException(
            status_code=502, detail=f"PubMed API error: {e.response.status_code}"
        )
    except httpx.RequestError as e:
        raise HTTPException(status_code=503, detail=f"PubMed service unreachable: {str(e)}")


# ─── WHO Stats Endpoint ───────────────────────────────────────────────────────

@app.get("/stats", response_model=WHOStatsResponse, tags=["Global Health Statistics"])
async def who_stats(
    topic: str = Query(
        ...,
        min_length=2,
        max_length=100,
        description="Health topic (e.g. malaria, tuberculosis, diabetes, hiv)",
    ),
):
    """
    Retrieve global health statistics from the WHO Global Health Observatory (GHO) API.
    Supports topics like malaria, HIV, tuberculosis, diabetes, obesity, and more.
    """
    try:
        result = await get_who_stats(topic.strip())
        return result
    except httpx.HTTPStatusError as e:
        raise HTTPException(
            status_code=502, detail=f"WHO API error: {e.response.status_code}"
        )
    except httpx.RequestError as e:
        raise HTTPException(status_code=503, detail=f"WHO service unreachable: {str(e)}")
