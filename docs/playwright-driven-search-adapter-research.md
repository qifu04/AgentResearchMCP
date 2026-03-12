# Playwright-driven Scholarly Search Adapter Research

- Research date: 2026-03-12
- Method: treat each database as an operable website first; analyze via Playwright / Playwright MCP using DOM, storage, network, URL changes, dialogs, and download events.
- Current databases with live page analysis: Web of Science, PubMed, IEEE Xplore, Scopus
- Existing local WOS deep-dive material:
  - `docs/web-of-science-advanced-search-mcp-research.md`
  - `docs/tmp-wos-export.ris`
- Per-database exploration notes:
  - `docs/pubmed-playwright-exploration.md`
  - `docs/ieee-playwright-exploration.md`
  - `docs/scopus-playwright-exploration.md`
- Unified MCP architecture and provider-contract design:
  - `docs/unified-search-mcp-server-design.md`

## Scope

The current MCP goal is intentionally small and search-centric:

1. Build a query
2. Execute a search
3. Read result titles
4. Read the first N abstracts or abstract previews
5. Enumerate and apply filters
6. Optimize the query from sample results
7. Export as much as possible into RIS, or export a native format that can be converted to RIS

This document does not try to cover every site feature. It focuses on the minimum evidence needed to implement a common search adapter layer later.

## Working Mode

From now on, the documentation should be built database by database.

The order should be:

1. Use `Web of Science` as the template database
2. Write down everything observable for WOS at page level, storage level, network level, and download level
3. Analyze `PubMed`, `IEEE`, and later databases with the same checklist
4. Only after 2 to 3 databases are documented at the same granularity, derive the common function structure

So the workflow is:

- `WOS` gives the first prior and the richest field set
- later databases verify which objects and fields are truly common
- the common interface is an output of analysis, not a starting assumption

## Per-Database Analysis Checklist

Every database should be documented with the same checklist.

1. Login and session detection
2. Query input location
3. Search trigger action
4. Result count and paging location
5. Title list object path
6. Abstract acquisition path
7. Filter groups and apply action
8. Result selection and select-all behavior
9. Export entry
10. Download takeover pattern
11. Reusable URL / storage / network fields
12. Verified items, open gaps, and risk points

## Why WOS Is the Template Database

WOS is not the simplest database, but it already exposes all four object layers that matter for the future MCP.

1. Page layer
   - `Query Preview`
   - `Search`
   - refine groups
   - `Export`
   - Session Queries
2. Storage layer
   - `localStorage["wos_sid"]`
   - `wos_search_<qid>`
   - `wos_search_hits_<qid>`
3. Network layer
   - `runQuerySearch`
   - `runQueryRefine`
4. Download layer
   - RIS browser download event

These four layers are exactly what should be searched for in every new database:

1. Page objects
2. Storage objects
3. Network objects
4. Download objects

## Evidence Template

For each observed capability, keep the same evidence format.

```md
### Capability: <name>
- Database:
- Page location:
- Operable object:
- How to obtain it:
- Important fields:
- Trigger action:
- Observable post-action changes:
- Candidate function:
- Stability:
- Verified / pending:
```

## Playwright Analysis Primitives

The goal is not to guess site internals. The goal is to make a single action and record exactly what changed.

### 1. DOM control extraction

Use this to identify the page's operable skeleton.

```ts
const controls = await page.locator(
  'button, input, select, textarea, a[href], [role="button"], [role="checkbox"], [role="radio"], [role="tab"], [role="menuitem"]'
).evaluateAll(nodes => nodes.map((el, index) => {
  const anyEl = el as HTMLElement;
  return {
    index,
    tag: anyEl.tagName.toLowerCase(),
    role: anyEl.getAttribute('role'),
    name: anyEl.getAttribute('aria-label') || anyEl.textContent?.trim() || '',
    id: anyEl.id || '',
    classes: anyEl.className || '',
    disabled: (anyEl as HTMLInputElement).disabled ?? false,
  };
}));
```

### 2. Storage capture

Use this to find session ids, query ids, local state, or cached search descriptors.

```ts
const storageState = await page.evaluate(() => ({
  url: location.href,
  title: document.title,
  local: Object.fromEntries(Object.entries(localStorage)),
  session: Object.fromEntries(Object.entries(sessionStorage)),
}));
```

### 3. Single-action network diff

Use this to identify which requests correspond to search, filter, export, or abstract expansion.

```ts
const calls: Array<{method: string; url: string; postData?: string | null}> = [];
page.on('requestfinished', request => {
  const url = request.url();
  if (!url.includes('/api/') && !url.includes('/search') && !url.includes('/export')) return;
  calls.push({
    method: request.method(),
    url,
    postData: request.postData(),
  });
});
```

The rule is: only perform one meaningful action at a time.

### 4. Download takeover

Use this to verify whether export is a real browser download, a blob download, or a server file URL.

```ts
const [download] = await Promise.all([
  page.waitForEvent('download', { timeout: 30000 }),
  triggerExport(),
]);

console.log({
  suggestedFilename: download.suggestedFilename(),
  url: download.url(),
});
```

### 5. Before/after state diff

Use this for SPA pages where URL might not be enough.

```ts
async function snapshotState(page: Page) {
  return page.evaluate(() => ({
    url: location.href,
    title: document.title,
    bodyText: document.body.innerText.slice(0, 5000),
    localKeys: Object.keys(localStorage),
  }));
}
```

### 6. Result-card sampling

Use this to quickly confirm whether titles and abstract snippets are already visible in DOM.

