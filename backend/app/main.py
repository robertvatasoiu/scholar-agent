import os
from pathlib import Path
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

from app.config import settings
from app.models.schemas import (
    SearchRequest,
    SearchResponse,
    AbstractRecoverRequest,
    AbstractRecoverResponse,
    RAGAskRequest,
    RAGAskResponse,
)
from app.services.paper_service import PaperService
from app.services.abstract_waterfall import recover_abstract
from app.services.semantic_rag import semantic_rag_engine

app = FastAPI(
    title=settings.APP_NAME,
    version=settings.VERSION,
    description="Backend & Semantic RAG Engine pentru căutarea și sinteza lucrărilor academice (Open Access & Paywalled).",
    docs_url="/docs",
    redoc_url="/redoc"
)

# CORS Middleware (permite cereri din orice frontend, localhost sau remote)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

paper_service = PaperService(polite_email=settings.DEFAULT_POLITE_EMAIL)

@app.get("/api/health")
async def health_check():
    return {
        "status": "online",
        "service": settings.APP_NAME,
        "version": settings.VERSION,
        "dense_embeddings_loaded": semantic_rag_engine._dense_model is not None
    }

@app.post("/api/search", response_model=SearchResponse)
async def search_academic_papers(req: SearchRequest):
    """
    1. Căutare multi-sursă (IEEE Xplore, OpenAlex, Crossref).
    2. Recuperare automată de abstracte pentru articole paywalled.
    3. Căutare și Reordonare Semantică pe baza abstractelor (Vector Similarity Reranking).
    """
    try:
        papers = await paper_service.search_papers(
            query=req.query,
            limit=req.limit,
            email=req.email or settings.DEFAULT_POLITE_EMAIL,
            ieee_key=req.ieee_key or settings.IEEE_API_KEY or None,
            elsevier_key=req.elsevier_key or settings.ELSEVIER_API_KEY or None,
            springer_key=settings.SPRINGER_API_KEY,
            s2_key=settings.S2_API_KEY
        )

        semantic_active = False
        if req.enable_semantic_rerank and papers:
            papers = semantic_rag_engine.compute_semantic_scores(req.query, papers)
            semantic_active = True

        oa_count = sum(1 for p in papers if p.is_open_access)
        paywalled_count = len(papers) - oa_count

        return SearchResponse(
            query=req.query,
            total_found=len(papers),
            papers=papers,
            open_access_count=oa_count,
            paywalled_count=paywalled_count,
            semantic_search_active=semantic_active
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Căutarea a eșuat: {str(e)}")

@app.post("/api/rag/ask", response_model=RAGAskResponse)
async def ask_rag_over_abstracts(req: RAGAskRequest):
    """
    RAG pe Abstracte: răspunde la o întrebare specifică de cercetare utilizând abstractele
    lucrărilor găsite ca bază factuală de evidențe.
    """
    try:
        gemini_key = req.gemini_key or settings.GEMINI_API_KEY or None
        response = await semantic_rag_engine.answer_rag_question(
            question=req.question,
            papers=req.papers,
            top_k=req.top_k,
            gemini_key=gemini_key
        )
        return response
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Procesarea RAG a eșuat: {str(e)}")

@app.post("/api/abstract/recover", response_model=AbstractRecoverResponse)
async def recover_paywalled_abstract(req: AbstractRecoverRequest):
    """
    Recuperează la cerere abstractul unui DOI blocat prin Europe PMC, Crossref, Elsevier sau Springer.
    """
    abstract, source = await recover_abstract(
        doi=req.doi,
        email=req.email or settings.DEFAULT_POLITE_EMAIL,
        ieee_key=req.ieee_key or settings.IEEE_API_KEY or None,
        elsevier_key=req.elsevier_key or settings.ELSEVIER_API_KEY or None,
        springer_key=req.springer_key or settings.SPRINGER_API_KEY or None,
        s2_key=req.s2_key or settings.S2_API_KEY or None
    )

    if abstract:
        return AbstractRecoverResponse(
            doi=req.doi,
            recovered=True,
            abstract=abstract,
            source=source,
            message="Abstract recuperat cu succes."
        )
    else:
        return AbstractRecoverResponse(
            doi=req.doi,
            recovered=False,
            abstract=None,
            source=None,
            message="Abstractul nu a fost găsit în API-urile externe disponibile."
        )

# Servire Frontend Static dacă directorul frontend există
frontend_path = Path(__file__).resolve().parent.parent.parent / "frontend"
if frontend_path.exists():
    app.mount("/static", StaticFiles(directory=str(frontend_path)), name="static")

    @app.get("/")
    async def serve_frontend_index():
        index_file = frontend_path / "index.html"
        if index_file.exists():
            return FileResponse(index_file)
        return {"message": "ScholarAgent API rulează. Documentația interactivă este la /docs"}
