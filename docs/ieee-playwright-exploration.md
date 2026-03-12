# IEEE Xplore Playwright Exploration

- Research date: 2026-03-12
- Method: Playwright-driven inspection of IEEE Xplore result-page controls, export modal, download events, DOM expansion, storage, and network calls

## Scope

This note documents the result-page capabilities needed for a search-oriented MCP adapter:

1. read query and session state
2. inspect result cards
3. expand abstracts
4. enumerate filters
5. select results
6. export result data and citations

## Key Findings At A Glance

- Institutional access was active and displayed as `Peking University`.
- IEEE result pages expose enough structure directly in DOM for title extraction and abstract preview expansion.
- Export is split into two distinct result-page behaviors:
  - `Results` tab: CSV-style result download, up to `1,000` when nothing is selected
  - `Citations` tab: selection-based citation export supporting `Plain Text`, `BibTeX`, `RIS`, and `RefWorks`
- RIS export was verified directly through a Playwright download event.
- The RIS download was produced as a browser `blob:` download, not a stable file URL.
- Two provider-specific network endpoints are already highly useful:
  - `POST /rest/search`
  - `POST /rest/search/citation/format`

## 1. Login And Session Detection

### Capability: detect institutional access and feature blockers

- Page objects:
  - `Personal Sign In`
  - `Create Account`
  - `Access provided by: Peking University`
  - saved-search sign-in panel in the sidebar
- Verified:
  - result-page search and citation export were usable under institutional access
  - some features still encourage or require personal sign-in, especially personalization flows
- Candidate functions:
  - `detectSessionState()`
  - `requiresInteractiveLogin(capability)`
  - `clearInterferingUi()`

### Blocking UI observed

- cookie consent banner appeared on load and had to be cleared
- saved-search sign-in panel is embedded in the results layout
- some future actions may still trigger personal sign-in flows

## 2. Query Input And Search State

### Capability: recover query from result page

- Page objects:
  - top search box
  - `ADVANCED SEARCH` link
- Important URL field:
  - `queryText`
- Verified example:
  - current result URL includes `queryText=deep%20learning`
- Candidate functions:
  - `readCurrentQuery()`
  - `setCurrentQuery(query)`
  - `openAdvancedSearch()`

## 3. Result Summary, Paging, And Sort

### Capability: read result summary from page heading

- Observed heading:
  - `Showing 1-25 of 378,904 results`
- Observed page size:
  - `25`
- Observed paging controls:
  - numeric page buttons
  - `>`
  - `Next`
- Observed sort control:
  - `Relevance`
- Candidate functions:
  - `readSearchSummary()`
  - `readPageInfo()`
  - `setSort(sortKey)`

## 4. Result Card Structure

### Capability: read titles and metadata from DOM

- Observed per-result fields:
  - result checkbox
  - title link
  - author links
  - publication / proceeding link
  - year
  - content type such as conference paper or book
  - publisher button
  - citation count link
  - access-status icon
- Observed per-result action row:
  - `Abstract`
  - `HTML`
  - `PDF`
  - copyright / permission action
- Candidate functions:
  - `readResultTitles(limit)`
  - `readResultItems(limit)`
  - `selectResultsByIndex(indices)`

## 5. Abstract Acquisition

### Capability: expand inline abstract from search results

- Trigger action:
  - click per-result `Abstract`
- Verified behavior:
  - the button toggled from collapsed to expanded state
  - inline abstract text appeared directly below the action row
  - the expanded text was truncated and linked to detail page through `Show More`
- Observed inline text sample:
  - abstract content was present directly in DOM after one click
- Adapter implication:
  - IEEE is a `dom-expand` provider rather than a `dom-preview` provider
- Candidate functions:
  - `expandAbstractByIndex(index)`
  - `readResultAbstractsFromDom(limit)`
  - `readResultAbstracts(limit)`

## 6. Filters

### Capability: enumerate quick filters and left-side structured filters

- Observed quick result-type filters:
  - `Conferences`
  - `Journals`
  - `Books`
  - `Early Access Articles`
  - `Magazines`
  - `Standards`
  - `Courses`
- Observed scope toggles:
  - `All Results`
  - `Subscribed Content`
  - `Open Access Only`
