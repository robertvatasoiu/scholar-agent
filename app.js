/**
 * ScholarAgent — Academic Research & Literature Explorer
 * Core Application & Agent Logic
 */

// Application State
const state = {
  currentQuery: '',
  papers: [],
  filteredPapers: [],
  activeFilter: 'all', // 'all', 'oa', 'paywalled'
  currentSort: 'relevance',
  selectedPaper: null,
  isSearching: false,
  isSynthesizing: false,
  settings: {
    ezproxy: localStorage.getItem('scholar_ezproxy') || '',
    geminiKey: localStorage.getItem('scholar_gemini_key') || '',
    s2Key: localStorage.getItem('scholar_s2_key') || '',
    elsevierKey: localStorage.getItem('scholar_elsevier_key') || '',
    springerKey: localStorage.getItem('scholar_springer_key') || '',
    email: localStorage.getItem('scholar_email') || 'academic.researcher@scholaragent.app'
  }
};

// Initialize Application
document.addEventListener('DOMContentLoaded', () => {
  // Lucide Icons init
  if (window.lucide) {
    window.lucide.createIcons();
  }

  initSettingsUI();
  initEventListeners();
});

/* ==========================================================================
   1. Event Listeners & UI Binding
   ========================================================================== */
function initEventListeners() {
  const searchForm = document.getElementById('search-form');
  const searchInput = document.getElementById('search-query');

  searchForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const query = searchInput.value.trim();
    if (query) {
      executeResearchAgent(query);
    }
  });

  // Preset topic pills
  document.querySelectorAll('.preset-pill').forEach(btn => {
    btn.addEventListener('click', () => {
      const topic = btn.getAttribute('data-topic');
      searchInput.value = topic;
      executeResearchAgent(topic);
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

  // Toggle Synthesis Section
  document.getElementById('btn-toggle-synthesis').addEventListener('click', () => {
    const section = document.getElementById('ai-synthesis-section');
    section.classList.toggle('hidden');
  });

  // Copy Synthesis
  document.getElementById('btn-copy-synthesis').addEventListener('click', copySynthesisText);

  // Export All BibTeX
  document.getElementById('btn-export-all-bib').addEventListener('click', exportAllBibTeX);

  // Modal events
  document.getElementById('btn-close-modal').addEventListener('click', closeModal);
  document.getElementById('btn-close-modal-bottom').addEventListener('click', closeModal);
  document.getElementById('paper-modal').addEventListener('click', (e) => {
    if (e.target.id === 'paper-modal') closeModal();
  });

  // Force Abstract re-fetch in modal
  const btnForceAbstract = document.getElementById('btn-force-abstract');
  if (btnForceAbstract) {
    btnForceAbstract.addEventListener('click', () => {
      if (state.selectedPaper) {
        fetchAbstractWaterfall(state.selectedPaper, true);
      }
    });
  }

  // BibTeX Copy in modal
  document.getElementById('btn-copy-bibtex').addEventListener('click', () => {
    if (state.selectedPaper) {
      const bib = generateBibTeX(state.selectedPaper);
      navigator.clipboard.writeText(bib).then(() => {
        showToast('Citarea BibTeX a fost copiată în clipboard!');
      });
    }
  });
}

/* ==========================================================================
   2. Settings & Modal Management
   ========================================================================== */
function initSettingsUI() {
  const settingsModal = document.getElementById('settings-modal');
  const btnOpen = document.getElementById('btn-open-settings');
  const btnClose = document.getElementById('btn-close-settings');
  const btnSave = document.getElementById('btn-save-settings');

  const inputEzproxy = document.getElementById('setting-ezproxy');
  const inputGemini = document.getElementById('setting-gemini-key');
  const inputS2 = document.getElementById('setting-s2-key');
  const inputElsevier = document.getElementById('setting-elsevier-key');
  const inputSpringer = document.getElementById('setting-springer-key');
  const inputEmail = document.getElementById('setting-polite-email');

  // Populate existing
  inputEzproxy.value = state.settings.ezproxy;
  inputGemini.value = state.settings.geminiKey;
  inputS2.value = state.settings.s2Key;
  if (inputElsevier) inputElsevier.value = state.settings.elsevierKey;
  if (inputSpringer) inputSpringer.value = state.settings.springerKey;
  inputEmail.value = state.settings.email;

  btnOpen.addEventListener('click', () => {
    settingsModal.classList.remove('hidden');
  });

  btnClose.addEventListener('click', () => {
    settingsModal.classList.add('hidden');
  });

  settingsModal.addEventListener('click', (e) => {
    if (e.target.id === 'settings-modal') settingsModal.classList.add('hidden');
  });

  btnSave.addEventListener('click', () => {
    state.settings.ezproxy = inputEzproxy.value.trim();
    state.settings.geminiKey = inputGemini.value.trim();
    state.settings.s2Key = inputS2.value.trim();
    state.settings.elsevierKey = inputElsevier ? inputElsevier.value.trim() : '';
    state.settings.springerKey = inputSpringer ? inputSpringer.value.trim() : '';
    state.settings.email = inputEmail.value.trim() || 'academic.researcher@scholaragent.app';

    localStorage.setItem('scholar_ezproxy', state.settings.ezproxy);
    localStorage.setItem('scholar_gemini_key', state.settings.geminiKey);
    localStorage.setItem('scholar_s2_key', state.settings.s2Key);
    localStorage.setItem('scholar_elsevier_key', state.settings.elsevierKey);
    localStorage.setItem('scholar_springer_key', state.settings.springerKey);
    localStorage.setItem('scholar_email', state.settings.email);
    localStorage.setItem('scholar_email', state.settings.email);

    settingsModal.classList.add('hidden');
    showToast('Configurația a fost salvată cu succes!');
  });
}

/* ==========================================================================
   3. Multi-Source Search & Aggregation Pipeline
   ========================================================================== */
async function executeResearchAgent(query) {
  state.currentQuery = query;
  state.isSearching = true;

  // Update UI States
  document.getElementById('empty-state').classList.add('hidden');
  document.getElementById('results-meta-bar').classList.add('hidden');
  document.getElementById('results-container').innerHTML = '';
  document.getElementById('loading-state').classList.remove('hidden');

  const shouldSynthesize = document.getElementById('chk-agent-synthesis').checked;
  const synthesisSection = document.getElementById('ai-synthesis-section');
  
  if (shouldSynthesize) {
    synthesisSection.classList.remove('hidden');
    document.getElementById('ai-synthesis-content').innerHTML = `
      <div class="flex items-center gap-3 text-slate-400 py-6 justify-center">
        <div class="w-5 h-5 border-2 border-brand-500 border-t-transparent rounded-full animate-spin"></div>
        <span>Agentul analizează literatura și formulează sinteza...</span>
      </div>
    `;
  } else {
    synthesisSection.classList.add('hidden');
  }

  try {
    // 1. Fetch from OpenAlex (Primary Global Academic Catalog with 250M+ works)
    const openAlexWorks = await searchOpenAlex(query);

    // 2. Normalize and enrich papers
    state.papers = openAlexWorks.map(normalizeOpenAlexWork);

    // 3. Fallback: If OpenAlex returns few results, query Crossref as complement
    if (state.papers.length < 5) {
      try {
        const crossrefWorks = await searchCrossref(query);
        const normalizedCrossref = crossrefWorks.map(normalizeCrossrefWork);
        // Merge and deduplicate by DOI or title
        mergePapers(normalizedCrossref);
      } catch (err) {
        console.warn('Crossref fallback failed:', err);
      }
    }

    // 4. Update UI
    document.getElementById('loading-state').classList.add('hidden');
    document.getElementById('results-meta-bar').classList.remove('hidden');
    document.getElementById('btn-export-all-bib').classList.remove('hidden');

    applySortAndFilter();

    // 5. Run AI / Algorithmic Synthesis
    if (shouldSynthesize && state.papers.length > 0) {
      runSynthesis(query, state.papers);
    }

  } catch (error) {
    console.error('Search failed:', error);
    document.getElementById('loading-state').classList.add('hidden');
    document.getElementById('results-container').innerHTML = `
      <div class="p-6 rounded-xl bg-red-950/30 border border-red-800 text-red-300 text-center space-y-2">
        <i data-lucide="alert-triangle" class="w-8 h-8 text-red-400 mx-auto"></i>
        <h4 class="font-bold">Eroare la căutarea literaturii</h4>
        <p class="text-xs text-red-400">${error.message || 'Verifică conexiunea la internet sau încearcă alt termen de căutare.'}</p>
      </div>
    `;
    if (window.lucide) window.lucide.createIcons();
  } finally {
    state.isSearching = false;
  }
}

/**
 * Interoghează OpenAlex REST API
 */
async function searchOpenAlex(query, limit = 30) {
  const politeEmail = encodeURIComponent(state.settings.email);
  const cleanQuery = encodeURIComponent(query);
  const url = `https://api.openalex.org/works?search=${cleanQuery}&per_page=${limit}&mailto=${politeEmail}`;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`OpenAlex API error: HTTP ${response.status}`);
  }

  const data = await response.json();
  return data.results || [];
}

/**
 * Interoghează Crossref REST API ca sursă de rezervă
 */
async function searchCrossref(query, limit = 15) {
  const cleanQuery = encodeURIComponent(query);
  const politeEmail = encodeURIComponent(state.settings.email);
  const url = `https://api.crossref.org/works?query=${cleanQuery}&rows=${limit}&mailto=${politeEmail}`;

  const response = await fetch(url);
  if (!response.ok) return [];

  const data = await response.json();
  return data.message?.items || [];
}

/**
 * Reconstruiește textul complet din inverted index OpenAlex
 */
function reconstructAbstract(invertedIndex) {
  if (!invertedIndex || Object.keys(invertedIndex).length === 0) {
    return 'Abstractul nu este disponibil public în indexul text-mining pentru această intrare. Consultă pagina publisherului sau DOI-ul oficial.';
  }
  const words = [];
  for (const [word, positions] of Object.entries(invertedIndex)) {
    for (const pos of positions) {
      words[pos] = word;
    }
  }
  return words.join(' ').replace(/\s+/g, ' ').trim();
}

/**
 * Normalizează o intrare OpenAlex într-un obiect uniform ScholarAgent
 */
function normalizeOpenAlexWork(w) {
  const isOpenAccess = Boolean(w.open_access?.is_oa);
  const oaUrl = w.open_access?.oa_url || w.primary_location?.pdf_url || null;
  const rawDoi = w.doi ? w.doi.replace(/^https?:\/\/doi\.org\//i, '') : null;
  const landingUrl = w.primary_location?.landing_page_url || (rawDoi ? `https://doi.org/${rawDoi}` : null);
  
  const authors = (w.authorships || []).map(a => a.author?.display_name).filter(Boolean);
  const concepts = (w.concepts || [])
    .sort((a, b) => (b.score || 0) - (a.score || 0))
    .slice(0, 5)
    .map(c => c.display_name);

  const venue = w.primary_location?.source?.display_name || w.host_venue?.display_name || 'Academic Venue';
  const publisher = w.primary_location?.source?.publisher || w.primary_location?.source?.host_organization_name || 'Publisher';

  return {
    id: w.id,
    title: w.title || 'Untitled Academic Paper',
    authors: authors.length > 0 ? authors : ['Unknown Author(s)'],
    year: w.publication_year || 'N/A',
    publicationDate: w.publication_date || '',
    citations: w.cited_by_count || 0,
    isOpenAccess: isOpenAccess,
    oaStatus: w.open_access?.oa_status || (isOpenAccess ? 'open' : 'closed'),
    oaPdfUrl: oaUrl,
    doi: rawDoi,
    doiUrl: rawDoi ? `https://doi.org/${rawDoi}` : null,
    landingUrl: landingUrl,
    venue: venue,
    publisher: publisher,
    concepts: concepts,
    abstract: reconstructAbstract(w.abstract_inverted_index),
    source: 'OpenAlex'
  };
}

/**
 * Normalizează o intrare Crossref
 */
function normalizeCrossrefWork(item) {
  const title = (item.title && item.title[0]) || 'Untitled';
  const authors = (item.author || []).map(a => `${a.given || ''} ${a.family || ''}`.trim()).filter(Boolean);
  const year = item.published?.['date-parts']?.[0]?.[0] || 'N/A';
  const rawDoi = item.DOI || null;
  const publisher = item.publisher || 'Unknown Publisher';
  const venue = (item['container-title'] && item['container-title'][0]) || publisher;

  return {
    id: `crossref:${rawDoi || Math.random().toString(36).substr(2, 9)}`,
    title: title,
    authors: authors.length > 0 ? authors : ['Unknown Author(s)'],
    year: year,
    publicationDate: String(year),
    citations: item['is-referenced-by-count'] || 0,
    isOpenAccess: false, // Default unless verified via Unpaywall
    oaStatus: 'closed',
    oaPdfUrl: null,
    doi: rawDoi,
    doiUrl: rawDoi ? `https://doi.org/${rawDoi}` : null,
    landingUrl: rawDoi ? `https://doi.org/${rawDoi}` : item.URL,
    venue: venue,
    publisher: publisher,
    concepts: ['Scholarly Literature'],
    abstract: item.abstract ? item.abstract.replace(/<[^>]*>/g, '') : 'Abstract nedisponibil în indexul Crossref.',
    source: 'Crossref'
  };
}

function mergePapers(newPapers) {
  const existingDois = new Set(state.papers.map(p => p.doi).filter(Boolean));
  const existingTitles = new Set(state.papers.map(p => p.title.toLowerCase().trim()));

  for (const p of newPapers) {
    if (p.doi && existingDois.has(p.doi)) continue;
    if (existingTitles.has(p.title.toLowerCase().trim())) continue;
    state.papers.push(p);
  }
}

/* ==========================================================================
   4. Filtering, Sorting & Rendering
   ========================================================================== */
function setFilter(filterType) {
  state.activeFilter = filterType;

  document.querySelectorAll('.filter-btn').forEach(btn => btn.classList.remove('active'));
  if (filterType === 'all') document.getElementById('filter-all').classList.add('active');
  if (filterType === 'oa') document.getElementById('filter-oa').classList.add('active');
  if (filterType === 'paywalled') document.getElementById('filter-paywalled').classList.add('active');

  applySortAndFilter();
}

function applySortAndFilter() {
  let list = [...state.papers];

  // Apply Filter
  if (state.activeFilter === 'oa') {
    list = list.filter(p => p.isOpenAccess);
  } else if (state.activeFilter === 'paywalled') {
    list = list.filter(p => !p.isOpenAccess);
  }

  // Apply Sort
  if (state.currentSort === 'citations') {
    list.sort((a, b) => b.citations - a.citations);
  } else if (state.currentSort === 'year_desc') {
    list.sort((a, b) => {
      const yA = typeof a.year === 'number' ? a.year : parseInt(a.year, 10) || 0;
      const yB = typeof b.year === 'number' ? b.year : parseInt(b.year, 10) || 0;
      return yB - yA;
    });
  }

  state.filteredPapers = list;
  renderPaperCards();
}

function renderPaperCards() {
  const container = document.getElementById('results-container');
  const countBadge = document.getElementById('results-count-badge');
  countBadge.textContent = `${state.filteredPapers.length} lucrări afișate (din ${state.papers.length} găsite)`;

  if (state.filteredPapers.length === 0) {
    container.innerHTML = `
      <div class="text-center py-12 px-4 rounded-xl bg-surface-900 border border-slate-800 text-slate-400">
        <i data-lucide="search-x" class="w-8 h-8 text-slate-500 mx-auto mb-2"></i>
        <p class="font-medium text-slate-300">Nu a fost găsit niciun articol cu filtrul selectat.</p>
        <p class="text-xs text-slate-500 mt-1">Încearcă să schimbi filtrul pe 'Toate' sau să introduci alți termeni.</p>
      </div>
    `;
    if (window.lucide) window.lucide.createIcons();
    return;
  }

  container.innerHTML = state.filteredPapers.map((paper, index) => {
    const oaBadge = paper.isOpenAccess
      ? `<span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
           <i data-lucide="unlock" class="w-3 h-3"></i> Open Access (${paper.oaStatus || 'Free'})
         </span>`
      : `<span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">
           <i data-lucide="lock" class="w-3 h-3"></i> Paywalled / Abonament
         </span>`;

    const conceptsHtml = (paper.concepts || []).slice(0, 3).map(c => 
      `<span class="px-2 py-0.5 rounded bg-surface-950 text-slate-400 border border-slate-800 text-[11px]">${escapeHtml(c)}</span>`
    ).join('');

    const formattedAuthors = paper.authors.slice(0, 3).join(', ') + (paper.authors.length > 3 ? ' et al.' : '');

    return `
      <article class="paper-card bg-surface-900 rounded-xl border border-slate-800 p-5 space-y-3 cursor-pointer" onclick="openPaperModal('${paper.id}')">
        <div class="flex items-start justify-between gap-4">
          <div class="space-y-1">
            <div class="flex items-center gap-2 flex-wrap">
              ${oaBadge}
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
              <span>Detalii & Citare</span>
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
   5. Deep Paper Inspection & Unpaywall Live Verification
   ========================================================================= */
async function openPaperModal(paperId) {
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
  document.getElementById('modal-doi').textContent = paper.doi ? paper.doi : 'Fără DOI înregistrat';
  document.getElementById('modal-abstract').textContent = paper.abstract;

  // Concepts
  const conceptsContainer = document.getElementById('modal-concepts');
  conceptsContainer.innerHTML = (paper.concepts || []).map(c => 
    `<span class="px-2.5 py-1 rounded-md bg-surface-950 text-slate-300 border border-slate-800 text-xs font-medium">${escapeHtml(c)}</span>`
  ).join('') || '<span class="text-xs text-slate-500">Nespecificate</span>';

  // Badges
  const oaBadgeContainer = document.getElementById('modal-oa-badge');
  oaBadgeContainer.innerHTML = paper.isOpenAccess
    ? `<span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
         <i data-lucide="unlock" class="w-3 h-3"></i> Open Access (${paper.oaStatus})
       </span>`
    : `<span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">
         <i data-lucide="lock" class="w-3 h-3"></i> Paywalled / Necesită Abonament
       </span>`;

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

  // Publisher link
  if (paper.landingUrl) {
    btnPublisher.href = paper.landingUrl;
    btnPublisher.classList.remove('hidden');
  } else {
    btnPublisher.classList.add('hidden');
  }

  // Institutional Proxy routing
  if (state.settings.ezproxy && paper.landingUrl) {
    const proxyUrl = `${state.settings.ezproxy}${encodeURIComponent(paper.landingUrl)}`;
    btnProxy.href = proxyUrl;
    btnProxy.classList.remove('hidden');
  } else {
    btnProxy.classList.add('hidden');
  }

  // BibTeX
  document.getElementById('modal-bibtex').textContent = generateBibTeX(paper);

  // Unpaywall check
  verifyUnpaywall(paper);

  // Auto-recover abstract if missing or sparse
  fetchAbstractWaterfall(paper, false);

  modal.classList.remove('hidden');
  if (window.lucide) window.lucide.createIcons();
}

function closeModal() {
  document.getElementById('paper-modal').classList.add('hidden');
  state.selectedPaper = null;
}

/**
 * Recuperare Automată Abstracte din API-uri Multiple (Europe PMC, Crossref, S2, Elsevier, Springer)
 * Indispensabil pentru lucrările paywalled unde indexul inițial nu a inclus abstractul complet.
 */
async function fetchAbstractWaterfall(paper, force = false) {
  const abstractEl = document.getElementById('modal-abstract');
  const sourceEl = document.getElementById('modal-abstract-source');
  const btnForce = document.getElementById('btn-force-abstract');

  const hasValidAbstract = paper.abstract && 
    !paper.abstract.toLowerCase().includes('nu este disponibil') && 
    !paper.abstract.toLowerCase().includes('nedisponibil') &&
    paper.abstract.trim().length > 80;

  if (hasValidAbstract && !force) {
    sourceEl.textContent = `Sursă: ${paper.abstractSource || 'Index Principal'}`;
    sourceEl.className = 'text-[10px] px-2 py-0.5 rounded bg-surface-950 border border-slate-800 text-brand-400 font-mono';
    sourceEl.classList.remove('hidden');
    return;
  }

  if (!paper.doi) {
    if (!hasValidAbstract) {
      abstractEl.textContent = 'Abstractul nu este disponibil și nu există un DOI pentru a interoga alte API-uri.';
      sourceEl.classList.add('hidden');
    }
    return;
  }

  // UI loading feedback
  sourceEl.innerHTML = '<span class="animate-pulse text-brand-400">Scanare API-uri abstract...</span>';
  sourceEl.className = 'text-[10px] px-2 py-0.5 rounded bg-surface-950 border border-slate-800 text-brand-400 font-mono';
  sourceEl.classList.remove('hidden');
  if (btnForce) btnForce.classList.add('opacity-50', 'pointer-events-none');

  const cleanDoi = paper.doi.trim();
  let recoveredAbstract = null;
  let sourceName = null;

  try {
    // 1. Încearcă Europe PMC API (CORS deschis, gratuit, indexează milioane de abstracte chiar și pentru publicații paywalled)
    try {
      const epmcQuery = encodeURIComponent(`DOI:"${cleanDoi}"`);
      const epmcRes = await fetch(`https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=${epmcQuery}&format=json&resultType=core`);
      if (epmcRes.ok) {
        const epmcData = await epmcRes.json();
        const res = epmcData.resultList?.result?.[0];
        if (res && res.abstractText && res.abstractText.trim().length > 50) {
          recoveredAbstract = res.abstractText.replace(/<[^>]*>/g, '').trim();
          sourceName = 'Europe PMC (Public)';
        }
      }
    } catch (e) {
      console.warn('Europe PMC abstract lookup failed:', e);
    }

    // 2. Dacă nu a găsit, încearcă Crossref REST API (multe edituri depun abstractul în metadata Crossref ca JATS XML)
    if (!recoveredAbstract) {
      try {
        const crRes = await fetch(`https://api.crossref.org/works/${encodeURIComponent(cleanDoi)}?mailto=${encodeURIComponent(state.settings.email)}`);
        if (crRes.ok) {
          const crData = await crRes.json();
          const rawAbstract = crData.message?.abstract;
          if (rawAbstract && rawAbstract.trim().length > 50) {
            recoveredAbstract = rawAbstract
              .replace(/<jats:title>[^<]*<\/jats:title>/gi, '')
              .replace(/<[^>]*>/g, '')
              .replace(/\s+/g, ' ')
              .trim();
            sourceName = 'Crossref Metadata';
          }
        }
      } catch (e) {
        console.warn('Crossref abstract lookup failed:', e);
      }
    }

    // 3. Dacă este articol Elsevier (DOI 10.1016/...) și utilizatorul a configurat cheie Elsevier API în setări
    if (!recoveredAbstract && state.settings.elsevierKey && cleanDoi.startsWith('10.1016/')) {
      try {
        const elsRes = await fetch(`https://api.elsevier.com/content/article/doi/${encodeURIComponent(cleanDoi)}?apiKey=${encodeURIComponent(state.settings.elsevierKey)}&httpAccept=application/json`);
        if (elsRes.ok) {
          const elsData = await elsRes.json();
          const core = elsData['full-text-retrieval-response']?.coredata || elsData['abstracts-retrieval-response']?.coredata;
          const desc = core?.['dc:description'];
          if (desc && desc.trim().length > 50) {
            recoveredAbstract = desc.replace(/<[^>]*>/g, '').trim();
            sourceName = 'Elsevier Scopus API';
          }
        }
      } catch (e) {
        console.warn('Elsevier abstract lookup failed:', e);
      }
    }

    // 4. Dacă utilizatorul a configurat Springer API key
    if (!recoveredAbstract && state.settings.springerKey) {
      try {
        const spRes = await fetch(`https://api.springernature.com/meta/v2/json?q=doi:${encodeURIComponent(cleanDoi)}&api_key=${encodeURIComponent(state.settings.springerKey)}`);
        if (spRes.ok) {
          const spData = await spRes.json();
          const rec = spData.records?.[0];
          if (rec?.abstract && rec.abstract.trim().length > 50) {
            recoveredAbstract = rec.abstract.trim();
            sourceName = 'Springer Nature API';
          }
        }
      } catch (e) {
        console.warn('Springer abstract lookup failed:', e);
      }
    }

    // 5. Încearcă Semantic Scholar Graph API
    if (!recoveredAbstract) {
      try {
        const s2Headers = state.settings.s2Key ? { 'x-api-key': state.settings.s2Key } : {};
        const s2Res = await fetch(`https://api.semanticscholar.org/graph/v1/paper/DOI:${encodeURIComponent(cleanDoi)}?fields=abstract`, {
          headers: s2Headers
        });
        if (s2Res.ok) {
          const s2Data = await s2Res.json();
          if (s2Data.abstract && s2Data.abstract.trim().length > 50) {
            recoveredAbstract = s2Data.abstract.trim();
            sourceName = 'Semantic Scholar';
          }
        }
      } catch (e) {
        console.warn('Semantic Scholar abstract lookup failed:', e);
      }
    }

    // Rezultat final
    if (recoveredAbstract) {
      paper.abstract = recoveredAbstract;
      paper.abstractSource = sourceName;
      abstractEl.textContent = recoveredAbstract;
      sourceEl.textContent = `Sursă: ${sourceName}`;
      sourceEl.className = 'text-[10px] px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-mono';
      showToast(`Abstract recuperat cu succes din ${sourceName}!`);
    } else {
      if (!hasValidAbstract) {
        abstractEl.textContent = 'Abstractul nu este disponibil liber prin Europe PMC, Crossref sau Semantic Scholar pentru acest articol paywalled. Recomandăm deschiderea paginii oficiale a publisherului sau adăugarea unei chei API Elsevier/Springer în Setări.';
      }
      sourceEl.textContent = 'Sursă: Negăsit în API-uri libere';
      sourceEl.className = 'text-[10px] px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20 font-mono';
    }

  } catch (err) {
    console.error('Eroare generală la recuperare abstract:', err);
  } finally {
    if (btnForce) btnForce.classList.remove('opacity-50', 'pointer-events-none');
    if (window.lucide) window.lucide.createIcons();
  }
}

/**
 * Verifică în timp real via Unpaywall dacă există o versiune gratuită a unui DOI
 */
async function verifyUnpaywall(paper) {
  const statusEl = document.getElementById('modal-unpaywall-status');
  const infoEl = document.getElementById('modal-unpaywall-info');

  if (!paper.doi) {
    statusEl.innerHTML = `<span class="text-slate-500">Nedisponibil (Fără DOI)</span>`;
    infoEl.textContent = 'Pentru această lucrare nu a fost identificat un DOI formal pentru interogare.';
    return;
  }

  statusEl.innerHTML = `<span class="text-brand-400">Se verifică pe unpaywall.org...</span>`;
  infoEl.textContent = 'Interogăm baza Unpaywall pentru manuscrise gratuite din universități sau arhive...';

  try {
    const email = encodeURIComponent(state.settings.email);
    const cleanDoi = encodeURIComponent(paper.doi);
    const res = await fetch(`https://api.unpaywall.org/v2/${cleanDoi}?email=${email}`);

    if (!res.ok) {
      statusEl.innerHTML = `<span class="text-slate-400">Verificat (Fără date suplimentare)</span>`;
      infoEl.textContent = 'Nu s-a putut obține un răspuns direct de la Unpaywall (posibil DOI nou sau neindexat).';
      return;
    }

    const data = await res.json();
    if (data.is_oa && data.best_oa_location) {
      const best = data.best_oa_location;
      const pdfLink = best.url_for_pdf || best.url;

      statusEl.innerHTML = `<span class="text-emerald-400 font-bold flex items-center gap-1"><i data-lucide="check" class="w-3.5 h-3.5"></i> Open Access Găsit (${data.oa_status})</span>`;
      infoEl.innerHTML = `
        Găsită versiune liberă: <strong class="text-slate-200">${escapeHtml(best.version || 'preprint/postprint')}</strong> 
        găzduită pe <span class="text-brand-300 font-medium">${escapeHtml(best.repository_institution || best.host_type || 'Open Repository')}</span>.
        <a href="${pdfLink}" target="_blank" rel="noopener noreferrer" class="text-emerald-400 underline font-semibold ml-2">Deschide această versiune &rarr;</a>
      `;

      // Activează butonul de descărcare PDF dacă era ascuns
      const btnDownloadPdf = document.getElementById('modal-btn-download-pdf');
      btnDownloadPdf.href = pdfLink;
      btnDownloadPdf.classList.remove('hidden');

      // Actualizează și modelul de date local
      paper.isOpenAccess = true;
      paper.oaPdfUrl = pdfLink;
    } else {
      statusEl.innerHTML = `<span class="text-amber-400 font-medium">Lucrare Strict Paywalled</span>`;
      infoEl.textContent = 'Nu a fost găsită nicio versiune Open Access legală în arhivele universitare. Necesită abonament instituțional sau acces via biroul de la muncă.';
    }
  } catch (err) {
    statusEl.innerHTML = `<span class="text-slate-400">Eroare verificare</span>`;
    infoEl.textContent = 'Eroare temporară de comunicare cu Unpaywall.';
  } finally {
    if (window.lucide) window.lucide.createIcons();
  }
}

/* ==========================================================================
   6. AI & Algorithmic Synthesis Engine
   ========================================================================== */
async function runSynthesis(query, papers) {
  state.isSynthesizing = true;
  const container = document.getElementById('ai-synthesis-content');
  const modeTag = document.getElementById('synthesis-mode-tag');

  // Dacă utilizatorul a introdus o cheie Gemini API în setări, apelăm Gemini
  if (state.settings.geminiKey) {
    try {
      modeTag.textContent = 'Google Gemini 1.5 Flash (Live Agent)';
      const markdown = await callGeminiSynthesis(query, papers, state.settings.geminiKey);
      container.innerHTML = window.marked ? window.marked.parse(markdown) : `<pre>${escapeHtml(markdown)}</pre>`;
      return;
    } catch (err) {
      console.warn('Gemini API call failed, falling back to algorithmic synthesis:', err);
      showToast('Apelul Gemini a eșuat. S-a activat sinteza algoritmică nativă.');
    }
  }

  // Fallback: Smart Algorithmic Synthesis (Zero configuration, instantaneous)
  modeTag.textContent = 'Algorithmic Insight Engine (Nativ)';
  const algorithmicReport = generateAlgorithmicSynthesis(query, papers);
  container.innerHTML = window.marked ? window.marked.parse(algorithmicReport) : `<pre>${escapeHtml(algorithmicReport)}</pre>`;
  state.isSynthesizing = false;
}

/**
 * Apel direct către Google Gemini API
 */
async function callGeminiSynthesis(query, papers, apiKey) {
  const topPapers = papers.slice(0, 12);
  const papersSummary = topPapers.map((p, i) => `
[${i+1}] "${p.title}" (${p.year})
Autori: ${p.authors.slice(0, 3).join(', ')}
Citări: ${p.citations} | Acces: ${p.isOpenAccess ? 'Open Access' : 'Paywalled'}
Abstract: ${p.abstract.slice(0, 350)}...
`).join('\n---\n');

  const systemPrompt = `Ești un asistent academic de elită (ScholarAgent). 
Sarcina ta este să realizezi un briefing de cercetare concis, structurat și riguros în limba română pe baza următoarelor lucrări științifice găsite pentru subiectul: "${query}".

Structura raportului:
1. **Privire de Ansamblu & Stadiul Actual al Cercetării** (2-3 paragrafe sintetice)
2. **Taxonomia Metodologiilor & Tehnologiilor Cheie** (puncte clare cu abordările abordate în paperuri)
3. **Lucrări Seminale vs. Avansuri Recente** (comparație între lucrările cele mai citate și cele mai noi)
4. **Disponibilitate & Accesibilitate** (analiză scurtă Open Access vs Paywalled în acest domeniu)
5. **Direcții Deschise de Cercetare & Gaps** (unde se îndreaptă domeniul).

Folosește referințe la lucrări sub forma [1], [2] etc. Fii obiectiv, concis și academic.`;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;

  const payload = {
    contents: [
      {
        parts: [
          { text: systemPrompt + "\n\nLucrări analizate:\n" + papersSummary }
        ]
      }
    ],
    generationConfig: {
      temperature: 0.2,
      maxOutputTokens: 2000
    }
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  if (!res.ok) {
    const errorJson = await res.json().catch(() => ({}));
    throw new Error(errorJson.error?.message || `HTTP ${res.status}`);
  }

  const result = await res.json();
  const text = result.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('Răspuns gol de la Gemini.');
  return text;
}

/**
 * Motor de sinteză algoritmică (Nu necesită chei externe)
 */
function generateAlgorithmicSynthesis(query, papers) {
  const total = papers.length;
  const oaCount = papers.filter(p => p.isOpenAccess).length;
  const oaPercentage = Math.round((oaCount / total) * 100);

  // Top cited paper (Seminal work)
  const sortedByCitations = [...papers].sort((a, b) => b.citations - a.citations);
  const seminalPaper = sortedByCitations[0];

  // Most recent high-impact paper
  const sortedByYear = [...papers].sort((a, b) => {
    const yA = typeof a.year === 'number' ? a.year : parseInt(a.year, 10) || 0;
    const yB = typeof b.year === 'number' ? b.year : parseInt(b.year, 10) || 0;
    return yB - yA;
  });
  const recentPaper = sortedByYear[0];

  // Concept distribution
  const conceptCounts = {};
  papers.forEach(p => {
    (p.concepts || []).forEach(c => {
      conceptCounts[c] = (conceptCounts[c] || 0) + 1;
    });
  });
  const topConcepts = Object.entries(conceptCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([c, cnt]) => `\`${c}\` (${cnt} lucrări)`)
    .join(', ');

  return `
### Briefing Academic: "${escapeHtml(query)}"

#### 1. Peisajul General & Concepte Dominante
În urma analizei corpusului de **${total} lucrări științifice**, subiectul investigat evidențiază un volum semnificativ de cercetare interdisciplinară. 
Conceptele fundamentale recurente în această colecție sunt: ${topConcepts || 'teme de specialitate'}.

#### 2. Indicatori de Impact & Progres Cronologic
* **Lucrarea cu cel mai mare impact bibliometric:** 
  > **"${escapeHtml(seminalPaper.title)}"** (${seminalPaper.year}) — ${seminalPaper.authors[0]} et al.
  > Înregistrează **${seminalPaper.citations.toLocaleString()} citări** înregistrate în indexul global și reprezintă una dintre referințele fundamentale pe acest topic.
* **Cea mai recentă contribuție identificată:** 
  > **"${escapeHtml(recentPaper.title)}"** (${recentPaper.year}) — axată pe metodologii recente și avansuri de frontieră.

#### 3. Raport de Accesibilitate (Open Access vs Paywalled)
* **${oaPercentage}% din lucrările identificate (${oaCount} din ${total})** sunt disponibile gratuit în regim **Open Access** (pot fi descărcate imediat prin arXiv, PubMed Central sau depozite universitare).
* Restul de **${100 - oaPercentage}%** sunt publicate în reviste cu barieră de plată (Elsevier, IEEE, Springer Nature). Pentru acestea, poți folosi verificatorul Unpaywall încorporat în modal sau prefixul proxy de la birou.

> **Sfat:** Pentru o sinteză narativă generativă detaliată realizată de un model LLM (Gemini), deschide panoul **Setări & Proxy** și adaugă o cheie gratuită Google AI Studio.
`;
}

function copySynthesisText() {
  const content = document.getElementById('ai-synthesis-content').innerText;
  navigator.clipboard.writeText(content).then(() => {
    showToast('Sinteza a fost copiată în clipboard!');
  });
}

/* ==========================================================================
   7. BibTeX Export Utilities
   ========================================================================== */
function generateBibTeX(p) {
  const firstAuthor = p.authors[0] ? p.authors[0].split(' ').pop().toLowerCase().replace(/[^a-z0-9]/gi, '') : 'author';
  const cleanYear = p.year !== 'N/A' ? p.year : '2024';
  const citeKey = `${firstAuthor}${cleanYear}${p.title.slice(0, 10).toLowerCase().replace(/[^a-z0-9]/gi, '')}`;

  const authorsFormatted = p.authors.join(' and ');

  return `@article{${citeKey},
  title = {${p.title.replace(/[{}]/g, '')}},
  author = {${authorsFormatted}},
  year = {${cleanYear}},
  journal = {${p.venue || p.publisher || 'Scholarly Publication'}},
  ${p.doi ? `doi = {${p.doi}},` : ''}
  ${p.landingUrl ? `url = {${p.landingUrl}},` : ''}
  publisher = {${p.publisher || 'Unknown'}}
}`;
}

function exportAllBibTeX() {
  if (state.papers.length === 0) {
    showToast('Nu există lucrări de exportat.');
    return;
  }

  const allBib = state.papers.map(generateBibTeX).join('\n\n');
  const blob = new Blob([allBib], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `scholar_agent_${state.currentQuery.slice(0, 15).replace(/[^a-z0-9]/gi, '_')}.bib`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  showToast(`Au fost exportate ${state.papers.length} citări în format BibTeX!`);
}

/* ==========================================================================
   8. Helper Functions
   ========================================================================== */
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
  toast.innerHTML = `
    <i data-lucide="info" class="w-4 h-4 text-brand-400"></i>
    <span>${escapeHtml(message)}</span>
  `;
  document.body.appendChild(toast);
  if (window.lucide) window.lucide.createIcons();

  setTimeout(() => {
    toast.remove();
  }, 3500);
}