```ts
const items = await page.locator('article, .result-item, .List-results-items, .search-results-item').evaluateAll(nodes => {
  return nodes.slice(0, 10).map((node, idx) => {
    const root = node as HTMLElement;
    const titleEl = root.querySelector('h1, h2, h3, a[href]');
    return {
      idx,
      title: titleEl?.textContent?.trim() || '',
      text: root.innerText.slice(0, 1000),
    };
  });
});
```

## Database Status Overview

### Web of Science

- Status: strong prior already collected
- Main value as template:
  - session token capture
  - query id capture
  - refine payload structure
  - batch RIS export
  - download takeover

### PubMed

- Status: basic results-page and export-entry analysis done
- Main value:
  - proves that not every database needs private API reverse engineering
  - proves that DOM-only title/abstract capture is often sufficient
  - proves that native export format may differ from RIS

### IEEE Xplore

- Status: basic results-page, filter structure, and export modal analysis done
- Main value:
  - proves that results-page export and document-page export may differ
  - proves that cookie banners and modals can block interactions significantly
  - proves that abstract access may rely on result-card expansion

### Scopus

- Status: advanced-search, results-page, filters, abstract expansion, storage, and export-blocker analysis done
- Main value:
  - proves that anonymous search can coexist with account-gated export
  - proves that one site may separate citation export from full-text download completely
  - exposes strong internal search, facet, and abstract endpoints for later adapter design

## WOS First: Prior Information To Reuse

This section is the WOS-first prior. Later databases should be documented using the same shape.

### Login and session detection

- Page objects:
  - top `Sign In` button
  - institutional access marker such as `Peking University`
- Storage object:
  - `localStorage["wos_sid"]`
- How to analyze:
  - read DOM for institutional context
  - read localStorage for session token
- Verified:
  - `wos_sid` is directly readable from localStorage
- Candidate functions:
  - `detectSessionState()`
  - `getSessionToken()`

### Query input

- Page objects:
  - `Query Builder`
  - `Query Preview`
  - field-tag list (`TS`, `TI`, `AB`, `PY`, ...)
- How to analyze:
  - read and write `Query Preview`
  - scrape visible field-tag list
- Verified:
  - raw query can be written directly, for example `TS=(deep learning)`
- Candidate functions:
  - `readCurrentQuery()`
  - `setCurrentQuery(query)`
  - `listSupportedFieldTags()`

### Search trigger

- UI method:
  - click `Search`
- Network method:
  - `POST /api/wosnx/core/runQuerySearch?SID=<sid>`
- Important fields:
  - request body `search.query`
  - request body `retrieve.count`
  - request body `retrieve.sort`
- Verified:
  - `runQuerySearch` request and response shape already observed
- Candidate functions:
  - `submitSearch()`
  - `runSearchApi(payload)`

### Result summary and paging

- Page / state objects:
  - summary URL `/summary/<qid>/<sort>/<page>`
  - result count text
  - Session Queries history area
- Important fields:
  - `QueryID`
  - `RecordsFound`
  - `RecordsAvailable`
- Verified:
  - query id and counts are stable and useful
- Candidate functions:
  - `readSearchSummary()`
  - `readSearchHistory()`
  - `readCurrentQueryId()`

### Abstract acquisition

- DOM method:
  - result-card abstract preview / `Show more`
- API method:
  - read abstract from search response records
- Important field path:
  - `records["1"].abstract.basic.en.abstract`
- Verified:
  - API abstracts are fuller than UI preview
- Candidate functions:
  - `readResultAbstractsFromDom(limit)`
  - `readResultAbstractsFromApi(limit)`
- Recommendation:
  - prefer API path for WOS when available

### Filters

- Page objects:
  - refine groups such as `Publication Years`, `Document Types`, `Open Access`
- UI method:
  - checkbox + `Refine` button
- API method:
  - `POST /api/wosnx/core/runQueryRefine?SID=<sid>`
- Important fields:
  - `qid`
  - `refines: [{ index, value[] }]`
  - known indexes: `PY`, `DT`, `OA`
- Verified:
  - filter payloads already captured
- Candidate functions:
  - `listFilters()`
  - `applyFilters(filters)`
  - `readFilterState()`
- Recommendation:
  - use `index/value[]` as canonical WOS filter representation

### Export and download

- Page objects:
  - `Export` menu
  - `RIS (other reference software)` option
- Download method:
  - browser download event
- Important fields:
  - suggested filename
  - selected range
- Verified:
  - WOS RIS export works
  - batch size observed as `1000`
- Candidate functions:
  - `openExportDialog()`
  - `exportRis(range)`
  - `captureDownload()`

## Web of Science Full Template Checklist

This is the first database written in the target implementation-oriented format.

The purpose of this section is not to repeat every observation from the WOS deep-dive document. The purpose is to convert those observations into a template that later databases can imitate.

### 1. Login and session detection

#### Capability: detect institutional session

- Database:
  - WOS
- Page location:
  - top navigation
  - footer / side area where institutional access is shown
- Operable object:
  - `Sign In`
  - institution text such as `Peking University`
  - `localStorage["wos_sid"]`
- How to obtain it:
  - DOM check for institution text
  - localStorage read for session token
- Important fields:
  - `wos_sid`
  - institution display name
  - presence of personal sign-in controls
- Trigger action:
  - none; read-only
- Observable post-action changes:
  - none
- Candidate function:
  - `detectSessionState()`
- Stability:
  - high
- Verified / pending:
  - verified

#### WOS implementation note

