# 🎓 ScholarAgent — Academic Research & Literature Explorer

**ScholarAgent** este o aplicație web modernă pentru căutarea, filtrarea și sinteza lucrărilor științifice (atât **Open Access**, cât și **Paywalled / Plătite** de la marii publisheri academici), special concepută pentru a rula direct ca o aplicație statică fără server (100% compatibilă **GitHub Pages**).

---

## 🚀 Funcționalități Cheie

1. **Index Academic Global (250M+ lucrări):**
   - Interoghează direct **OpenAlex API**, **arXiv**, **PubMed/Europe PMC** și **Crossref**.
   - Extrage titluri, autori, abstracte complete, reviste/conferințe, număr de citări și concepte cheie.
2. **Detectare Automată Open Access vs Paywalled:**
   - Clasificare clară vizuală: etichete verzi pentru articole cu **PDF Gratuit**, etichete galbene pentru lucrări cu **Acces pe bază de Abonament**.
   - Filtrare rapidă cu un singur click: *Toate*, *Doar Open Access*, *Doar Paywalled*.
3. **Verificare Live prin Unpaywall:**
   - La deschiderea oricărei lucrări blocate după un paywall, agentul interoghează automat `api.unpaywall.org` pentru a detecta dacă autorul a publicat o copie legală gratuită (preprint, depozit universitar sau postprint) și îți oferă linkul direct către PDF.
4. **Acces la Muncă / Proxy Instituțional (EZProxy):**
   - Poți seta în panoul de setări prefixul EZProxy al bibliotecii/instituției tale de la muncă. Când apeși pe butonul de proxy, articolul se deschide automat prin abonamentul organizației.
5. **Sinteză Academică & Briefing AI:**
   - **Nativ (Zero configurare):** Include un motor de analiză algoritmică ce identifică lucrarea seminală (cea mai citată), avansurile recente, ponderea Open Access și distribuția conceptelor cheie.
   - **Opțional (Gemini AI):** Poți adăuga în setări propria cheie gratuită Google Gemini pentru a genera recenzii narative exhaustive de literatură.
6. **Export BibTeX:**
   - Exportă citarea oricărui articol individual sau descarcă un fișier `.bib` cu toate rezultatele căutării pentru Mendeley, Zotero sau LaTeX.
7. **Recuperare Automată de Abstracte pentru Lucrări Paywalled:**
   - Pentru articolele comerciale unde indexul inițial nu include abstractul complet, agentul pornește automat un mecanism de *fallback waterfall*: interoghează consecutiv **Europe PMC** (index public gratuit), **Crossref Metadata** (depuneri XML oficiale de la edituri), **Semantic Scholar Graph API** și opțional **Elsevier Scopus API** / **Springer Nature API**.

---

## 🛠️ Cum publici aplicația pe GitHub Pages (Ghid Pas cu Pas)

Toate fișierele sunt create direct în acest folder. Urmează pașii de mai jos în terminalul tău:

### Pasul 1: Creează un repository nou pe GitHub
1. Intră pe [github.com/new](https://github.com/new).
2. Dă-i un nume repository-ului (de exemplu: `scholar-agent`).
3. Setează-l ca **Public** (pentru ca GitHub Pages să fie gratuit) și apasă pe **Create repository**.

### Pasul 2: Inițializează Git și dă Push
În terminal, chiar în acest folder (`munca_raiff`), rulează:

```bash
# 1. Inițializează git
git init

# 2. Adaugă toate fișierele
git add .

# 3. Creează primul commit
git commit -m "Initial commit - ScholarAgent"

# 4. Asigură-te că ești pe ramura 'main'
git branch -M main

# 5. Adaugă URL-ul repository-ului tău GitHub (înlocuiește cu userul și repo-ul tău)
git remote add origin https://github.com/UTILIZATORUL_TAU/scholar-agent.git

# 6. Trimite codul pe GitHub
git push -u origin main
```

### Pasul 3: Activează GitHub Pages
1. Pe pagina repository-ului tău de pe GitHub, apasă pe **Settings** (tab-ul de sus).
2. În meniul din stânga, apasă pe **Pages**.
3. La secțiunea **Build and deployment -> Source**, selectează:
   - **GitHub Actions** (workflow-ul inclus `.github/workflows/deploy.yml` va face deploy automat la fiecare push), **SAU**
   - **Deploy from a branch** -> alege branch-ul `main` și folderul `/ (root)`, apoi apasă **Save**.
4. În aproximativ 1 minut, linkul aplicației tale va fi activ la adresa:
   `https://UTILIZATORUL_TAU.github.io/scholar-agent/`

---

## 🏢 Cum o folosești de pe calculatorul de la muncă

1. **Accesează linkul** generat de GitHub Pages din browserul de la birou (Chrome, Edge, Firefox, Safari).
2. Nu ai nevoie de permisiuni de administrator sau de instalare de software — totul rulează 100% în browser (client-side).
3. **Dacă ești pe rețeaua / VPN-ul instituțional de la muncă:**
   - Butoanele *„Pagina Publisherului”* vor beneficia automat de abonamentele de reviste (ScienceDirect, IEEE, Springer) recunoscute prin IP.
4. **Dacă accesezi de la distanță sau de acasă:**
   - Deschide panoul **Setări & Proxy** din colțul dreapta-sus al aplicației.
   - Adaugă prefixul EZProxy (ex: `https://ezproxy.biblioteca-ta.ro/login?url=`).
   - Apasă *Salvează*. De acum, oricând apeși pe o lucrare plătită, ai la dispoziție butonul dedicat *„Deschide via Proxy Instituțional”*.

---

## 📁 Structura Fișierelor

* `index.html` — Interfața completă cu Tailwind CSS, iconițe Lucide și design responsive dark mode.
* `app.js` — Logica agentului: interogare OpenAlex & Crossref, verificare Unpaywall, generare BibTeX, filtrare și motor de sinteză.
* `styles.css` — Stiluri personalizate, scrollbars, efecte de card și tipografie pentru rapoarte.
* `.github/workflows/deploy.yml` — Automatizare completă pentru deployment pe GitHub Pages la fiecare commit.
* `.nojekyll` — Asigură servirea corectă a tuturor resurselor statice de către GitHub Pages.
