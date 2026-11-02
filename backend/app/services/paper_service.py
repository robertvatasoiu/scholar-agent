import asyncio
import urllib.parse
from typing import List, Dict, Any, Optional
import httpx

from app.models.schemas import Paper
from app.services.abstract_waterfall import recover_abstract

def reconstruct_openalex_abstract(inverted_index: Optional[Dict[str, List[int]]]) -> Optional[str]:
    if not inverted_index:
        return None
    words_by_pos = {}
    for word, positions in inverted_index.items():
        for pos in positions:
            words_by_pos[pos] = word
    if not words_by_pos:
        return None
    sorted_positions = sorted(words_by_pos.keys())
    return " ".join([words_by_pos[p] for p in sorted_positions])

class PaperService:
    def __init__(self, polite_email: str = "researcher@scholaragent.app"):
        self.polite_email = polite_email

    async def search_papers(
        self,
        query: str,
        limit: int = 25,
        email: Optional[str] = None,
        ieee_key: Optional[str] = None,
        elsevier_key: Optional[str] = None,
        springer_key: Optional[str] = None,
        s2_key: Optional[str] = None
    ) -> List[Paper]:
        used_email = email or self.polite_email
        clean_query = query.strip()

        papers: List[Paper] = []
        existing_dois = set()

        # 1. Fetch from IEEE Xplore REST API dacă există cheie IEEE
        if ieee_key:
            try:
                ieee_articles = await self._fetch_ieee_xplore(clean_query, limit=12, api_key=ieee_key)
                for item in ieee_articles:
                    ieee_paper = self._normalize_ieee(item)
                    if ieee_paper.doi:
                        existing_dois.add(ieee_paper.doi)
                    papers.append(ieee_paper)
            except Exception as e:
                print(f"IEEE search failed: {e}")

        # 2. Fetch from OpenAlex API (Global, acoperă și publicațiile IEEE, Elsevier, Springer etc.)
        openalex_works = await self._fetch_openalex(clean_query, limit, used_email)
        for w in openalex_works:
            paper = self._normalize_openalex(w)
            if paper.doi and paper.doi in existing_dois:
                continue
            if paper.doi:
                existing_dois.add(paper.doi)
            papers.append(paper)

        # 3. If results are few, supplement from Crossref
        if len(papers) < 8:
            try:
                crossref_items = await self._fetch_crossref(clean_query, limit=10, email=used_email)
                for item in crossref_items:
                    cr_paper = self._normalize_crossref(item)
                    if cr_paper.doi and cr_paper.doi in existing_dois:
                        continue
                    if cr_paper.doi:
                        existing_dois.add(cr_paper.doi)
                    papers.append(cr_paper)
            except Exception as e:
                pass

        # 4. Concurrent Abstract Recovery for papers with missing abstracts
        papers_needing_abstract = [
            p for p in papers 
            if not p.abstract or "nu este disponibil" in p.abstract.lower() or len(p.abstract) < 80
        ]

        if papers_needing_abstract:
            tasks = [
                recover_abstract(
                    p.doi, 
                    email=used_email,
                    ieee_key=ieee_key,
                    elsevier_key=elsevier_key,
                    springer_key=springer_key,
                    s2_key=s2_key
                )
                for p in papers_needing_abstract
            ]
            recovered_results = await asyncio.gather(*tasks, return_exceptions=True)

            for p, result in zip(papers_needing_abstract, recovered_results):
                if isinstance(result, tuple) and result[0]:
                    p.abstract = result[0]
                    p.abstract_source = result[1] or "Recovered"

        return papers

    async def _fetch_openalex(self, query: str, limit: int, email: str) -> List[Dict[str, Any]]:
        url = f"https://api.openalex.org/works?search={urllib.parse.quote(query)}&per_page={limit}&mailto={urllib.parse.quote(email)}"
        async with httpx.AsyncClient(timeout=12.0) as client:
            resp = await client.get(url, headers={"User-Agent": f"ScholarAgent/3.0 (mailto:{email})"})
            if resp.status_code == 200:
                return resp.json().get("results", [])
        return []

    async def _fetch_crossref(self, query: str, limit: int, email: str) -> List[Dict[str, Any]]:
        url = f"https://api.crossref.org/works?query={urllib.parse.quote(query)}&rows={limit}&mailto={urllib.parse.quote(email)}"
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(url, headers={"User-Agent": f"ScholarAgent/3.0 (mailto:{email})"})
            if resp.status_code == 200:
                return resp.json().get("message", {}).get("items", [])
        return []

    def _normalize_openalex(self, w: Dict[str, Any]) -> Paper:
        raw_doi = w.get("doi")
        clean_doi = raw_doi.replace("https://doi.org/", "").replace("http://doi.org/", "") if raw_doi else None
        
        authors = [
            a.get("author", {}).get("display_name") 
            for a in w.get("authorships", []) 
            if a.get("author", {}).get("display_name")
        ]
        
        oa_dict = w.get("open_access", {})
        is_oa = bool(oa_dict.get("is_oa", False))
        oa_url = oa_dict.get("oa_url") or w.get("primary_location", {}).get("pdf_url")

        concepts = [
            c.get("display_name")
            for c in sorted(w.get("concepts", []), key=lambda x: x.get("score", 0), reverse=True)[:5]
            if c.get("display_name")
        ]

        abstract = reconstruct_openalex_abstract(w.get("abstract_inverted_index"))
        if not abstract:
            abstract = "Abstractul nu este disponibil în indexul inițial. Se va activa recuperarea automată."
            abstract_source = "În așteptare recuperare"
        else:
            abstract_source = "OpenAlex"

        primary_loc = w.get("primary_location") or {}
        source_dict = primary_loc.get("source") or {}
        venue = source_dict.get("display_name") or w.get("host_venue", {}).get("display_name") or "Academic Venue"
        publisher = source_dict.get("publisher") or "Publisher"

        return Paper(
            id=w.get("id") or f"openalex:{clean_doi or id(w)}",
            title=w.get("title") or "Untitled Academic Work",
            authors=authors if authors else ["Unknown Author(s)"],
            year=w.get("publication_year") or "N/A",
            publication_date=w.get("publication_date"),
            citations=w.get("cited_by_count") or 0,
            is_open_access=is_oa,
            oa_status=oa_dict.get("oa_status") or ("open" if is_oa else "closed"),
            oa_pdf_url=oa_url,
            doi=clean_doi,
            doi_url=f"https://doi.org/{clean_doi}" if clean_doi else None,
            landing_url=primary_loc.get("landing_page_url") or (f"https://doi.org/{clean_doi}" if clean_doi else None),
            venue=venue,
            publisher=publisher,
            concepts=concepts,
            abstract=abstract,
            abstract_source=abstract_source
        )

    def _normalize_crossref(self, item: Dict[str, Any]) -> Paper:
        doi = item.get("DOI")
        title_list = item.get("title", [])
        title = title_list[0] if title_list else "Untitled"
        authors = [
            f"{a.get('given', '')} {a.get('family', '')}".strip()
            for a in item.get("author", [])
            if a.get("family")
        ]
        year = item.get("published", {}).get("date-parts", [[None]])[0][0] or "N/A"
        publisher = item.get("publisher") or "Publisher"
        containers = item.get("container-title", [])
        venue = containers[0] if containers else publisher

        raw_abstract = item.get("abstract")
        if raw_abstract:
            import re
            cleaned = re.sub(r"<[^>]+>", "", raw_abstract).strip()
            abstract = cleaned
            abstract_source = "Crossref Metadata"
        else:
            abstract = "Abstractul nu este disponibil în Crossref."
            abstract_source = "Crossref (Fără abstract)"

        return Paper(
            id=f"crossref:{doi or id(item)}",
            title=title,
            authors=authors if authors else ["Unknown Author(s)"],
            year=year,
            publication_date=str(year),
            citations=item.get("is-referenced-by-count") or 0,
            is_open_access=False,
            oa_status="closed",
            oa_pdf_url=None,
            doi=doi,
            doi_url=f"https://doi.org/{doi}" if doi else None,
            landing_url=f"https://doi.org/{doi}" if doi else item.get("URL"),
            venue=venue,
            publisher=publisher,
            concepts=["Crossref Indexed"],
            abstract=abstract,
            abstract_source=abstract_source
        )

    async def _fetch_ieee_xplore(self, query: str, limit: int, api_key: str) -> List[Dict[str, Any]]:
        url = f"https://ieeexploreapi.ieee.org/api/v1/search/articles?querytext={urllib.parse.quote(query)}&max_records={limit}&apikey={api_key}&format=json"
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(url)
            if resp.status_code == 200:
                return resp.json().get("articles", [])
        return []

    def _normalize_ieee(self, item: Dict[str, Any]) -> Paper:
        doi = item.get("doi")
        authors_data = item.get("authors", {}).get("authors", [])
        authors = [a.get("full_name") for a in authors_data if a.get("full_name")]
        
        abstract = item.get("abstract") or "Abstractul nu a fost returnat în mod complet de IEEE."
        is_oa = item.get("access_type") == "OPEN_ACCESS"

        return Paper(
            id=f"ieee:{item.get('article_number') or doi or id(item)}",
            title=item.get("title") or "IEEE Publication",
            authors=authors if authors else ["IEEE Author(s)"],
            year=item.get("publication_year") or "N/A",
            publication_date=str(item.get("publication_date") or item.get("publication_year") or ""),
            citations=item.get("citing_paper_count") or 0,
            is_open_access=is_oa,
            oa_status="open" if is_oa else "closed",
            oa_pdf_url=item.get("pdf_url") if is_oa else None,
            doi=doi,
            doi_url=f"https://doi.org/{doi}" if doi else None,
            landing_url=item.get("html_url") or (f"https://doi.org/{doi}" if doi else None),
            venue=item.get("publication_title") or "IEEE Xplore",
            publisher="IEEE",
            concepts=["IEEE Xplore", "Engineering / CS"],
            abstract=abstract,
            abstract_source="IEEE Xplore API"
        )