The first WOS adapter call should almost always read:

```ts
const sessionInfo = await page.evaluate(() => ({
  sid: localStorage.getItem("wos_sid"),
  title: document.title,
  url: location.href,
  bodyText: document.body.innerText,
}));
```

This is enough to decide:

- whether a usable session exists
- whether institutional access is present
- whether later API calls can reuse browser session state

### 2. Query composition

#### Capability: set raw query

- Database:
  - WOS
- Page location:
  - `Query Builder` tab
  - `Query Preview` textbox
- Operable object:
  - `Query Preview`
- How to obtain it:
  - read or fill the textbox directly
- Important fields:
  - raw query text such as `TS=(deep learning)`
- Trigger action:
  - fill textbox
- Observable post-action changes:
  - textbox value changes
- Candidate function:
  - `readCurrentQuery()`
  - `setCurrentQuery(query)`
- Stability:
  - high
- Verified / pending:
  - verified

#### Capability: enumerate supported field tags

- Database:
  - WOS
- Page location:
  - visible field-tag list under `Search tags and booleans`
- Operable object:
  - list items such as `TS=Topic`, `TI=Title`, `AB=Abstract`, `PY=Year Published`
- How to obtain it:
  - scrape visible list text
- Important fields:
  - field code
  - field label
- Trigger action:
  - none; read-only
- Observable post-action changes:
  - none
- Candidate function:
  - `listSupportedFieldTags()`
- Stability:
  - high
- Verified / pending:
  - verified

#### WOS implementation note

For deterministic automation, WOS should prefer raw query entry over assisted builder typing.

The assisted builder is still useful as a page-analysis source because it exposes:

- supported fields
- exact search toggle
- date-range controls

### 3. Search submission

#### Capability: submit search from page

- Database:
  - WOS
- Page location:
  - `Search` button beside `Query Preview`
- Operable object:
  - `Search`
- How to obtain it:
  - DOM click
- Important fields:
  - current query text
- Trigger action:
  - click `Search`
- Observable post-action changes:
  - URL moves to `/wos/woscc/summary/<qid>/<sort>/<page>`
  - session history gains a new query set
- Candidate function:
  - `submitSearch()`
- Stability:
  - high
- Verified / pending:
  - verified

#### Capability: submit search through observed internal API

- Database:
  - WOS
- Page location:
  - network layer
- Operable object:
  - `POST /api/wosnx/core/runQuerySearch?SID=<sid>`
- How to obtain it:
  - inspect request body on search action
- Important fields:
  - `product`
  - `searchMode`
  - `search.query`
  - `search.options`
  - `retrieve.count`
  - `retrieve.sort`
  - `retrieve.locale`
- Trigger action:
  - search submission
- Observable post-action changes:
  - response includes `searchInfo`, `records`, `analyze`
- Candidate function:
  - `runSearchApi(payload)`
- Stability:
  - medium to high, but session-bound
- Verified / pending:
  - verified

#### WOS implementation note

The adapter should support both modes:

1. browser click path
2. browser-session-backed API path

The browser click path is the safe fallback. The API path is the preferred high-throughput path.

### 4. Result summary, query id, and paging

#### Capability: read summary state

- Database:
  - WOS
- Page location:
  - summary URL
  - result page header
  - internal search response
- Operable object:
  - current summary page
  - `searchInfo`
- How to obtain it:
  - read URL for `qid`, sort, and page
  - read response payload for counts
- Important fields:
  - `QueryID`
  - `RecordsFound`
  - `RecordsAvailable`
  - URL page number
  - URL sort field
- Trigger action:
  - none; read after search or refine
- Observable post-action changes:
  - query id changes on new search
  - count changes after refine
- Candidate function:
  - `readSearchSummary()`
  - `readCurrentQueryId()`
- Stability:
  - high
- Verified / pending:
  - verified

#### WOS implementation note

Persist these fields in adapter state after every successful search or refine:

```ts
type WosSearchState = {
  sid: string | null;
  queryId: string | null;
  queryText: string | null;
  sort: string | null;
  page: number | null;
  recordsFound: number | null;
  recordsAvailable: number | null;
};
```

`RecordsAvailable` should be treated as an operational cap until disproven for a specific flow.

### 5. Session query history

#### Capability: read session query sets

- Database:
  - WOS
- Page location:
  - `Session Queries`
- Operable object:
  - query-set rows
  - count links
  - `Add to query`
  - `Copy query link`
- How to obtain it:
  - DOM scrape on Advanced Search page
- Important fields:
  - set number
  - query label
  - result count
  - summary link
- Trigger action:
  - none; read-only unless combining sets
- Observable post-action changes:
  - grows after each search
- Candidate function:
  - `readSearchHistory()`
- Stability:
  - high
- Verified / pending:
  - verified

#### WOS implementation note

Even if the first MCP version does not expose full search-history operations, it should still read and persist these query-set descriptors because they are useful for:

- debugging
- later set-combination support
- reconstructing user flow

### 6. Abstract acquisition

#### Capability: read abstracts from API-backed record payload

- Database:
  - WOS
- Page location:
  - internal search response
- Operable object:
  - `records`
- How to obtain it:
  - re-run current query with small `retrieve.count`
  - read abstract field from response
- Important fields:
  - `records["1"].abstract.basic.en.abstract`
  - title fields from the same record
- Trigger action:
  - either search or refine request replay
- Observable post-action changes:
  - none on page if done purely via API replay
- Candidate function:
  - `readResultAbstractsFromApi(limit)`
- Stability:
  - high once session is valid
