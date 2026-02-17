import os
import httpx
from models.schemas import ResearchResponse, ResearchArticle

NCBI_API_KEY = os.getenv("NCBI_API_KEY", "")
ESEARCH_URL = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi"
ESUMMARY_URL = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi"
MAX_RESULTS = 5


async def search_pubmed(query: str) -> ResearchResponse:
    esearch_params = {
        "db": "pubmed",
        "term": query,
        "retmax": MAX_RESULTS,
        "retmode": "json",
        "sort": "relevance",
    }
    if NCBI_API_KEY:
        esearch_params["api_key"] = NCBI_API_KEY

    async with httpx.AsyncClient(timeout=20.0) as client:
        # Step 1: Search for article IDs
        search_response = await client.get(ESEARCH_URL, params=esearch_params)
        search_response.raise_for_status()
        search_data = search_response.json()

        id_list = search_data.get("esearchresult", {}).get("idlist", [])
        total_found = int(search_data.get("esearchresult", {}).get("count", 0))

        if not id_list:
            return ResearchResponse(query=query, articles=[], total_found=0)

        # Step 2: Fetch summaries for those IDs
        esummary_params = {
            "db": "pubmed",
            "id": ",".join(id_list),
            "retmode": "json",
        }
        if NCBI_API_KEY:
            esummary_params["api_key"] = NCBI_API_KEY

        summary_response = await client.get(ESUMMARY_URL, params=esummary_params)
        summary_response.raise_for_status()
        summary_data = summary_response.json()

    articles = []
    result_map = summary_data.get("result", {})

    for pmid in id_list:
        article_data = result_map.get(pmid, {})
        if not article_data or pmid == "uids":
            continue

        title = article_data.get("title", "No title available")
        pub_date = article_data.get("pubdate", "Unknown date")

        # Build a summary from available metadata
        authors = article_data.get("authors", [])
        author_names = ", ".join(a.get("name", "") for a in authors[:3])
        if len(authors) > 3:
            author_names += " et al."
        source = article_data.get("source", "")
        volume = article_data.get("volume", "")
        pages = article_data.get("pages", "")

        summary_parts = []
        if author_names:
            summary_parts.append(f"Authors: {author_names}")
        if source:
            summary_parts.append(f"Journal: {source}")
        if volume:
            summary_parts.append(f"Volume: {volume}")
        if pages:
            summary_parts.append(f"Pages: {pages}")
        summary_parts.append(f"PubMed ID: {pmid}")

        articles.append(
            ResearchArticle(
                title=title,
                publication_date=pub_date,
                summary=" | ".join(summary_parts) if summary_parts else "No summary available.",
                pubmed_id=pmid,
            )
        )

    return ResearchResponse(query=query, articles=articles, total_found=total_found)
