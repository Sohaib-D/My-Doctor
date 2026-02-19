from __future__ import annotations

from dataclasses import dataclass
import os

import httpx

from backend.schemas.tools import ResearchArticle, ResearchResponse


NCBI_API_KEY = os.getenv("NCBI_API_KEY", "")
ESEARCH_URL = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi"
ESUMMARY_URL = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi"


@dataclass
class PubMedReference:
    title: str
    pubmed_id: str
    url: str


async def _search_ids(query: str, retmax: int = 5) -> tuple[list[str], int]:
    params = {
        "db": "pubmed",
        "term": query,
        "retmax": retmax,
        "retmode": "json",
        "sort": "relevance",
    }
    if NCBI_API_KEY:
        params["api_key"] = NCBI_API_KEY

    async with httpx.AsyncClient(timeout=20.0) as client:
        response = await client.get(ESEARCH_URL, params=params)
        response.raise_for_status()
        payload = response.json()

    result = payload.get("esearchresult", {})
    ids = result.get("idlist", [])
    count = int(result.get("count", 0))
    return ids, count


async def _fetch_summaries(pubmed_ids: list[str]) -> dict:
    if not pubmed_ids:
        return {}

    params = {
        "db": "pubmed",
        "id": ",".join(pubmed_ids),
        "retmode": "json",
    }
    if NCBI_API_KEY:
        params["api_key"] = NCBI_API_KEY

    async with httpx.AsyncClient(timeout=20.0) as client:
        response = await client.get(ESUMMARY_URL, params=params)
        response.raise_for_status()
        payload = response.json()

    return payload.get("result", {})


async def fetch_pubmed_references(query: str, limit: int = 3) -> list[PubMedReference]:
    ids, _ = await _search_ids(query, retmax=limit)
    if not ids:
        return []

    summary_map = await _fetch_summaries(ids)
    refs: list[PubMedReference] = []
    for pmid in ids:
        data = summary_map.get(pmid, {})
        if not data:
            continue
        refs.append(
            PubMedReference(
                title=data.get("title", f"PubMed {pmid}"),
                pubmed_id=pmid,
                url=f"https://pubmed.ncbi.nlm.nih.gov/{pmid}/",
            )
        )
    return refs


async def search_pubmed(query: str) -> ResearchResponse:
    ids, total = await _search_ids(query, retmax=5)
    if not ids:
        return ResearchResponse(query=query, articles=[], total_found=0)

    summary_map = await _fetch_summaries(ids)
    articles: list[ResearchArticle] = []

    for pmid in ids:
        data = summary_map.get(pmid, {})
        if not data:
            continue

        title = data.get("title", "No title available")
        pub_date = data.get("pubdate", "Unknown date")
        authors = data.get("authors", [])
        author_names = ", ".join(author.get("name", "") for author in authors[:3])
        if len(authors) > 3:
            author_names += " et al."

        source = data.get("source", "")
        summary = " | ".join(
            part
            for part in [
                f"Authors: {author_names}" if author_names else "",
                f"Journal: {source}" if source else "",
                f"PubMed ID: {pmid}",
            ]
            if part
        )

        articles.append(
            ResearchArticle(
                title=title,
                publication_date=pub_date,
                summary=summary,
                pubmed_id=pmid,
            )
        )

    return ResearchResponse(query=query, articles=articles, total_found=total)