- Verified / pending:
  - verified

#### Capability: reconstruct current refined query from storage

- Database:
  - WOS
- Page location:
  - localStorage
- Operable object:
  - `wos_search_<qid>`
  - `wos_search_hits_<qid>`
- How to obtain it:
  - read localStorage by current query id
- Important fields:
  - `query`
  - `options`
  - `refines`
  - `noRefineParent`
- Trigger action:
  - none; read-only
- Observable post-action changes:
  - storage entry changes when query or refine state changes
- Candidate function:
  - `readStoredSearchState(queryId)`
- Stability:
  - high
- Verified / pending:
  - verified

#### WOS implementation note

This storage-backed replay path is one of the most important WOS findings.

It means the adapter can:

1. read `qid` from the URL
2. read `wos_search_<qid>` from localStorage
3. replay the current refined state
4. extract titles and abstracts from response records

This is much more stable than trying to expand each visible result card one by one.

### 7. Filters and refine operations

#### Capability: enumerate filter groups from page

- Database:
  - WOS
- Page location:
  - left refine panel
- Operable object:
  - groups such as `Quick Filters`, `Publication Years`, `Document Types`, `Open Access`
- How to obtain it:
  - DOM scrape of refine panel group titles
- Important fields:
  - group label
  - visible option label
  - visible count text
- Trigger action:
  - none; read-only
- Observable post-action changes:
  - counts and checked states change after refine
- Candidate function:
  - `listFilters()`
- Stability:
  - medium to high
- Verified / pending:
  - partially verified; group presence verified, full option extraction still expandable

#### Capability: apply refine through page controls

- Database:
  - WOS
- Page location:
  - left refine panel
- Operable object:
  - checkbox
  - group `Refine` button
- How to obtain it:
  - accessibility-role targeting
- Important fields:
  - group name
  - option label
- Trigger action:
  - `check({ force: true })`
  - click `Refine`
- Observable post-action changes:
  - new summary state
  - query history grows
  - storage state updates
- Candidate function:
  - `applyFiltersViaUi(filters)`
- Stability:
  - medium
- Verified / pending:
  - verified for `PY=2025`, `DT=REVIEW`, `OA=OPEN ACCESS`

#### Capability: apply refine through observed API

- Database:
  - WOS
- Page location:
  - network layer
- Operable object:
  - `POST /api/wosnx/core/runQueryRefine?SID=<sid>`
- How to obtain it:
  - capture payload after a single refine action
- Important fields:
  - `qid`
  - `refines`
  - known examples:
    - `{ "index": "PY", "value": ["2025"] }`
    - `{ "index": "DT", "value": ["REVIEW"] }`
    - `{ "index": "OA", "value": ["OPEN ACCESS"] }`
- Trigger action:
  - refine submission
- Observable post-action changes:
  - new query state and counts
- Candidate function:
  - `applyFilters(filters)`
- Stability:
  - high once session and qid are valid
- Verified / pending:
  - verified

#### WOS implementation note

For WOS, the canonical filter representation should not be raw UI labels.

It should be:

```ts
type WosRefine = {
  index: string;
  value: string[];
};
```

This is the first strong signal for how later provider adapters should separate:

- provider-native filter key
- human-readable label

### 8. Result selection

#### Capability: export-scope selection by range rather than page only

- Database:
  - WOS
- Page location:
  - export modal
- Operable object:
  - `All records on page`
  - `Records from: <start> to <end>`
- How to obtain it:
  - open export modal and inspect controls
- Important fields:
  - range start
  - range end
  - content selection
- Trigger action:
  - choose range option
  - submit export
- Observable post-action changes:
  - browser download
- Candidate function:
  - `setExportRange(start, end)`
- Stability:
  - high
- Verified / pending:
  - verified

#### WOS implementation note

This is operationally important because the user goal is not “current page only”.

For WOS, the first real bulk-export strategy should be:

1. keep the current query and refine state
2. export `1-1000`
3. export `1001-2000`
4. continue until provider limit or result cap is reached

### 9. Export and download

#### Capability: detect exportable formats

- Database:
  - WOS
- Page location:
  - `Export` menu
- Operable object:
  - export menu items
- How to obtain it:
  - click `Export` and read menu text
- Important fields:
  - format label
- Trigger action:
  - open menu
- Observable post-action changes:
  - export modal opens after format selection
- Candidate function:
  - `detectExportCapability()`
- Stability:
  - high
- Verified / pending:
  - verified

#### Capability: export RIS in batches

- Database:
  - WOS
- Page location:
  - RIS export modal
- Operable object:
  - format choice
  - range controls
  - record-content choice
  - confirm button
- How to obtain it:
  - page interaction + download event
- Important fields:
  - format = RIS
  - range start / end
  - content option
  - batch cap = `1000`
- Trigger action:
  - click export confirm
- Observable post-action changes:
  - browser download event
  - suggested filename such as `savedrecs.ris`
- Candidate function:
  - `exportNative({ scope: "range", start, end })`
  - `captureDownload()`
- Stability:
  - high
- Verified / pending:
  - verified

#### WOS implementation note

The WOS adapter should expose export as a range-first operation.

Suggested internal export request shape:

```ts
type WosExportRequest = {
  format: "ris";
  start: number;
  end: number;
  content: "author-title-source" | "author-title-source-abstract" | "full-record" | "custom";
};
```

### 10. Download takeover

#### Capability: save exported file under adapter-controlled path

- Database:
  - WOS
- Page location:
  - browser download subsystem