- Observed left filter groups:
  - `Year`
  - `Author`
  - `Affiliation`
  - `Publication Title`
  - `Publisher`
  - `Supplemental Items`
  - `Conference Location`
  - `Publication Topics`
  - `Standard Status`
  - `Standard Type`
- Observed year-filter behavior:
  - `Range`
  - `Single Year`
  - `Apply`
  - `Clear`
- Candidate functions:
  - `listFilters()`
  - `applyFilters(filters)`
  - `readFilterState()`
- Pending:
  - per-filter request payloads have not yet been isolated action by action

## 7. Selection And Export

### Capability: select items on results page

- Page objects:
  - per-result checkbox
  - `Select All on Page`
- Verified:
  - per-result selection works
  - citation export behavior changes after at least one result is selected
- Candidate functions:
  - `selectResultsByIndex(indices)`
  - `selectAllOnPage()`
  - `clearSelection()`

### Capability: export result rows

- Page object:
  - top `Export` button
- Observed export modal tabs:
  - `Results`
  - `Citations`
  - `To Collabratec`
  - `My Research Projects`
- Results-tab findings:
  - heading: `Download Results`
  - text: `Please select results for download to a CSV file.`
  - text: `If no results are selected, up to 1,000 results will be included.`
- Adapter implication:
  - IEEE results export is a native CSV-like path distinct from citation export

### Capability: export citations in RIS

- Preconditions:
  - at least one result selected
- Citations-tab findings after selecting one result:
  - heading: `Download Citations`
  - text: `You have selected 1 citation for download.`
  - format options:
    - `Plain Text`
    - `BibTeX`
    - `RIS`
    - `RefWorks`
  - include options:
    - `Citation Only`
    - `Citation and Abstract`
- Verified download takeover:
  - selected format: `RIS`
  - selected include mode: `Citation and Abstract`
  - observed suggested file name:
    - `IEEE Xplore Citation RIS Download 2026.3.12.21.18.36.ris`
  - observed download URL:
    - `blob:https://ieeexplore.ieee.org/...`
- Adapter implication:
  - IEEE already satisfies native RIS export for selected citations
  - download capture must support blob downloads, not only HTTP file URLs
- Candidate functions:
  - `openExportDialog()`
  - `detectExportCapability()`
  - `exportNative({ scope: 'selected' })`
  - `captureDownload()`

## 8. Reusable Storage And Network Fields

### Storage

- Observed `sessionStorage`:
  - empty in the current session
- Observed `localStorage` keys:
  - `ieee_settings`
  - `ieee_settingsExpiresAt`
  - `connectId`
  - `events`
  - `getVisitorId`
  - many consent / analytics keys
- Adapter implication:
  - no WOS-style mandatory session token has been isolated yet
  - current IEEE adapter should treat storage as auxiliary, not canonical

### Network

- Verified useful endpoints:
  - `POST /rest/search`
  - `POST /rest/search/citation/format`
- Adapter implication:
  - `/rest/search` is the main candidate endpoint for result retrieval analysis
  - `/rest/search/citation/format` is the main candidate endpoint for citation export analysis

## 9. Candidate Function Mapping

- `clearInterferingUi()`
- `detectSessionState()`
- `readCurrentQuery()`
- `setCurrentQuery(query)`
- `submitSearch()`
- `readSearchSummary()`
- `readResultTitles(limit)`
- `expandAbstractByIndex(index)`
- `readResultAbstracts(limit)`
- `listFilters()`
- `applyFilters(filters)`
- `selectResultsByIndex(indices)`
- `selectAllOnPage()`
- `detectExportCapability()`
- `exportNative({ scope })`
- `captureDownload()`

## 10. Verified, Pending, And Risks

### Verified

- institutional-access session was usable
- cookie banner can interfere with automation
- abstract expansion works inline from result cards
- result export modal has separate `Results` and `Citations` modes
- RIS citation export with abstract content works for selected items
- RIS export arrives as a real browser download event

### Pending

- CSV results-download takeover has not been captured as a file artifact yet
- page-level maximum for selected citation export has not been stress-tested
- per-filter request payloads still need isolated diffs
- document-page export should be documented separately from results-page export

### Risks

- IEEE mixes anonymous, institutional, and personal-sign-in states across features
- automation must normalize blockers such as cookie banners and embedded sign-in prompts
- blob-based downloads require download-event handling instead of URL-only logic
