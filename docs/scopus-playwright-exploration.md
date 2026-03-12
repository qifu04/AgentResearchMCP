# Scopus Playwright Exploration

- Research date: 2026-03-12
- Method: Playwright-driven inspection of Scopus advanced-search page, result page, filters, abstract expansion, storage, network calls, and export blockers
- UI locale during observation: Chinese locale, but this note uses ASCII-only labels and English descriptions for stability

## Scope

This note covers the Scopus behaviors most relevant to the planned search MCP:

1. set and run advanced queries
2. read result summaries and titles
3. obtain first-page abstracts
4. enumerate and apply filters
5. detect what selection and export paths are available without login

## Key Findings At A Glance

- Scopus advanced search was usable without a personal account in the observed session.
- Advanced search exposes a rich raw-query interface with visible fielded syntax and operators.
- Result pages expose structured filters, inline abstract expansion, and a `Show all abstracts` control.
- Result-row metadata is richer than PubMed and closer to WOS.
- Citation export is blocked at the page layer for anonymous users and requires a Scopus account.
- The visible `Download` control is not citation export; it is a document-download-manager flow requiring a browser extension.
- Scopus already exposes several promising internal endpoints for future adapter work:
  - `/api/documents/search`
  - `/api/documents/search/facets`
  - `/gateway/documents/abstracts/retrieve`

## 1. Login And Session Detection

### Capability: detect anonymous search access vs account-gated export

- Advanced-search page opened successfully without personal sign-in
- Console hint observed:
  - `None logged in user: need to login for save ...`
- Verified:
  - advanced search and result browsing worked without login
  - `Export` is account-gated
- Candidate functions:
  - `detectSessionState()`
  - `requiresInteractiveLogin(capability)`

## 2. Query Input

### Capability: set raw advanced query

- Advanced-search URL:
  - `https://www.scopus.com/search/form.uri?display=advanced`
- Page title:
  - `Scopus - Advanced Search` in the Chinese locale UI
- Main query control:
  - advanced-query textbox
- Search trigger:
  - `Search`
- Visible operator help:
  - `AND`
  - `OR`
  - `AND NOT`
  - `PRE/`
  - `W/`
- Verified example query:
  - `TITLE-ABS-KEY("deep learning")`
- Candidate functions:
  - `readCurrentQuery()`
  - `setCurrentQuery(query)`
  - `listSupportedFieldTags()`
  - `submitSearch()`

## 3. Search Trigger And URL State

### Capability: execute advanced query and recover state from result URL

- Verified result URL contained:
  - `s=TITLE-ABS-KEY%28%22deep+learning%22%29`
  - `sid=bef983174bcc5a0da64de755d3ece670`
  - `sessionSearchId=bef983174bcc5a0da64de755d3ece670`
  - `limit=10`
  - `sort=plf-f`
- Adapter implication:
  - Scopus has a useful hybrid state model:
    - query and display settings are visible in URL
    - session-like identifiers also surface in URL
- Candidate functions:
  - `readSearchUrl()`
  - `readCurrentQueryFromUrl()`
  - `readSearchSummary()`

## 4. Result Summary, Paging, And Sort

### Capability: read summary from result page

- Observed summary text:
  - page heading indicated `Found 689,636 documents`
- Observed table-range heading:
  - result table stated that rows `1 to 10` were shown out of `2000` visible results
- Observed paging controls:
  - numeric pages `1 ... 200`
  - `Next`
- Observed page-size options:
  - `10`
  - `20`
  - `50`
  - `100`
  - `200`
- Observed sort options:
  - `Date (newest)`
  - `Date (oldest)`
  - `Cited by (highest)`
  - `Cited by (lowest)`
  - `Relevance`
  - `First author (A-Z)`
  - `First author (Z-A)`
  - `Source title (A-Z)`
  - `Source title (Z-A)`
- Adapter implication:
  - Scopus appears to cap interactive result paging to a visible window of `2000` results even when total matches are much larger

## 5. Result Row Structure

### Capability: read titles and metadata from tabular result rows

- Observed per-row fields:
  - checkbox `Select result N`
  - numeric row index
  - title link
  - author buttons
  - source-title link
  - year
  - citation count
- Observed secondary row actions:
  - `View abstract`
  - `View at Publisher`
  - `Related documents`
- Observed top result-toolbar actions:
  - `All`
  - `Export`
  - `Download`
  - `Citation overview`
  - `More`
  - `Show all abstracts`
- Candidate functions:
  - `readResultTitles(limit)`
  - `readResultItems(limit)`
  - `selectResultsByIndex(indices)`

## 6. Abstract Acquisition

### Capability: expand inline abstract per result row

- Verified action:
  - clicking the first row's `View abstract` expanded the abstract inline
- Verified post-click state:
  - toggle label changed to `Hide abstract`
  - abstract text appeared in DOM directly below the row
- Useful technical detail:
  - the observed control used a stable-looking test id:
    - `button-abstract-collapsible-panel-0`