- Operable object:
  - Playwright download event
- How to obtain it:
  - `page.waitForEvent("download")`
- Important fields:
  - suggested filename
  - browser download URL
  - chosen save path
- Trigger action:
  - export confirmation click
- Observable post-action changes:
  - local file written
- Candidate function:
  - `captureDownload(savePath)`
- Stability:
  - high
- Verified / pending:
  - verified

#### WOS implementation note

The adapter should not rely on scraping a visible download link.

For WOS, download takeover should be treated as event-driven, not link-driven.

### 11. Reusable fields to persist

For WOS, these fields are worth persisting across almost every adapter operation:

```ts
type WosPersistentFields = {
  sid: string | null;
  institutionAccess: string | null;
  currentQueryText: string | null;
  currentQueryId: string | null;
  currentSort: string | null;
  currentPage: number | null;
  recordsFound: number | null;
  recordsAvailable: number | null;
  currentRefines: Array<{ index: string; value: string[] }>;
  storedSearchKey: string | null;
  lastExportRange?: { start: number; end: number } | null;
};
```

These are the WOS fields most likely to map later to cross-database abstractions:

- session token
- query text
- query id
- total count
- current page
- current filters
- export cursor

### 12. Risks and pending items

#### Known risks

- session expiry invalidates internal API calls
- modals and popups may intercept clicks
- some result access appears capped at `100000`
- export is capped per batch at `1000`
- pure UI-only abstract expansion is less stable than API replay

#### Pending WOS items still worth documenting later

- per-result selection / marked-list behavior in the same card format
- all export content modes mapped cleanly to internal names
- whether there is a stable full-record-detail API worth wrapping
- whether `RecordsAvailable = 100000` is universal or query-dependent

#### WOS-first conclusion

WOS already provides enough evidence to define the first implementation skeleton.

What later databases need to match is not WOS-specific behavior. What they need to match is WOS's documentation shape:

1. page object
2. storage object
3. network object
4. download object
5. persistable fields
6. candidate function mapping

## WOS Core Capability Mapping

This section compresses the WOS findings into a build-facing map.

### Goal: build query

- Preferred method:
  - write raw query into `Query Preview`
- Fallback method:
  - use assisted builder UI
- Key objects:
  - `Query Preview`
  - visible field-tag list
- Key fields:
  - raw query text
  - supported field tags
- Candidate functions:
  - `setCurrentQuery(query)`
  - `listSupportedFieldTags()`

### Goal: run search

- Preferred method:
  - replay observed `runQuerySearch` through browser-backed session
- Fallback method:
  - click page `Search`
- Key objects:
  - `POST /api/wosnx/core/runQuerySearch?SID=<sid>`
  - `Search` button
- Key fields:
  - `sid`
  - `search.query`
  - `retrieve.count`
  - `retrieve.sort`
- Candidate functions:
  - `submitSearch()`
  - `runSearchApi(payload)`

### Goal: read result titles

- Preferred method:
  - read titles from API response records
- Fallback method:
  - scrape visible result cards from DOM
- Key objects:
  - `records`
  - result list items
- Key fields:
  - record title
  - record link / uid if available
- Candidate functions:
  - `readResultTitles(limit)`

### Goal: read first N abstracts

- Preferred method:
  - read `records[*].abstract.basic.en.abstract` from replayed current query state
- Fallback method:
  - use result-card preview or `Show more`
- Key objects:
  - `wos_search_<qid>`
  - `records`
- Key fields:
  - `query`
  - `refines`
  - abstract HTML snippet
- Candidate functions:
  - `readStoredSearchState(queryId)`
  - `readResultAbstracts(limit)`

### Goal: enumerate filters

- Preferred method:
  - scrape refine panel labels and visible options
- Fallback method:
  - infer available filter keys from known successful payloads
- Key objects:
  - left refine panel
  - `runQueryRefine` payloads
- Key fields:
  - group label
  - provider-native `index`
  - provider-native `value[]`
- Candidate functions:
  - `listFilters()`

### Goal: apply filters

- Preferred method:
  - call observed `runQueryRefine` with `qid + refines`
- Fallback method:
  - checkbox + `Refine` button in UI
- Key objects:
  - `POST /api/wosnx/core/runQueryRefine?SID=<sid>`
- Key fields:
  - `qid`
  - `refines`
- Candidate functions:
  - `applyFilters(filters)`

### Goal: optimize query

- Preferred method:
  - combine `readSearchSummary + readResultTitles + readResultAbstracts + current refines`
- Fallback method:
  - none; this is an LLM reasoning layer above page analysis
- Key objects:
  - summary payload
  - sampled records
  - storage-backed query state
- Key fields:
  - result count
  - sample titles
  - sample abstracts
  - current filters
- Candidate functions:
  - `optimizeQuery(input)` as an orchestration layer, not a provider primitive

### Goal: export as much as possible to RIS

- Preferred method:
  - open RIS export and iterate by explicit range batches
- Fallback method:
  - export current page only when range export is blocked
- Key objects:
  - `RIS (other reference software)`
  - range selector
  - export confirm button
  - browser download event
- Key fields:
  - `start`
  - `end`
  - batch cap `1000`
  - saved filename
- Candidate functions:
  - `detectExportCapability()`
  - `exportNative({ scope: "range", start, end })`
  - `captureDownload(savePath)`

## WOS Minimum Artifact Set

For every serious WOS analysis or execution run, the adapter should try to save the following artifacts:

1. `storage.json`
   - at least `wos_sid`, `wos_search_<qid>`, and related search keys
