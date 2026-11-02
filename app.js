/**
 * ScholarAgent — Frontend Client
 * Integrat cu FastAPI Semantic RAG Backend & Client-Side Fallback
 */

// Application State
const state = {
  currentQuery: '',
  papers: [],
  filteredPapers: [],
  activeFilter: 'all',
  currentSort: 'semantic', // 'semantic', 'citations', 'year_desc'
  selectedPaper: null,
  isSearching: false,
  backendOnline: false,
  settings: {
    backendUrl: localStorage.getItem('scholar_backend_url') || (window.location.port === '8000' ? '' : 'http://localhost:8000'),
    ezproxy: localStorage.getItem('scholar_ezproxy') || '',
    geminiKey: localStorage.getItem('scholar_gemini_key') || '',
    ieeeKey: localStorage.getItem('scholar_ieee_key') || '',
    elsevierKey: localStorage.getItem('scholar_elsevier_key') || '',
    email: localStorage.getItem('scholar_email') || 'academic.researcher@scholaragent.app'
  }
};

// Initialize Application
document.addEventListener('DOMContentLoaded', () => {
  if (window.lucide) window.lucide.createIcons();

  initSettingsUI();
  initEventListeners();
  checkBackendHealth();
});

/* ==========================================================================
   1. Backend Health & Connectivity
   ========================================================================== */
async function checkBackendHealth() {
  const badge = document.getElementById('backend-status-badge');
  const dot = document.getElementById('backend-status-dot');
  const text = document.getElementById('backend-status-text');

  badge.classList.remove('hidden');

  try {
    const base = state.settings.backendUrl.replace(/\/+$/, '');
    const res = await fetch(`${base}/api/health`, { method: 'GET' });
    if (res.ok) {
      const data = await res.json();
      state.backendOnline = true;
      dot.className = 'w-2 h-2 rounded-full bg-emerald-400 animate-pulse';
      text.textContent = data.dense_embeddings_loaded ? 'Backend: Dense Vector RAG' : 'Backend: Semantic TF-IDF';
      text.className = 'text-emerald-300 font-semibold';
      return;
    }
  } catch (err) {
    // Backend offline
  }

  state.backendOnline = false;
  dot.className = 'w-2 h-2 rounded-full bg-amber-400';
  text.textContent = 'Mod: Client Direct (Fără Backend)';
  text.className = 'text-amber-300';
}

/* ==========================================================================
   2. Event Listeners & UI Binding
   ========================================================================== */
function initEventListeners() {
  const searchForm = document.getElementById('search-form');
  const searchInput = document.getElementById('search-query');

  searchForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const query = searchInput.value.trim();
    if (query) executeSearch(query);
  });

  // Preset topic pills
  document.querySelectorAll('.preset-pill').forEach(btn => {
    btn.addEventListener('click', () => {
      const topic = btn.getAttribute('data-topic');
      searchInput.value = topic;
      executeSearch(topic);
    });
  });

  // Filter tabs
  document.getElementById('filter-all').addEventListener('click', () => setFilter('all'));
  document.getElementById('filter-oa').addEventListener('click', () => setFilter('oa'));
  document.getElementById('filter-paywalled').addEventListener('click', () => setFilter('paywalled'));

  // Sort dropdown
  document.getElementById('sort-select').addEventListener('change', (e) => {
    state.currentSort = e.target.value;
    applySortAndFilter();
  });

  // Toggle RAG QA Drawer
  document.getElementById('btn-toggle-qa').addEventListener('click', () => {
    const sec = document.getElementById('rag-qa-section');
    sec.classList.toggle('hidden');
  });

  // RAG QA Ask Form
  const ragForm = document.getElementById('rag-ask-form');
  ragForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const q = document.getElementById('rag-question-input').value.trim();
    if (q) executeRAGQuestion(q);
  });

  // Copy RAG Answer
  document.getElementById('btn-copy-rag-answer').addEventListener('click', () => {
    const text = document.getElementById('rag-answer-text').innerText;
    navigator.clipboard.writeText(text).then(() => {
      showToast('Răspunsul RAG a fost copiat în clipboard!');
    });
  });

  // Export BibTeX
  document.getElementById('btn-export-all-bib').addEventListener('click', exportAllBibTeX);

  // Modal events
  document.getElementById('btn-close-modal').addEventListener('click', closeModal);
  document.getElementById('btn-close-modal-bottom').addEventListener('click', closeModal);
  document.getElementById('paper-modal').addEventListener('click', (e) => {
    if (e.target.id === 'paper-modal') closeModal();
  });

  // Force Abstract re-fetch in modal
  document.getElementById('btn-force-abstract').addEventListener('click', () => {
    if (state.selectedPaper) {
      triggerAbstractRecovery(state.selectedPaper);
    }
  });

  // BibTeX Copy in modal
  document.getElementById('btn-copy-bibtex').addEventListener('click', () => {
    if (state.selectedPaper) {
      const bib = generateBibTeX(state.selectedPaper);
      navigator.clipboard.writeText(bib).then(() => {
        showToast('Citarea BibTeX a fost copiată!');
      });
    }
  });
}

