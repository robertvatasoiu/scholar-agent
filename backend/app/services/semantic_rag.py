import math
import re
from typing import List, Tuple, Dict, Any, Optional
import httpx

from app.models.schemas import Paper, RAGCitation, RAGAskResponse

class SemanticRAGEngine:
    """
    Motor Hibrid de Căutare Semantică și RAG pe Abstracte Academice.
    Suportă Dense Embeddings (SentenceTransformers), Vector Space Model (TF-IDF/Cosine) 
    și Generare de Răspunsuri RAG fundamentate pe evidențe din abstracte.
    """

    def __init__(self):
        self._dense_model = None
        self._init_dense_model_if_available()

    def _init_dense_model_if_available(self):
        try:
            from sentence_transformers import SentenceTransformer
            # Folosește un model compact, foarte rapid pentru semantic search pe CPU
            self._dense_model = SentenceTransformer("all-MiniLM-L6-v2")
            print("Loaded SentenceTransformer: all-MiniLM-L6-v2")
        except Exception:
            self._dense_model = None

    def compute_semantic_scores(self, query: str, papers: List[Paper]) -> List[Paper]:
        """
        Calculează scorul de similaritate semantică dintre query și abstractul fiecărui paper.
        Returnează lista reordonată descrescător după scorul semantic.
        """
        valid_papers = [p for p in papers if p.abstract and len(p.abstract.strip()) > 30]
        if not valid_papers:
            return papers

        abstracts = [f"{p.title}. {p.abstract}" for p in valid_papers]

        # 1. Metodă Dense (SentenceTransformers) dacă e disponibilă
        if self._dense_model is not None:
            try:
                import numpy as np
                query_emb = self._dense_model.encode([query], normalize_embeddings=True)[0]
                doc_embs = self._dense_model.encode(abstracts, normalize_embeddings=True)
                scores = np.dot(doc_embs, query_emb)

                for paper, score in zip(valid_papers, scores):
                    # Calibrează scorul între 0 și 1
                    paper.semantic_score = round(float(max(0.0, min(1.0, (score + 1) / 2))), 4)

                valid_papers.sort(key=lambda x: x.semantic_score or 0.0, reverse=True)
                return valid_papers
            except Exception as e:
                print(f"Dense model scoring failed, falling back to TF-IDF: {e}")

        # 2. Metodă Vectorială TF-IDF + Cosine Similarity
        try:
            from sklearn.feature_extraction.text import TfidfVectorizer
            from sklearn.metrics.pairwise import cosine_similarity
            vectorizer = TfidfVectorizer(stop_words="english", max_features=5000, ngram_range=(1, 2))
            tfidf_matrix = vectorizer.fit_transform(abstracts + [query])
            doc_vectors = tfidf_matrix[:-1]
            query_vector = tfidf_matrix[-1:]
            cos_scores = cosine_similarity(doc_vectors, query_vector).flatten()

            for paper, score in zip(valid_papers, cos_scores):
                paper.semantic_score = round(float(score), 4)

            valid_papers.sort(key=lambda x: x.semantic_score or 0.0, reverse=True)
            return valid_papers
        except Exception:
            # 3. Fallback pur Python: Word Overlap & Term Frequency Cosine
            return self._pure_python_semantic_rank(query, valid_papers)

    def _pure_python_semantic_rank(self, query: str, papers: List[Paper]) -> List[Paper]:
        def tokenize(text: str) -> List[str]:
            return [w for w in re.findall(r"\w+", text.lower()) if len(w) > 2]

        query_tokens = set(tokenize(query))
        if not query_tokens:
            return papers

        for p in papers:
            doc_tokens = tokenize(f"{p.title} {p.abstract}")
            if not doc_tokens:
                p.semantic_score = 0.0
                continue
            matches = sum(1 for t in doc_tokens if t in query_tokens)
            doc_len = len(doc_tokens)
            # Normalizare lungime cu penalizare logarithmică
            score = (matches / (math.sqrt(doc_len) + 1.0)) * 0.5
            p.semantic_score = round(min(1.0, score), 4)

        papers.sort(key=lambda x: x.semantic_score or 0.0, reverse=True)
        return papers

    async def answer_rag_question(
        self,
        question: str,
        papers: List[Paper],
        top_k: int = 5,
        gemini_key: Optional[str] = None
    ) -> RAGAskResponse:
        """
        RAG Question Answering:
        1. Caută cele mai relevante abstracte pentru întrebare (vector retrieval).
        2. Construiește contextul documentar cu citări formale.
        3. Generează răspunsul (via LLM dacă există cheie Gemini sau sinteză extractivă semantică).
        """
        # Re-evaluează abstractele în raport cu întrebarea specifică
        ranked_papers = self.compute_semantic_scores(question, papers)
        top_papers = ranked_papers[:top_k]

        citations = [
            RAGCitation(
                doi=p.doi,
                title=p.title,
                year=p.year,
                authors=p.authors[:2] + (["et al."] if len(p.authors) > 2 else []),
                relevance_score=p.semantic_score or 0.0
            )
            for p in top_papers
        ]

        if not top_papers:
            return RAGAskResponse(
                question=question,
                answer="Nu au fost găsite abstracte relevante în colecția curentă pentru a răspunde la această întrebare.",
                citations=[],
                retrieved_abstracts_count=0
            )

        # Încearcă generare via Gemini LLM dacă există cheie
        if gemini_key:
            try:
                answer = await self._generate_gemini_rag_answer(question, top_papers, gemini_key)
                return RAGAskResponse(
                    question=question,
                    answer=answer,
                    citations=citations,
                    retrieved_abstracts_count=len(top_papers)
                )
            except Exception as e:
                print(f"Gemini RAG call failed: {e}")

        # Fallback la Extractive Semantic RAG
        extractive_answer = self._generate_extractive_rag_answer(question, top_papers)
        return RAGAskResponse(
            question=question,
            answer=extractive_answer,
            citations=citations,
            retrieved_abstracts_count=len(top_papers)
        )

    async def _generate_gemini_rag_answer(self, question: str, top_papers: List[Paper], gemini_key: str) -> str:
        context_blocks = []
        for i, p in enumerate(top_papers, 1):
            auth = ", ".join(p.authors[:2])
            context_blocks.append(
                f"[{i}] \"{p.title}\" ({p.year}) - Autori: {auth} - DOI: {p.doi or 'N/A'}\n"
                f"Abstract: {p.abstract}\n"
            )

        prompt = f"""Ești un cercetător academic de precizie. Răspunde la următoarea întrebare folosind EXCLUSIV informațiile din abstractele academice furnizate mai jos.
La fiecare afirmație factuală, include referințe exacte sub forma [1], [2] corespunzătoare lucrării citate.

Întrebare: {question}

Context din Abstracte:
{chr(10).join(context_blocks)}

Scrie un răspuns structurat, academic și concis în limba română."""

        url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key={gemini_key}"
        payload = {
            "contents": [{"parts": [{"text": prompt}]}],
            "generationConfig": {"temperature": 0.2, "maxOutputTokens": 1000}
        }

        async with httpx.AsyncClient(timeout=15.0) as client:
            res = await client.post(url, json=payload)
            if res.status_code == 200:
                data = res.json()
                text = data["candidates"][0]["content"]["parts"][0]["text"]
                return text
        raise RuntimeError("Gemini API error")

    def _generate_extractive_rag_answer(self, question: str, top_papers: List[Paper]) -> str:
        """
        Sinteză RAG extractivă bazată pe evidențe din frazele abstractelor.
        """
        def get_sentences(text: str) -> List[str]:
            return [s.strip() for s in re.split(r"(?<=[.!?])\s+", text) if len(s.strip()) > 20]

        q_words = set(re.findall(r"\w+", question.lower()))
        response_sections = [
            f"### Evidențe Extrase pentru: *\"{question}\"*\n",
            "Următoarele fragmente au fost identificate prin căutare semantică în abstractele lucrărilor analizate:\n"
        ]

        for i, p in enumerate(top_papers, 1):
            sentences = get_sentences(p.abstract)
            scored_sentences = []
            for s in sentences:
                s_words = set(re.findall(r"\w+", s.lower()))
                overlap = len(q_words.intersection(s_words))
                scored_sentences.append((overlap, s))

            scored_sentences.sort(key=lambda x: x[0], reverse=True)
            top_sentence = scored_sentences[0][1] if scored_sentences and scored_sentences[0][0] > 0 else (sentences[0] if sentences else p.abstract)

            first_author = p.authors[0] if p.authors else "Autor necunoscut"
            response_sections.append(
                f"* **[{i}] {p.title}** ({first_author} et al., {p.year})\n"
                f"  > \"{top_sentence}\"\n"
                f"  *(Scor relevanță: {int((p.semantic_score or 0.0) * 100)}% | [DOI: {p.doi or 'N/A'}]({p.doi_url or p.landing_url or '#'}))*\n"
            )

        response_sections.append(
            "\n> 💡 **Sfat:** Pentru răspunsuri generative sintetizate narativ de un LLM, adaugă o cheie Google Gemini în setări."
        )

        return "\n".join(response_sections)

# Singleton Instance
semantic_rag_engine = SemanticRAGEngine()