2. `query-state.json`
   - normalized current query, qid, refines, sort, page
3. `network-search.json`
   - the last successful `runQuerySearch` request and response summary
4. `network-refine.json`
   - the last successful `runQueryRefine` request
5. `results-sample.json`
   - first N titles and abstracts extracted
6. `exports/`
   - downloaded RIS batches

This artifact discipline will make later debugging and cross-database comparison much easier than trying to reconstruct state from logs alone.

## PubMed: Initial Page-Level Findings

These are early findings written using the WOS checklist, but at a lighter level.

Detailed note:

- `docs/pubmed-playwright-exploration.md`

### Login and session detection

- Page objects:
  - top `Log in` link
- Verified:
  - login is optional for search and export of `.nbib`
- Candidate functions:
  - `detectSessionState()`

### Query input

- Page objects:
  - `Field Selector`
  - `Search Term`
  - `Query box`
- Verified:
  - builder and free query box are both present on Advanced Search page
- Candidate functions:
  - `setCurrentQuery(query)`
  - `appendQueryTerm(term, field, operator)`
  - `listSupportedFieldTags()`

### Search trigger

- UI method:
  - click `Search`
- URL method:
  - read `?term=...`
- Verified:
  - searching `deep learning` produced a URL with `term=deep+learning`
- Candidate functions:
  - `submitSearch()`
  - `readSearchUrl()`

### Result summary and titles

- Page objects:
  - heading like `128,804 results`
  - page spinner `Page 1 of 12,881`
  - result articles
- Verified:
  - DOM already contains title links and result metadata
  - page-size options observed: `10`, `20`, `50`, `100`, `200`
  - sort options observed: `Best match`, `Most recent`, `Publication date`, `First author`, `Journal`
- Candidate functions:
  - `readSearchSummary()`
  - `readResultTitles(limit)`

### Abstract acquisition

- DOM method:
  - read abstract snippet directly from result article text
- Verified:
  - abstract previews are visible directly in the result list
  - PubMed currently fits the cleanest `dom-preview` mode among the observed providers
- Candidate functions:
  - `readResultAbstractsFromDom(limit)`
- Pending:
  - full-abstract acquisition path not yet separately documented

### Filters

- Page objects:
  - `Publication date`
  - `Text availability`
  - `Article type`
  - `Additional filters`
- Verified:
  - the filter tree is clean and easy to map from DOM
- Candidate functions:
  - `listFilters()`
  - `applyFilters(filters)`
- Pending:
  - per-filter URL or network diff still needs action-by-action recording

### Selection and export

- Page objects:
  - per-result checkbox
  - `Send to -> Citation manager`
  - `Selection:` combobox
- Verified:
  - `Selection:` offers:
    - `All results on this page`
    - `All results`
    - `Selection`
  - `Create file` triggers a real browser download
  - observed file name was like `pubmed-deeplearni-set.nbib`
  - observed download URL was `https://pubmed.ncbi.nlm.nih.gov/results-export-ids/`
- Candidate functions:
  - `selectResultsByIndex(indices)`
  - `setExportSelection(scope)`
  - `exportNative()`
  - `captureDownload()`
- Note:
  - native export is `.nbib`, not RIS

## IEEE Xplore: Initial Page-Level Findings

These are early findings written using the same WOS-first checklist.

Detailed note:

- `docs/ieee-playwright-exploration.md`

### Login and session detection

- Page objects:
  - `Personal Sign In`
  - `Access provided by: ...`
  - sign-in modal for certain features
- Verified:
  - institutional access banner is visible
  - some features trigger a personal sign-in modal
- Candidate functions:
  - `detectSessionState()`
  - `requiresInteractiveLogin(capability)`

### Query input

- Page objects:
  - top search box
  - `ADVANCED SEARCH` link
- URL field:
  - `queryText`
- Verified:
  - result URL includes `queryText=deep learning`
- Candidate functions:
  - `setCurrentQuery(query)`
  - `readCurrentQuery()`

### Result summary and titles

- Page objects:
  - heading like `Showing 1-25 of 378,904 results`
  - result cards
  - page buttons
- Verified:
  - titles are directly readable from DOM
  - page size observed as `25`
- Candidate functions:
  - `readSearchSummary()`
  - `readResultTitles(limit)`

### Abstract acquisition

- Page objects:
  - per-result `Abstract` button
- Verified:
  - every observed result card exposed an `Abstract` expand control
  - inline abstract content appeared directly in DOM after expansion
  - expanded inline content is truncated and points to detail page via `Show More`
- Candidate functions:
  - `expandAbstractByIndex(index)`
  - `readResultAbstractsFromDom(limit)`

### Filters

- Page objects:
  - quick content-type filters near result heading
  - left filter groups: `Year`, `Author`, `Affiliation`, `Publication Title`, `Publisher`, etc.
  - `Show`: `All Results`, `Subscribed Content`, `Open Access Only`
- Verified:
  - `Year` supports `Range` and `Single Year`
  - range filter includes `Apply`
- Candidate functions:
  - `listFilters()`
  - `applyFilters(filters)`
- Pending:
  - request-level filter payloads not yet captured

### Selection and export

- Page objects:
  - result checkbox
  - `Select All on Page`
  - result-page `Export`
- Verified:
  - result-page export opens a modal with tabs:
    - `Results`
    - `Citations`
    - `To Collabratec`
    - `My Research Projects`
  - `Results` tab is a results-download path and states that if no results are selected, up to `1,000` results will be included
  - after selecting a result, `Citations` tab enables:
    - `Plain Text`
    - `BibTeX`
    - `RIS`
    - `RefWorks`
  - `Citations` tab also supports:
    - `Citation Only`
    - `Citation and Abstract`
  - RIS download was verified through Playwright download capture