/* ==========================================================================
   3. Settings UI
   ========================================================================== */
function initSettingsUI() {
  const modal = document.getElementById('settings-modal');
  const btnOpen = document.getElementById('btn-open-settings');
  const btnClose = document.getElementById('btn-close-settings');
  const btnSave = document.getElementById('btn-save-settings');

  const inputBackend = document.getElementById('setting-backend-url');
  const inputEzproxy = document.getElementById('setting-ezproxy');
  const inputGemini = document.getElementById('setting-gemini-key');
  const inputIeee = document.getElementById('setting-ieee-key');
  const inputElsevier = document.getElementById('setting-elsevier-key');

  inputBackend.value = state.settings.backendUrl;
  inputEzproxy.value = state.settings.ezproxy;
  inputGemini.value = state.settings.geminiKey;
  if (inputIeee) inputIeee.value = state.settings.ieeeKey;
  inputElsevier.value = state.settings.elsevierKey;

  btnOpen.addEventListener('click', () => modal.classList.remove('hidden'));
  btnClose.addEventListener('click', () => modal.classList.add('hidden'));
  modal.addEventListener('click', (e) => {
    if (e.target.id === 'settings-modal') modal.classList.add('hidden');
  });

  btnSave.addEventListener('click', () => {
    state.settings.backendUrl = inputBackend.value.trim();
    state.settings.ezproxy = inputEzproxy.value.trim();
    state.settings.geminiKey = inputGemini.value.trim();
    state.settings.ieeeKey = inputIeee ? inputIeee.value.trim() : '';
    state.settings.elsevierKey = inputElsevier.value.trim();

    localStorage.setItem('scholar_backend_url', state.settings.backendUrl);
    localStorage.setItem('scholar_ezproxy', state.settings.ezproxy);
    localStorage.setItem('scholar_gemini_key', state.settings.geminiKey);
    localStorage.setItem('scholar_ieee_key', state.settings.ieeeKey);
    localStorage.setItem('scholar_elsevier_key', state.settings.elsevierKey);

    modal.classList.add('hidden');
    checkBackendHealth();
    showToast('Setările au fost salvate cu succes!');
  });
}

/* ==========================================================================
   4. Search Pipeline (Backend Semantic RAG or Client-Side)
   ========================================================================== */
