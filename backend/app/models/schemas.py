from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any

class Paper(BaseModel):
    id: str
    title: str
    authors: List[str] = []
    year: Any = "N/A"
    publication_date: Optional[str] = None
    citations: int = 0
    is_open_access: bool = False
    oa_status: str = "closed"
    oa_pdf_url: Optional[str] = None
    doi: Optional[str] = None
    doi_url: Optional[str] = None
    landing_url: Optional[str] = None
    venue: str = "Academic Venue"
    publisher: str = "Publisher"
    concepts: List[str] = []
    abstract: str
    abstract_source: str = "OpenAlex"
    semantic_score: Optional[float] = Field(default=None, description="Cos similarity score from RAG vector search (0.0 to 1.0)")

class SearchRequest(BaseModel):
    query: str
    limit: int = 25
    page: int = 1
    enable_semantic_rerank: bool = True
    gemini_key: Optional[str] = None
    ieee_key: Optional[str] = None
    elsevier_key: Optional[str] = None
    email: Optional[str] = "researcher@scholaragent.app"

class SearchResponse(BaseModel):
    query: str
    total_found: int
    papers: List[Paper]
    open_access_count: int
    paywalled_count: int
    semantic_search_active: bool

class AbstractRecoverRequest(BaseModel):
    doi: str
    email: Optional[str] = "researcher@scholaragent.app"
    ieee_key: Optional[str] = None
    elsevier_key: Optional[str] = None
    springer_key: Optional[str] = None
    s2_key: Optional[str] = None

class AbstractRecoverResponse(BaseModel):
    doi: str
    recovered: bool
    abstract: Optional[str] = None
    source: Optional[str] = None
    message: str

class RAGAskRequest(BaseModel):
    question: str
    papers: List[Paper]
    top_k: int = 5
    gemini_key: Optional[str] = None

class RAGCitation(BaseModel):
    doi: Optional[str] = None
    title: str
    year: Any
    authors: List[str]
    relevance_score: float

class RAGAskResponse(BaseModel):
    question: str
    answer: str
    citations: List[RAGCitation]
    retrieved_abstracts_count: int