- Candidate functions:
  - `selectResultsByIndex(indices)`
  - `selectAllOnPage()`
  - `openExportDialog()`
  - `exportNative()`
- Additional observed network endpoints:
  - `POST /rest/search`
  - `POST /rest/search/citation/format`
- Pending:
  - document-page export should be analyzed separately from results-page export

## Scopus: Initial Page-Level Findings

These are early findings written using the same WOS-first checklist.

Detailed note:

- `docs/scopus-playwright-exploration.md`

### Login and session detection

- Page objects:
  - anonymous advanced-search page
  - export popover requiring account login
- Verified:
  - advanced search and result browsing work without personal sign-in
  - export is blocked for anonymous users and requires a Scopus account
- Candidate functions:
  - `detectSessionState()`
  - `requiresInteractiveLogin(capability)`

### Query input

- Page objects:
  - advanced-search raw-query textbox
  - `Search`
- Visible operators:
  - `AND`
  - `OR`
  - `AND NOT`
  - `PRE/`
  - `W/`
- Verified:
  - raw advanced query entry works directly
  - example query `TITLE-ABS-KEY("deep learning")` executed successfully
- Candidate functions:
  - `setCurrentQuery(query)`
  - `readCurrentQuery()`
  - `listSupportedFieldTags()`

### Result summary and titles

- Page objects:
  - heading like `Found 689,636 documents` in the Chinese locale UI
  - table range heading showing `1 to 10` out of `2000` visible results
  - tabular result rows
- Verified:
  - result rows directly contain titles, authors, source titles, year, citation counts, and selection checkboxes
  - page-size options observed: `10`, `20`, `50`, `100`, `200`
- Candidate functions:
  - `readSearchSummary()`
  - `readResultTitles(limit)`

### Abstract acquisition

- Page objects:
  - per-row `View abstract`
  - page-level `Show all abstracts`
- Verified:
  - clicking `View abstract` expands inline abstract content directly in the DOM
  - one observed control used a stable-looking test id: `button-abstract-collapsible-panel-0`
- Candidate functions:
  - `expandAbstractByIndex(index)`
  - `expandAllVisibleAbstracts()`
  - `readResultAbstractsFromDom(limit)`

### Filters

- Page objects:
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
- Verified:
  - filter tree is rich and DOM-readable
  - `Year` supports `Range`, `Single`, slider controls, and `From/To`
- Candidate functions:
  - `listFilters()`
  - `applyFilters(filters)`
- Additional observed network endpoints:
  - `POST /api/documents/search`
  - `POST /api/documents/search/facets`
  - `POST /gateway/documents/abstracts/retrieve`

### Selection and export

- Page objects:
  - row checkboxes
  - top `Select all`
  - top `Export`
  - top `Download`
- Verified:
  - row selection exists directly on results page
  - `Export` shows a login-required popover for anonymous users
  - `Download` opens a separate document-download-manager dialog requiring a browser extension
- Candidate functions:
  - `selectResultsByIndex(indices)`
  - `selectAllOnPage()`
  - `detectExportCapability()`
- Pending:
  - authenticated export behavior and native citation format remain undocumented

## Common Findings That Already Survive Across Databases

These commonalities are already visible even without official docs.

### Common point 1: every database has a current-query host

- WOS: `Query Preview`
- PubMed: `Query box` or URL `term=`
- IEEE: main query box or URL `queryText=`
- Scopus: advanced-search raw query textbox or result URL `s=`

Common functions implied:

- `readCurrentQuery()`
- `setCurrentQuery(query)`

### Common point 2: every database has the result summary triad

The triad is:

1. total count
2. page position
3. result list

Common functions implied:

- `readSearchSummary()`
- `readPageInfo()`
- `readResultTitles(limit)`

### Common point 3: every database has filter groups

Even if the back-end implementation differs, the page abstraction is very similar.

Common functions implied:

- `listFilters()`
- `applyFilters(filters)`
- `readFilterState()`

### Common point 4: every database has export, but native format differs

- WOS: native RIS
- PubMed: native NBIB
- IEEE results page: result export and citation export are separate; citation export supports native RIS
- Scopus anonymous session: export is visible but blocked by account login

Common functions implied:

- `detectExportCapability()`
- `exportNative()`
- `convertToRis()`

Additional implication:

- export capability cannot be modeled only as `format`; it also needs a login/blocker state

### Common point 5: abstract acquisition has a small number of stable modes

Observed modes:

- `dom-preview`
- `dom-expand`
- `api-direct`

Common functions implied:

- `readResultAbstracts(limit)`
- provider-specific fallback inside adapter

### Common point 6: some providers expose directly useful internal search endpoints

- WOS:
  - `runQuerySearch`
  - `runQueryRefine`
- IEEE:
  - `/rest/search`
  - `/rest/search/citation/format`
- Scopus:
  - `/api/documents/search`
  - `/api/documents/search/facets`
  - `/gateway/documents/abstracts/retrieve`

Common implication:

- the adapter should preserve provider-native request/response objects in `raw` fields instead of flattening too early

## Candidate Function Structure

The common interface should be derived from the analysis above.