async function executeSearch(query) {
  state.currentQuery = query;
  state.isSearching = true;

  document.getElementById('empty-state').classList.add('hidden');
  document.getElementById('results-meta-bar').classList.add('hidden');
  document.getElementById('results-container').innerHTML = '';
  document.getElementById('loading-state').classList.remove('hidden');

  const enableSemantic = document.getElementById('chk-semantic-rerank').checked;

  try {
    // Încearcă căutare prin backend dacă este online
    if (state.backendOnline) {
      const base = state.settings.backendUrl.replace(/\/+$/, '');
      const res = await fetch(`${base}/api/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: query,
          limit: 30,
          enable_semantic_rerank: enableSemantic,
          gemini_key: state.settings.geminiKey || null,
          ieee_key: state.settings.ieeeKey || null,
          elsevier_key: state.settings.elsevierKey || null,
          email: state.settings.email
        })
      });

      if (!res.ok) throw new Error(`Backend error HTTP ${res.status}`);
      const data = await res.json();
      state.papers = data.papers.map(p => ({
        id: p.id,
        title: p.title,
        authors: p.authors,
        year: p.year,
        publicationDate: p.publication_date,
        citations: p.citations,
        isOpenAccess: p.is_open_access,
        oaStatus: p.oa_status,
        oaPdfUrl: p.oa_pdf_url,
        doi: p.doi,
        doiUrl: p.doi_url,
        landingUrl: p.landing_url,
        venue: p.venue,
        publisher: p.publisher,
        concepts: p.concepts,
        abstract: p.abstract,
        abstractSource: p.abstract_source,
        semanticScore: p.semantic_score
      }));
    } else {
      // Fallback: Client-Side Search Direct din browser
      state.papers = await clientSideSearch(query);
    }

    document.getElementById('loading-state').classList.add('hidden');
    document.getElementById('results-meta-bar').classList.remove('hidden');
    document.getElementById('rag-qa-section').classList.remove('hidden');
    document.getElementById('btn-export-all-bib').classList.remove('hidden');

    applySortAndFilter();

  } catch (err) {
    console.error('Search failed:', err);
    // Dacă backend-ul a eșuat la runtime, încearcă fallback client-side
    try {
      state.papers = await clientSideSearch(query);
      document.getElementById('loading-state').classList.add('hidden');
      document.getElementById('results-meta-bar').classList.remove('hidden');
      document.getElementById('rag-qa-section').classList.remove('hidden');
      applySortAndFilter();
    } catch (fallbackErr) {
      document.getElementById('loading-state').classList.add('hidden');
      document.getElementById('results-container').innerHTML = `
        <div class="p-6 rounded-xl bg-red-950/30 border border-red-800 text-red-300 text-center space-y-2">
          <i data-lucide="alert-triangle" class="w-8 h-8 text-red-400 mx-auto"></i>
          <h4 class="font-bold">Eroare la căutarea literaturii</h4>
          <p class="text-xs text-red-400">${err.message}</p>
        </div>
      `;
      if (window.lucide) window.lucide.createIcons();
    }
  } finally {
    state.isSearching = false;
  }
}

/**
 * Căutare client-side de rezervă dacă backend-ul nu este pornit
 */
async function clientSideSearch(query) {
  const url = `https://api.openalex.org/works?search=${encodeURIComponent(query)}&per_page=25&mailto=${encodeURIComponent(state.settings.email)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('Eroare OpenAlex API.');
  const data = await res.json();
  return (data.results || []).map(w => {
    const rawDoi = w.doi ? w.doi.replace(/^https?:\/\/doi\.org\//i, '') : null;
    const authors = (w.authorships || []).map(a => a.author?.display_name).filter(Boolean);
    const concepts = (w.concepts || []).slice(0, 5).map(c => c.display_name);
    const isOa = Boolean(w.open_access?.is_oa);

    // Reconstruct abstract
    let abs = 'Abstractul nu este disponibil în indexul inițial.';
    if (w.abstract_inverted_index) {
      const words = [];
      for (const [word, pos] of Object.entries(w.abstract_inverted_index)) {
        for (const p of pos) words[p] = word;
      }
      abs = words.join(' ').trim();
    }

    return {
      id: w.id,
      title: w.title || 'Untitled',
      authors: authors.length ? authors : ['Unknown Author'],
      year: w.publication_year || 'N/A',
      publicationDate: w.publication_date,
      citations: w.cited_by_count || 0,
      isOpenAccess: isOa,
      oaStatus: w.open_access?.oa_status || (isOa ? 'open' : 'closed'),
      oaPdfUrl: w.open_access?.oa_url || w.primary_location?.pdf_url || null,
      doi: rawDoi,
      doiUrl: rawDoi ? `https://doi.org/${rawDoi}` : null,
      landingUrl: w.primary_location?.landing_page_url || (rawDoi ? `https://doi.org/${rawDoi}` : null),
      venue: w.primary_location?.source?.display_name || 'Academic Venue',
      publisher: w.primary_location?.source?.publisher || 'Publisher',
      concepts: concepts,
      abstract: abs,
      abstractSource: 'OpenAlex',
      semanticScore: null
    };
  });
}

/* ==========================================================================
   5. RAG Question Answering on Abstracts
   ========================================================================== */
async function executeRAGQuestion(question) {
  const btn = document.getElementById('btn-rag-ask');
  const container = document.getElementById('rag-answer-container');
  const answerEl = document.getElementById('rag-answer-text');

  btn.disabled = true;
  btn.classList.add('opacity-50');
  container.classList.remove('hidden');
  answerEl.innerHTML = `
    <div class="flex items-center gap-2 text-slate-400 py-3">
      <div class="w-4 h-4 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
      <span>RAG Semantic Retriever analizează abstractele pentru a genera răspunsul...</span>
    </div>
  `;

  try {
    // 1. Încearcă prin Backend RAG Endpoint dacă e activ
    if (state.backendOnline) {
      const base = state.settings.backendUrl.replace(/\/+$/, '');
      const res = await fetch(`${base}/api/rag/ask`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: question,
          papers: state.papers.map(p => ({
            id: p.id,
            title: p.title,
            authors: p.authors,
            year: p.year,
            publication_date: p.publicationDate,
            citations: p.citations,
            is_open_access: p.isOpenAccess,
            oa_status: p.oaStatus,
            oa_pdf_url: p.oaPdfUrl,
            doi: p.doi,
            doi_url: p.doiUrl,
            landing_url: p.landingUrl,
            venue: p.venue,
            publisher: p.publisher,
            concepts: p.concepts,
            abstract: p.abstract,
            abstract_source: p.abstractSource,
            semantic_score: p.semanticScore
          })),
          top_k: 5,
          gemini_key: state.settings.geminiKey || null
        })
      });

      if (!res.ok) throw new Error(`RAG API error: ${res.status}`);
      const ragData = await res.json();
      renderRAGAnswer(ragData.answer);
      return;
    }

    // 2. Client-side local RAG Fallback
    const localAnswer = generateLocalRAGAnswer(question, state.papers);
    renderRAGAnswer(localAnswer);

  } catch (err) {
    console.warn('RAG processing failed:', err);
    const localAnswer = generateLocalRAGAnswer(question, state.papers);
    renderRAGAnswer(localAnswer);
  } finally {
    btn.disabled = false;
    btn.classList.remove('opacity-50');
  }
}

function renderRAGAnswer(rawMarkdown) {
  const answerEl = document.getElementById('rag-answer-text');
  let parsed = window.marked ? window.marked.parse(rawMarkdown) : `<pre>${rawMarkdown}</pre>`;

  // Înlocuiește referințele [1], [2] cu butoane interactive de evidențiere a articolului
  parsed = parsed.replace(/\[(\d+)\]/g, (match, num) => {
    return `<span class="citation-chip" onclick="highlightPaperByRank(${num})">[${num}]</span>`;
  });

  answerEl.innerHTML = parsed;
}

function highlightPaperByRank(rank) {
  const index = rank - 1;
  const paper = state.filteredPapers[index];
  if (paper) {
    openPaperModal(paper.id);
  }
}

function generateLocalRAGAnswer(question, papers) {
  const valid = papers.filter(p => p.abstract && p.abstract.length > 50).slice(0, 5);
  let text = `### Răspuns Extractiv RAG pentru: *"${question}"*\n\n`;
  valid.forEach((p, i) => {
    text += `* **[${i+1}] ${p.title}** (${p.authors[0] || 'Autor'}, ${p.year})\n`;
    text += `  > "${p.abstract.slice(0, 220)}..."\n`;
    text += `  *(Acces: ${p.isOpenAccess ? 'Open Access' : 'Paywalled'} | [DOI: ${p.doi || 'N/A'}](${p.doiUrl || '#'}))*\n\n`;
  });
  return text;
}

/* ==========================================================================
   6. Filtering, Sorting & Card Rendering
   ========================================================================== */
function setFilter(filterType) {
  state.activeFilter = filterType;
  document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
  if (filterType === 'all') document.getElementById('filter-all').classList.add('active');
  if (filterType === 'oa') document.getElementById('filter-oa').classList.add('active');
  if (filterType === 'paywalled') document.getElementById('filter-paywalled').classList.add('active');
  applySortAndFilter();
}

function applySortAndFilter() {
  let list = [...state.papers];

  if (state.activeFilter === 'oa') list = list.filter(p => p.isOpenAccess);
  if (state.activeFilter === 'paywalled') list = list.filter(p => !p.isOpenAccess);

  if (state.currentSort === 'semantic') {
    list.sort((a, b) => (b.semanticScore || 0) - (a.semanticScore || 0));
  } else if (state.currentSort === 'citations') {
    list.sort((a, b) => b.citations - a.citations);
  } else if (state.currentSort === 'year_desc') {
    list.sort((a, b) => parseInt(b.year, 10) - parseInt(a.year, 10));
  }

  state.filteredPapers = list;
  renderPaperCards();
}

function renderPaperCards() {
  const container = document.getElementById('results-container');
  const countBadge = document.getElementById('results-count-badge');
  countBadge.textContent = `${state.filteredPapers.length} lucrări afișate (din ${state.papers.length} identificate)`;

  if (!state.filteredPapers.length) {
    container.innerHTML = `
      <div class="text-center py-12 px-4 rounded-xl bg-surface-900 border border-slate-800 text-slate-400">
        <i data-lucide="search-x" class="w-8 h-8 text-slate-500 mx-auto mb-2"></i>
        <p class="font-medium text-slate-300">Nu a fost găsit niciun articol cu acest filtru.</p>
      </div>
    `;
    if (window.lucide) window.lucide.createIcons();
    return;
  }

  container.innerHTML = state.filteredPapers.map((paper, idx) => {
    const oaBadge = paper.isOpenAccess
      ? `<span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"><i data-lucide="unlock" class="w-3 h-3"></i> Open Access</span>`
      : `<span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20"><i data-lucide="lock" class="w-3 h-3"></i> Paywalled</span>`;

    const semanticScoreBadge = paper.semanticScore !== null && paper.semanticScore !== undefined
      ? `<span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-brand-500/10 text-brand-400 border border-brand-500/30 font-mono">
           <i data-lucide="sparkles" class="w-3 h-3 text-brand-400"></i> ${Math.round(paper.semanticScore * 100)}% Relevanță Semantică
         </span>`
      : '';

    const conceptsHtml = (paper.concepts || []).slice(0, 3).map(c => 
      `<span class="px-2 py-0.5 rounded bg-surface-950 text-slate-400 border border-slate-800 text-[11px]">${escapeHtml(c)}</span>`
    ).join('');

    const formattedAuthors = paper.authors.slice(0, 3).join(', ') + (paper.authors.length > 3 ? ' et al.' : '');

    return `
      <article id="paper-card-${paper.id}" class="paper-card bg-surface-900 rounded-xl border border-slate-800 p-5 space-y-3 cursor-pointer" onclick="openPaperModal('${paper.id}')">
        <div class="flex items-start justify-between gap-4">
          <div class="space-y-1">
            <div class="flex items-center gap-2 flex-wrap">
              <span class="text-xs font-bold text-slate-500">#${idx+1}</span>
              ${oaBadge}
              ${semanticScoreBadge}
              <span class="text-xs px-2 py-0.5 rounded bg-surface-950 text-slate-400 border border-slate-800">${paper.year}</span>
              <span class="text-xs px-2 py-0.5 rounded bg-surface-950 text-brand-400 border border-slate-800 flex items-center gap-1">
                <i data-lucide="quote" class="w-2.5 h-2.5"></i> ${paper.citations.toLocaleString()} citări
              </span>
            </div>
            <h3 class="text-base font-bold text-white hover:text-brand-400 transition leading-snug pt-1">
              ${escapeHtml(paper.title)}
            </h3>
            <p class="text-xs text-slate-400 line-clamp-1">
              ${escapeHtml(formattedAuthors)} &bull; <span class="text-slate-300 font-medium">${escapeHtml(paper.venue)}</span>
            </p>
          </div>
        </div>

        <p class="text-xs text-slate-400 line-clamp-2 leading-relaxed">
          ${escapeHtml(paper.abstract)}
        </p>

        <div class="flex items-center justify-between gap-2 pt-1 border-t border-slate-800/60 text-xs">
          <div class="flex items-center gap-1.5 flex-wrap">
            ${conceptsHtml}
          </div>
          
          <div class="flex items-center gap-2">
            ${paper.isOpenAccess && paper.oaPdfUrl ? `
              <a href="${paper.oaPdfUrl}" target="_blank" rel="noopener noreferrer" onclick="event.stopPropagation()" class="px-2.5 py-1 rounded bg-emerald-600/20 hover:bg-emerald-600 text-emerald-300 hover:text-white transition text-xs font-medium flex items-center gap-1 border border-emerald-500/30">
                <i data-lucide="file-text" class="w-3 h-3"></i> PDF
              </a>
            ` : ''}
            <button class="text-xs text-slate-400 hover:text-brand-400 flex items-center gap-1 font-medium transition">
              <span>Inspectează</span>
              <i data-lucide="chevron-right" class="w-3.5 h-3.5"></i>
            </button>
          </div>
        </div>
      </article>
    `;
  }).join('');

  if (window.lucide) window.lucide.createIcons();
}

/* ==========================================================================
   7. Paper Inspection Modal & Abstract Recovery
   ========================================================================== */
function openPaperModal(paperId) {
  const paper = state.papers.find(p => p.id === paperId);
  if (!paper) return;

  state.selectedPaper = paper;
  const modal = document.getElementById('paper-modal');

  document.getElementById('modal-title').textContent = paper.title;
  document.getElementById('modal-authors').textContent = paper.authors.join(', ');
  document.getElementById('modal-year-badge').textContent = `An: ${paper.year}`;
  document.getElementById('modal-citations-badge').textContent = `${paper.citations.toLocaleString()} Citări`;
  document.getElementById('modal-venue').textContent = paper.venue || 'Nespecificat';
  document.getElementById('modal-publisher').textContent = paper.publisher || 'Nespecificat';
  document.getElementById('modal-doi').textContent = paper.doi || 'Fără DOI';
  document.getElementById('modal-abstract').textContent = paper.abstract;

  // Semantic Score badge
  const semBadge = document.getElementById('modal-semantic-badge');
  if (paper.semanticScore !== null && paper.semanticScore !== undefined) {
    semBadge.textContent = `Relevanță RAG: ${Math.round(paper.semanticScore * 100)}%`;
    semBadge.classList.remove('hidden');
  } else {
    semBadge.classList.add('hidden');
  }

  // Abstract Source tag
  const sourceEl = document.getElementById('modal-abstract-source');
  sourceEl.textContent = `Sursă: ${paper.abstractSource || 'Index'}`;

  // Concepts
  const conceptsContainer = document.getElementById('modal-concepts');
  conceptsContainer.innerHTML = (paper.concepts || []).map(c => 
    `<span class="px-2.5 py-1 rounded-md bg-surface-950 text-slate-300 border border-slate-800 text-xs font-medium">${escapeHtml(c)}</span>`
  ).join('') || '<span class="text-xs text-slate-500">Nespecificate</span>';

  // Badges
  document.getElementById('modal-oa-badge').innerHTML = paper.isOpenAccess
    ? `<span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"><i data-lucide="unlock" class="w-3 h-3"></i> Open Access (${paper.oaStatus})</span>`
    : `<span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20"><i data-lucide="lock" class="w-3 h-3"></i> Paywalled</span>`;

  // Buttons
  const btnDownloadPdf = document.getElementById('modal-btn-download-pdf');
  const btnProxy = document.getElementById('modal-btn-proxy');
  const btnPublisher = document.getElementById('modal-btn-publisher');

  if (paper.isOpenAccess && paper.oaPdfUrl) {
    btnDownloadPdf.href = paper.oaPdfUrl;
    btnDownloadPdf.classList.remove('hidden');
  } else {
    btnDownloadPdf.classList.add('hidden');
  }

  if (paper.landingUrl) {
    btnPublisher.href = paper.landingUrl;
    btnPublisher.classList.remove('hidden');
  } else {
    btnPublisher.classList.add('hidden');
  }

  if (state.settings.ezproxy && paper.landingUrl) {
    btnProxy.href = `${state.settings.ezproxy}${encodeURIComponent(paper.landingUrl)}`;
    btnProxy.classList.remove('hidden');
  } else {
    btnProxy.classList.add('hidden');
  }

  document.getElementById('modal-bibtex').textContent = generateBibTeX(paper);

  modal.classList.remove('hidden');
  if (window.lucide) window.lucide.createIcons();
}

function closeModal() {
  document.getElementById('paper-modal').classList.add('hidden');
  state.selectedPaper = null;
}

async function triggerAbstractRecovery(paper) {
  if (!paper.doi) {
    showToast('Această intrare nu are un DOI pentru interogare.');
    return;
  }

  const sourceEl = document.getElementById('modal-abstract-source');
  const abstractEl = document.getElementById('modal-abstract');
  sourceEl.innerHTML = '<span class="animate-pulse">Recuperare prin API-uri...</span>';

  try {
    if (state.backendOnline) {
      const base = state.settings.backendUrl.replace(/\/+$/, '');
      const res = await fetch(`${base}/api/abstract/recover`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          doi: paper.doi,
          email: state.settings.email,
          ieee_key: state.settings.ieeeKey || null,
          elsevier_key: state.settings.elsevierKey || null
        })
      });
      if (res.ok) {
        const data = await res.json();
        if (data.recovered && data.abstract) {
          paper.abstract = data.abstract;
          paper.abstractSource = data.source;
          abstractEl.textContent = data.abstract;
          sourceEl.textContent = `Sursă: ${data.source}`;
          showToast(`Abstract recuperat cu succes din ${data.source}!`);
          return;
        }
      }
    }

    // Direct Europe PMC fallback in browser
    const epmcQuery = encodeURIComponent(`DOI:"${paper.doi}"`);
    const epmcRes = await fetch(`https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=${epmcQuery}&format=json&resultType=core`);
    if (epmcRes.ok) {
      const epmcData = await epmcRes.json();
      const res = epmcData.resultList?.result?.[0];
      if (res && res.abstractText) {
        const cleaned = res.abstractText.replace(/<[^>]*>/g, '').trim();
        paper.abstract = cleaned;
        paper.abstractSource = 'Europe PMC (Public)';
        abstractEl.textContent = cleaned;
        sourceEl.textContent = 'Sursă: Europe PMC (Public)';
        showToast('Abstract recuperat din Europe PMC!');
        return;
      }
    }

    showToast('Nu s-a putut recupera abstractul din API-urile libere.');
    sourceEl.textContent = 'Sursă: Nerecuperat';
  } catch (err) {
    showToast('Eroare de comunicare la recuperarea abstractului.');
  }
}

