import re
import urllib.parse
from typing import Optional, Tuple
import httpx

CLEANR = re.compile(r"<[^>]+>")

def clean_html(raw_html: str) -> str:
    clean_text = re.sub(CLEANR, "", raw_html)
    return re.sub(r"\s+", " ", clean_text).strip()

async def recover_abstract(
    doi: str,
    email: str = "researcher@scholaragent.app",
    ieee_key: Optional[str] = None,
    elsevier_key: Optional[str] = None,
    springer_key: Optional[str] = None,
    s2_key: Optional[str] = None
) -> Tuple[Optional[str], Optional[str]]:
    """
    Recuperare automată abstract prin cascade de API-uri academice:
    1. Europe PMC (complet deschis, milioane de abstracte chiar și pentru paperuri paywalled)
    2. Crossref (metadata depusă oficial de publisheri în format JATS XML)
    3. IEEE Xplore REST API (pentru articole/conferințe IEEE cu prefix DOI 10.1109/)
    4. Elsevier Scopus API (dacă este furnizată o cheie și DOI-ul este Elsevier)
    5. Springer Nature Metadata API (dacă este furnizată o cheie Springer)
    6. Semantic Scholar Graph API (Academic Graph)
    """
    if not doi:
        return None, None

    clean_doi = doi.strip().replace("https://doi.org/", "").replace("http://doi.org/", "")

    async with httpx.AsyncClient(timeout=10.0, follow_redirects=True) as client:
        # Layer 1: Europe PMC
        try:
            query = urllib.parse.quote(f'DOI:"{clean_doi}"')
            epmc_url = f"https://www.ebi.ac.uk/europepmc/webservices/rest/search?query={query}&format=json&resultType=core"
            resp = await client.get(epmc_url, headers={"User-Agent": "ScholarAgent/3.0"})
            if resp.status_code == 200:
                data = resp.json()
                results = data.get("resultList", {}).get("result", [])
                if results and results[0].get("abstractText"):
                    abstract = clean_html(results[0]["abstractText"])
                    if len(abstract) > 60:
                        return abstract, "Europe PMC (Public)"
        except Exception as e:
            pass

        # Layer 2: Crossref
        try:
            cr_url = f"https://api.crossref.org/works/{urllib.parse.quote(clean_doi)}?mailto={urllib.parse.quote(email)}"
            resp = await client.get(cr_url, headers={"User-Agent": f"ScholarAgent/3.0 (mailto:{email})"})
            if resp.status_code == 200:
                data = resp.json()
                raw_abstract = data.get("message", {}).get("abstract")
                if raw_abstract:
                    cleaned = clean_html(raw_abstract)
                    if len(cleaned) > 60:
                        return cleaned, "Crossref Metadata"
        except Exception as e:
            pass

        # Layer 3: IEEE Xplore API (Official IEEE REST Endpoint)
        if ieee_key and (clean_doi.startswith("10.1109/") or "ieee" in clean_doi.lower()):
            try:
                ieee_url = f"https://ieeexploreapi.ieee.org/api/v1/search/articles?doi={urllib.parse.quote(clean_doi)}&apikey={ieee_key}&format=json"
                resp = await client.get(ieee_url)
                if resp.status_code == 200:
                    data = resp.json()
                    articles = data.get("articles", [])
                    if articles and articles[0].get("abstract"):
                        return clean_html(articles[0]["abstract"]), "IEEE Xplore API"
            except Exception as e:
                pass

        # Layer 4: Elsevier ScienceDirect / Scopus API
        if elsevier_key and clean_doi.startswith("10.1016/"):
            try:
                els_url = f"https://api.elsevier.com/content/article/doi/{clean_doi}?apiKey={elsevier_key}&httpAccept=application/json"
                resp = await client.get(els_url)
                if resp.status_code == 200:
                    data = resp.json()
                    core = (
                        data.get("full-text-retrieval-response", {}).get("coredata")
                        or data.get("abstracts-retrieval-response", {}).get("coredata")
                    )
                    if core and core.get("dc:description"):
                        return clean_html(core["dc:description"]), "Elsevier Scopus API"
            except Exception as e:
                pass

        # Layer 4: Springer Nature API
        if springer_key:
            try:
                sp_url = f"https://api.springernature.com/meta/v2/json?q=doi:{clean_doi}&api_key={springer_key}"
                resp = await client.get(sp_url)
                if resp.status_code == 200:
                    data = resp.json()
                    records = data.get("records", [])
                    if records and records[0].get("abstract"):
                        return clean_html(records[0]["abstract"]), "Springer Nature API"
            except Exception as e:
                pass

        # Layer 5: Semantic Scholar Graph API
        try:
            headers = {"User-Agent": "ScholarAgent/3.0"}
            if s2_key:
                headers["x-api-key"] = s2_key
            s2_url = f"https://api.semanticscholar.org/graph/v1/paper/DOI:{clean_doi}?fields=abstract"
            resp = await client.get(s2_url, headers=headers)
            if resp.status_code == 200:
                data = resp.json()
                if data.get("abstract") and len(data["abstract"]) > 60:
                    return clean_html(data["abstract"]), "Semantic Scholar"
        except Exception as e:
            pass

    return None, None
