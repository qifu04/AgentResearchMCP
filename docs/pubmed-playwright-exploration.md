# PubMed Playwright Exploration

- Research date: 2026-03-12
- Method: Playwright-driven page inspection of PubMed search and export flows
- Evidence source:
  - direct observations from the shared Playwright session
  - delegated-agent summary created from the same browser session when file-writing tools were unavailable in the child thread

## Scope

This note focuses on the minimum evidence needed for a search-oriented MCP adapter:

1. build or set a query
2. execute a search
3. read titles and abstract previews
4. enumerate filters
5. select results
6. export as much as possible

## Key Findings At A Glance

- PubMed search and citation-manager export worked without a personal login in the observed session.
- PubMed supports both builder-style query construction and a free-text query box on Advanced Search.
- Search state is easy to recover from URL parameters, especially `term` and `sort`.
- Result cards already contain abstract previews in the DOM, so the first-page abstract sampling path is simpler than WOS and IEEE.
- Export is not RIS natively. The observed native format is `.nbib`.
- The export flow exposes three scopes: `All results on this page`, `All results`, and `Selection`.

## 1. Login And Session Detection

### Capability: detect usable anonymous session

- Page objects:
  - top `Log in` link
- Verified:
  - search does not require personal login
  - citation-manager export also worked without personal login in the observed session
- Reusable inference:
  - PubMed should be treated as a provider where anonymous search is first-class and login is optional for the current MCP scope
- Candidate functions:
  - `detectSessionState()`

## 2. Query Input

### Capability: set query through Advanced Search builder or raw query box

- Page objects:
  - `Field Selector`
  - `Search Term`
  - `ADD`
  - `Query box`
  - `Search`
- Verified:
  - Advanced Search exposes both a structured builder path and a free query-text path
- Important fields:
  - builder-selected field
  - builder term
  - raw query text in `Query box`
- Candidate functions:
  - `setCurrentQuery(query)`
  - `appendQueryTerm(term, field, operator)`
  - `readCurrentQuery()`
  - `listSupportedFieldTags()`

## 3. Search Trigger

### Capability: execute search and persist query in URL

- Action:
  - fill `Query box`
  - click `Search`
- Verified example:
  - raw query: `deep learning`
  - result URL: `https://pubmed.ncbi.nlm.nih.gov/?term=deep+learning&sort=`
- Important URL fields:
  - `term`
  - `sort`
- Candidate functions:
  - `submitSearch()`
  - `readSearchUrl()`
  - `readCurrentQueryFromUrl()`

## 4. Result Summary, Paging, And Sort

### Capability: read search summary directly from result page

- Observed summary text:
  - `128,804 results`
  - `Page 1 of 12,881`
- Observed page-size options:
  - `10`
  - `20`
  - `50`
  - `100`
  - `200`
- Observed sort options:
  - `Best match`
  - `Most recent`
  - `Publication date`
  - `First author`
  - `Journal`
- Candidate functions:
  - `readSearchSummary()`
  - `readPageInfo()`
  - `setSort(sortKey)`
  - `setPageSize(size)`

## 5. Result Card Structure

### Capability: read first-page title list from DOM

- Result container type:
  - `article` cards
- Observed per-card fields:
  - checkbox
  - title link
  - author line
  - journal / citation text
  - PMID
  - labels such as `Review.`, `Free article.`, `Free PMC article.`
  - abstract preview
- Adapter implication:
  - PubMed title and metadata extraction can be DOM-first without clicking into each result
- Candidate functions:
  - `readResultTitles(limit)`
  - `readResultItems(limit)`

## 6. Abstract Acquisition

### Capability: read abstract preview directly from result list

- Verified:
  - abstract previews are already present in result-card DOM
  - no `Show more` click is required to get useful first-page previews
- Adapter implication:
  - PubMed is the clearest `dom-preview` provider among the currently observed databases
- Candidate functions:
  - `readResultAbstractsFromDom(limit)`
  - `readResultAbstracts(limit)`
- Pending:
  - full-abstract acquisition path via detail page is not yet written separately

## 7. Filters

### Capability: enumerate left-side filter groups

- Observed filter groups:
  - `Publication date`
  - `Text availability`
  - `Article attribute`
  - `Article type`
  - `Additional filters`
- Observed options:
  - Publication date:
    - `1 year`
    - `5 years`
    - `10 years`
    - `Custom Range`
  - Text availability:
    - `Abstract`
    - `Free full text`
    - `Full text`
  - Article type:
    - `Review`
    - `Systematic Review`
    - `Meta-Analysis`
    - `Clinical Trial`
- Candidate functions:
  - `listFilters()`
  - `applyFilters(filters)`
  - `readFilterState()`
- Pending:
  - per-filter URL diff and request diff still need to be recorded action by action

## 8. Selection And Export

### Capability: select export scope from `Send to`

- Page objects:
  - per-result checkbox
  - `Send to`
  - `Citation manager`
  - `Selection:`
  - `Create file`
- Verified export scopes:
  - `All results on this page`
  - `All results`
  - `Selection`
- Verified download takeover:
  - download event fired successfully
  - observed suggested file name: `pubmed-deeplearni-set.nbib`
  - observed download URL: `https://pubmed.ncbi.nlm.nih.gov/results-export-ids/`
- Native format:
  - `.nbib`
- Adapter implication:
  - PubMed fits a `native export -> convert to RIS later` pipeline
- Candidate functions:
  - `selectResultsByIndex(indices)`
  - `setExportSelection(scope)`
  - `exportNative()`
  - `captureDownload()`
  - `convertToRis()`

## 9. Reusable Fields To Persist

Recommended minimum persisted state for PubMed:

- `queryText`
- `termParam`
- `sort`
- `totalResults`
- `currentPage`
- `totalPages`
- `pageSize`
- `lastExportSelection`

Observed browser-state note:

- no WOS-style required session token was observed for the current anonymous flow
- no must-have storage object has been identified yet for adapter persistence

## 10. Candidate Function Mapping

PubMed currently maps cleanly to the common adapter surface:

- `detectSessionState()`
- `readCurrentQuery()`
- `setCurrentQuery(query)`
- `submitSearch()`
- `readSearchSummary()`
- `readResultTitles(limit)`
- `readResultAbstracts(limit)`
- `listFilters()`
- `applyFilters(filters)`
- `selectResultsByIndex(indices)`
- `detectExportCapability()`
- `exportNative({ scope })`
- `convertToRis()`

## 11. Verified, Pending, And Risks

### Verified

- anonymous search works
- anonymous citation-manager export works
- result cards already contain abstract previews
- export scopes include page / all / selection
- native export file is `.nbib`

### Pending

- filter-by-filter URL diff
- filter-by-filter request diff
- full abstract path on detail page
- real upper bound of `All results` export

### Risks

- PubMed does not natively export RIS for the observed flow
- RIS support must therefore come from conversion, not direct provider export
- MyNCBI or account-specific features may introduce a second session mode later, but they are outside the current scope