/* ==========================================================================
   8. BibTeX Generator & Helpers
   ========================================================================== */
function generateBibTeX(p) {
  const firstAuthor = p.authors[0] ? p.authors[0].split(' ').pop().toLowerCase().replace(/[^a-z0-9]/gi, '') : 'author';
  const cleanYear = p.year !== 'N/A' ? p.year : '2024';
  const citeKey = `${firstAuthor}${cleanYear}${p.title.slice(0, 10).toLowerCase().replace(/[^a-z0-9]/gi, '')}`;

  return `@article{${citeKey},
  title = {${p.title.replace(/[{}]/g, '')}},
  author = {${p.authors.join(' and ')}},
  year = {${cleanYear}},
  journal = {${p.venue || p.publisher || 'Scholarly Publication'}},
  ${p.doi ? `doi = {${p.doi}},` : ''}
  ${p.landingUrl ? `url = {${p.landingUrl}},` : ''}
  publisher = {${p.publisher || 'Unknown'}}
}`;
}

function exportAllBibTeX() {
  if (!state.papers.length) return;
  const allBib = state.papers.map(generateBibTeX).join('\n\n');
  const blob = new Blob([allBib], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `scholar_rag_${state.currentQuery.slice(0, 15).replace(/[^a-z0-9]/gi, '_')}.bib`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast(`Au fost exportate ${state.papers.length} citări BibTeX!`);
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function showToast(message) {
  const existing = document.getElementById('scholar-toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.id = 'scholar-toast';
  toast.className = 'fixed bottom-5 right-5 z-50 px-4 py-3 rounded-xl bg-slate-900 border border-brand-500/50 text-white text-xs shadow-2xl flex items-center gap-2 animate-fade-in';
  toast.innerHTML = `<i data-lucide="info" class="w-4 h-4 text-brand-400"></i><span>${escapeHtml(message)}</span>`;
  document.body.appendChild(toast);
  if (window.lucide) window.lucide.createIcons();

  setTimeout(() => toast.remove(), 3500);
}