- Additional page-level clue:
  - result toolbar includes `Show all abstracts`
- Adapter implication:
  - Scopus supports both one-by-one and likely bulk abstract expansion modes at the DOM layer
- Candidate functions:
  - `expandAbstractByIndex(index)`
  - `expandAllVisibleAbstracts()`
  - `readResultAbstractsFromDom(limit)`
  - `readResultAbstracts(limit)`

## 7. Filters

### Capability: enumerate left-side structured filters

- Observed filter groups:
  - `Year`
  - `Subject area`
  - `Document type`
  - `Language`
  - `Keywords`
  - `Country/Region`
  - `Source type`
  - `Source title`
  - `Author name`
  - `Publication stage`
  - `Affiliation`
  - `Funding sponsor`
  - `Open access`
- Observed year control features:
  - `Range`
  - `Single`
  - slider handles
  - `From`
  - `To`
- Example loaded options:
  - Subject area:
    - `Computer Science 451,004`
    - `Engineering 307,434`
    - `Mathematics 139,296`
  - Document type:
    - `Article 355,180`
    - `Conference paper 275,217`
    - `Review 23,047`
  - Language:
    - `English 665,100`
    - `Chinese 21,233`
  - Keywords:
    - `Deep Learning 559,506`
    - `Convolutional Neural Network 100,971`
    - `Machine Learning 94,700`
- Candidate functions:
  - `listFilters()`
  - `applyFilters(filters)`
  - `readFilterState()`

## 8. Selection And Export

### Capability: select rows from result list

- Page objects:
  - per-row checkbox `Select result N`
  - top `Select all`
- Verified:
  - row selection is directly exposed on the results table
- Candidate functions:
  - `selectResultsByIndex(indices)`
  - `selectAllOnPage()`

### Capability: detect anonymous export blocker

- Action:
  - click top `Export`
- Verified behavior:
  - a popover appeared stating:
    - `You must have a Scopus account to use this feature.`
  - popover included `Sign in or create account`
- Adapter implication:
  - Scopus export must surface `requiresInteractiveLogin`
  - current anonymous session cannot yet confirm native RIS or batch-size behavior

### Capability: distinguish `Download` from citation export

- Action:
  - click top `Download`
- Verified behavior:
  - dialog stated that Scopus document download manager requires a browser extension
  - links pointed to help and Chrome Web Store extension install
- Adapter implication:
  - `Download` is a full-text document workflow, not the citation-export workflow needed for the MCP

## 9. Reusable Storage And Network Fields

### Storage

- Observed `localStorage` keys:
  - `NRBA_SESSION`
  - several `_pendo_*` keys
- Observed `sessionStorage` keys:
  - `document-search-results-page~is-advanced-view`
  - `document-search-results-page~is-advanced-query`
  - `previous_page_loads`
  - `primary_documents~pageSize`
- Adapter implication:
  - storage is useful for page-mode and page-size state
  - no WOS-style rich query object has been isolated yet

### Network

- Verified useful endpoints:
  - `POST /gateway/documents/search-query/parse`
  - `POST /api/documents/search/facets`
  - `POST /gateway/documents/search/userquery`
  - `POST /api/documents/search`
  - `POST /api/documents/spellcheck`
  - `POST /api/session/store`
  - `POST /api/documents/displayquery`
  - `POST /gateway/documents/abstracts/retrieve`
  - `POST /api/documents/search-history`
  - `POST /gateway/usage-key-events-service/keyevent/create`
- Adapter implication:
  - `/api/documents/search` is the strongest search endpoint candidate
  - `/api/documents/search/facets` is the strongest filter-state endpoint candidate
  - `/gateway/documents/abstracts/retrieve` is the strongest abstract endpoint candidate

## 10. Candidate Function Mapping

- `detectSessionState()`
- `readCurrentQuery()`
- `setCurrentQuery(query)`
- `submitSearch()`
- `readSearchSummary()`
- `readResultTitles(limit)`
- `expandAbstractByIndex(index)`
- `expandAllVisibleAbstracts()`
- `readResultAbstracts(limit)`
- `listFilters()`
- `applyFilters(filters)`
- `selectResultsByIndex(indices)`
- `selectAllOnPage()`
- `detectExportCapability()`
- `requiresInteractiveLogin(capability)`

## 11. Verified, Pending, And Risks

### Verified

- advanced search works anonymously
- result browsing works anonymously
- inline abstract expansion works
- filter groups are richly structured and DOM-readable
- export is blocked without Scopus account login
- `Download` is a separate extension-driven full-text flow
- several promising internal search and abstract endpoints are observable

### Pending

- account-authenticated export flow
- whether Scopus offers native RIS in the current UI path after login
- range or batch limits for citation export
- request diff for actual filter application
- `Show all abstracts` bulk-expansion behavior

### Risks

- anonymous and authenticated capability sets differ materially
- visible result range appears capped at `2000`, so full-result harvesting may require export or internal API strategies
- the current MCP should not conflate citation export with the full-text document downloader flow