```ts
export type ProviderId = 'wos' | 'pubmed' | 'ieee' | 'scopus';

export interface SessionState {
  provider: ProviderId;
  authenticated: boolean;
  institutionAccess?: string | null;
  requiresInteractiveLogin?: boolean;
  sessionToken?: string | null;
  raw?: unknown;
}

export interface SearchSummary {
  provider: ProviderId;
  query: string;
  totalResultsText?: string | null;
  totalResults?: number | null;
  currentPage?: number | null;
  pageSize?: number | null;
  totalPages?: number | null;
  queryId?: string | null;
  raw?: unknown;
}

export interface ResultItem {
  provider: ProviderId;
  indexOnPage: number;
  title: string;
  href?: string | null;
  authorsText?: string | null;
  sourceText?: string | null;
  yearText?: string | null;
  abstractPreview?: string | null;
  selectable?: boolean;
  raw?: unknown;
}

export interface FilterOption {
  value: string;
  label: string;
  countText?: string | null;
}

export interface FilterGroup {
  key: string;
  label: string;
  type: 'checkbox' | 'radio' | 'range' | 'unknown';
  options?: FilterOption[];
  raw?: unknown;
}

export interface ExportCapability {
  nativeFormat: 'ris' | 'nbib' | 'csv' | 'unknown';
  maxBatch?: number | null;
  supportsAllResults?: boolean;
  supportsSelected?: boolean;
  requiresInteractiveLogin?: boolean;
  blockingReason?: string | null;
  raw?: unknown;
}

export interface SearchAdapter {
  detectSessionState(): Promise<SessionState>;
  readCurrentQuery(): Promise<string | null>;
  setCurrentQuery(query: string): Promise<void>;
  submitSearch(): Promise<SearchSummary>;
  readSearchSummary(): Promise<SearchSummary>;
  readResultTitles(limit: number): Promise<ResultItem[]>;
  readResultAbstracts(limit: number): Promise<ResultItem[]>;
  listFilters(): Promise<FilterGroup[]>;
  applyFilters(input: Record<string, unknown>): Promise<SearchSummary>;
  selectResultsByIndex(indices: number[]): Promise<void>;
  clearSelection(): Promise<void>;
  detectExportCapability(): Promise<ExportCapability>;
  exportNative(input: { scope: 'page' | 'all' | 'selected' | 'range'; start?: number; end?: number }): Promise<{ path?: string; format: string }>;
}
```

## Provider Capability Descriptor

The adapter should also advertise what it can do before the MCP calls any action.

```ts
export interface ProviderCapabilities {
  provider: ProviderId;
  queryMode: {
    rawEditor: boolean;
    builderUi: boolean;
    urlQueryParam: boolean;
  };
  abstracts: {
    mode: 'dom-preview' | 'dom-expand' | 'api-direct' | 'mixed';
  };
  filters: {
    available: boolean;
    structuredApiObserved: boolean;
  };
  export: {
    nativeRis: boolean;
    nativeNbib: boolean;
    nativeCsv: boolean;
    batchMax?: number | null;
    requiresLoginForExport?: boolean;
  };
  selection: {
    itemCheckbox: boolean;
    selectAllOnPage: boolean;
    allResultsScopeObserved: boolean;
  };
}
```

## Multi-Agent Isolation Design

Login flow is not implemented yet, but the architecture should reserve it now.

Recommended isolation rules from day one:

1. one browser context per agent / task / provider session
2. one storage snapshot per context
3. one download directory per context
4. one artifacts directory per context
5. no cookie or localStorage sharing unless explicitly approved

Suggested artifact layout:

```text
.artifacts/
  wos/
    <session-id>/
      dom-snapshot.md
      storage.json
      network.json
      exports/
  pubmed/
    <session-id>/
      dom-snapshot.md
      storage.json
      network.json
      exports/
  ieee/
    <session-id>/
      dom-snapshot.md
      storage.json
      network.json
      exports/
  scopus/
    <session-id>/
      dom-snapshot.md
      storage.json
      network.json
      exports/
```

This prevents:

- mixed search state across agents
- mixed downloads across tasks
- shared cookies by accident
- provider contamination between contexts

## Current Gaps

The document should stay honest about what is still missing.

- PubMed per-filter URL or request diff is not yet documented action by action
- IEEE results-download CSV takeover has not yet been captured as a saved artifact
- Scopus authenticated export flow, native citation format, and batch limits are still blocked by missing login handling
- Scopus `Show all abstracts` bulk-expansion behavior has not yet been diffed action by action
- WOS per-result selection and marked-list flows are not yet written in the same structured format as search and export
- WOS and IEEE both have blockers such as cookie banners or modals that should be normalized into a shared `clearInterferingUi()` routine later

## Recommended Next Documentation Order

The best order now is still database by database, with WOS as the reference shape.

1. normalize PubMed, IEEE, and Scopus into the same full `Capability` template depth already used for WOS
2. capture action-by-action diffs for PubMed filter clicks
3. capture authenticated Scopus export behavior when login handling exists
4. only then add OpenAlex / ScienceDirect / other databases

The reason is simple:

- if the first 4 databases are documented at the same resolution, the common interface becomes much easier to derive
- if databases are documented in different styles, the later implementation will be inconsistent

## Current Conclusion

At this stage, the most important thing is still not to collect more providers immediately.

The most important thing is to standardize the evidence shape per database:

1. where the page object is
2. how to read or trigger it
3. which field is worth persisting
4. which function it maps to

This file should therefore be treated as the first cross-database evidence document, with `WOS` as the prior template and `PubMed`, `IEEE Xplore`, and `Scopus` now supplying the first cross-provider comparison layer.

