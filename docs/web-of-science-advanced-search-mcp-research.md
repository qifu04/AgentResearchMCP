# Web of Science Advanced Search MCP Research

## Scope

- Target page: [Web of Science Core Collection Advanced Search](https://webofscience.clarivate.cn/wos/woscc/advanced-search)
- Research date: 2026-03-12
- Access method used in this research: Playwright MCP + in-page observation
- Supporting help pages:
  - [Advanced Search Query Builder](https://webofscience.zendesk.com/hc/en-us/articles/20130361503249-Advanced-Search-Query-Builder)
  - [Search Operators](https://webofscience.zendesk.com/hc/en-us/articles/20016122409105-Search-Operators)
  - [Search Rules](https://webofscience.zendesk.com/hc/en-us/articles/25350084904721-Search-Rules)

## Key Findings At A Glance

- The page is a client-side app with modal interruptions on first load: cookie banner and in-app guide.
- Search works without a personal sign-in if institutional access is active. In this session, institutional access was visible and personal sign-in remained `false`.
- The main search execution endpoint observed from the browser is `POST /api/wosnx/core/runQuerySearch?SID=...`.
- The session identifier is stored in browser storage as `localStorage["wos_sid"]`.
- Query Builder supports both assisted query construction and direct raw query editing.
- Search syntax rules depend on lemmatization, exact search, quotation marks, wildcards, and operator precedence.
- Results larger than 100,000 appear capped for interactive retrieval. This is an inference from:
  - API response: `RecordsFound = 549235`, `RecordsAvailable = 100000`
  - UI pagination: `2000` pages x `50` per page = `100000`
- Excel export is limited to `1000` records per batch.

## Access And Session Context

- Observed landing title after load: `Advanced search - Web of Science Core Collection`
- The initial redirect passes through a sessionized URL, then settles on `/wos/woscc/advanced-search`.
- The session ID is stored in local storage:

```text
localStorage["wos_sid"] = "USW2EC0CB8B9zYl4d0IoigfCZx1lz"
```

- Important implication:
  - A browser-based MCP can reuse the browser session directly.
  - A hybrid MCP can read `wos_sid` from the authenticated Playwright context and then call internal APIs with the same cookies/session.

## UI Structure On Advanced Search

## Primary areas

- Search mode tabs:
  - `DOCUMENTS`
  - `RESEARCHERS`
- Search page sub-tabs:
  - `FIELDED SEARCH`
  - `QUERY BUILDER`
  - `CITED REFERENCES`
  - `STRUCTURE`
- Database area:
  - `Search in: Web of Science Core Collection`
  - `Editions: All`
- Query Builder area:
  - Search field dropdown
  - Assisted term input
  - `Add to query`
  - `More options` -> `Exact search`
  - `Query Preview` editor
  - `Add date range`
  - `Search`
  - `Session Queries`

## Observed search field dropdown options

These are the assisted field options exposed by the Query Builder dropdown:

- All Fields
- Topic
- Title
- Author
- Publication Titles
- Year Published
- Affiliation
- Funding Agency
- Publisher
- Publication Date
- Abstract
- Accession Number
- Address
- Author Identifiers
- Author Keywords
- Conference
- Document Type
- DOI
- Editor
- Grant Number
- Group Author
- Keyword Plus(R)
- Language
- PubMed ID
- Web of Science Categories

## Observed editions / collections list

Default collection selection is `All`. The observed selectable editions were:

- Science Citation Index Expanded (`SCI-EXPANDED`) -- 1900-present
- Social Sciences Citation Index (`SSCI`) -- 1983-present
- Arts & Humanities Citation Index (`AHCI`) -- 1983-present
- Conference Proceedings Citation Index - Science (`CPCI-S`) -- 1998-present
- Conference Proceedings Citation Index - Social Science & Humanities (`CPCI-SSH`) -- 1998-present
- Emerging Sources Citation Index (`ESCI`) -- 2021-present
- Current Chemical Reactions (`CCR-EXPANDED`) -- 1985-present
- Index Chemicus (`IC`) -- 1993-present

## Date Range Controls

Observed date filters under `Add date range`:

- Date dimensions:
  - `Publication Date`
  - `Index Date`
- Presets:
  - `All years (1900 - 2026)`
  - `Last 5 years`
  - `Current week`
  - `Last 2 weeks`
  - `Last 4 weeks`
  - `Year to date`
  - `Custom`
- Custom mode exposes two date inputs in `YYYY-MM-DD` format.

## Query Builder Behavior

## Assisted builder

- Typing text into the helper input and clicking `Add to query` converts the input into query syntax automatically.
- Example observed:

```text
input: artificial intelligence
generated query preview: ALL=(artificial intelligence)
```

- After adding one term, a Boolean connector control appears (for example `And`).

## Direct editor

- The `Query Preview` textarea accepts manual query syntax directly.
- Example successful manual query:

```text
TS=(deep learning)
```

## Session queries

From official help and UI observation:

- Each query is saved into `Session Queries`.
- Query sets can be combined.
- Combining uses set references and Boolean operators.
- Search history can be cleared.

## Search Syntax Rules Relevant To Automation

## Operators

Observed on page and confirmed in official help:

- Boolean:
  - `AND`
  - `OR`
  - `NOT`
- Proximity:
  - `NEAR/x`
  - `SAME`

## Operator precedence

From official help:

1. `NEAR/x`
2. `SAME`
3. `NOT`
4. `AND`
5. `OR`

Use parentheses to override precedence.

## Exact search

- Exact Search is off by default.
- With Exact Search off, the system applies stemming and lemmatization.
- With Exact Search on, matching becomes literal for the entered term.
- For exact phrases, quotation marks are required.

## Lemmatization and stemming

From official help:

- Example behavior with lemmatization on:
  - `mouse` can match `mouse` and `mice`
  - `defense` can match `defense` and `defence`
- Quotation marks turn off lemmatization/synonym expansion for the quoted term.
- Wildcards also turn off lemmatization for that term.

## Wildcards

Supported wildcard symbols:

- `*` any group of characters, including zero characters
- `?` exactly one character
- `$` zero or one character

Examples from official help:

```text
organi?ation*
flavo$r
wom?n
```

Important constraints:

- In Title and Topic searches, at least 3 characters must precede a wildcard in right-hand/internal truncation.
- Left-hand truncation is only supported in selected fields.
- In All Fields, only right-hand truncation is supported.
- Wildcards cannot be used after certain special characters/punctuation.
- Wildcards cannot be used in publication year searches.

## Chinese and Korean query caveat

Official help explicitly notes:

- Implicit AND does not apply to Chinese-language or Korean-language queries.
- Therefore, adjacency vs Boolean combination must be expressed explicitly when using Chinese/Korean terms.

## All Fields operator limit

Official help explicitly notes:

- In Web of Science Core Collection, `All Fields (AF)` queries are limited to `49` Boolean or proximity operators.

## Field Tags Observed In Query Builder

Observed field tags list:

```text
TS=Topic
TI=Title
AB=Abstract
AU=Author
AI=Author Identifiers
AK=Author Keywords
GP=Group Author
ED=Editor
KP=Keyword Plus(R)
SO=Publication Titles
DO=DOI
PY=Year Published
CF=Conference
AD=Address
OG=Affiliation
OO=Organization
SG=Suborganization
SA=Street Address
CI=City
PS=Province/State
CU=Country/Region
ZP=Zip/Postal Code
FO=Funding Agency
FG=Grant Number
FD=Funding Details
FT=Funding Text
SU=Research Area
WC=Web of Science Categories
IS=ISSN/ISBN
UT=Accession Number
PMID=PubMed ID
DOP=Publication Date
LD=Index Date
PUBL=Publisher
ALL=All Fields
FPY=Final publication year
EAY=Early Access Year
SDG=Sustainable Development Goals
TMAC=Macro Level Citation Topic
TMSO=Meso Level Citation Topic
TMIC=Micro Level Citation Topic
```

## Observed Search Execution Flow

## Example workflow

1. Open `https://webofscience.clarivate.cn/wos/woscc/advanced-search`
2. Dismiss cookie banner if present
3. Dismiss in-app guide if present
4. Configure collections/date/exact-search if needed
5. Either:
   - build query via helper input and `Add to query`, or
   - write raw query into `Query Preview`
6. Click `Search`
7. Land on summary page:
   - `/wos/woscc/summary/<query-id>/relevance/1`

## Example successful search

Manual query:

```text
TS=(deep learning)
```

Observed result page:

```text
https://webofscience.clarivate.cn/wos/woscc/summary/8ff8b15c-4e17-4f22-a419-afb468b0ea1d-01a499b1fb/relevance/1
```

Observed page title:

```text
TS=(deep learning) - 549,235 - Web of Science Core Collection
```

## Key Internal API Calls Observed

## Main query endpoint

Observed main search request:

```text
POST https://webofscience.clarivate.cn/api/wosnx/core/runQuerySearch?SID=<sid>
```

Observed request body shape:

```json
{
  "product": "WOSCC",
  "searchMode": "general",
  "viewType": "search",
  "serviceMode": "summary",
  "search": {
    "mode": "general",
    "database": "WOSCC",
    "query": [
      {
        "rowText": "TS=(deep learning)"
      }
    ],
    "sets": [],
    "options": {
      "lemmatize": "On"
    }
  },
  "retrieve": {
    "count": 50,
    "history": true,
    "jcr": true,
    "sort": "relevance",
    "analyzes": [
      "TP.Value.6",
      "REVIEW.Value.6",
      "EARLY ACCESS.Value.6",
      "OA.Value.6",
      "DR.Value.6",
      "ECR.Value.6",
      "PY.Field_D.6",
      "FPY.Field_D.6",
      "DT.Value.6",
      "AU.Value.6",
      "DX2NG.Value.6",
      "PEERREVIEW.Value.6",
      "STK.Value.10"
    ],
    "locale": "en"
  },
  "eventMode": null
}
```

## Main response shape

The response was observed as an array of keyed payload blocks:

```text
highlight
searchInfo
records
analyze
jcr
link
```

Observed `searchInfo` example:

```json
{
  "QueryID": "2cc0719f-0fb6-45b1-b7bf-c10c54fba71f-01a499ca4d",
  "RecordsSearched": 90651057,
  "RecordsFound": 549235,
  "RecordsAvailable": 100000
}
```

Important implication:

- `RecordsFound` is total hit count.
- `RecordsAvailable` appears to be the maximum interactively retrievable records for this query in the current mode.

## Other related endpoints observed

- Session/history:

```text
POST /api/wosnx/core/getHistory?SID=<sid>
```

- Per-record indicators:

```text
POST /api/wosnx/indic/records/getIndicators
```

- Marked list membership checks:

```text
POST /api/wosnx/core/markedList?SID=<sid>
```

- Auxiliary search-related API observed:

```text
POST /api/esti/SearchEngine/search
```

- Load dates:

```text
POST /api/esti/SearchEngine/getAllLoadDates
```

## Result Page Structure Relevant To MCP

## URL pattern

Observed summary URL pattern:

```text
/wos/woscc/summary/<query-id>/<sort>/<page>
```

## Top-level result features

- Result count banner
- Query label
- `Copy query link`
- `Add Keywords` / quick keyword suggestions
- `Analyze Results`
- `Citation Report` (may be disabled)
- `Create Alert`

## Filters observed in left refine panel

- Quick Filters
- Publication Years
- Document Types
- Researcher Profiles
- Web of Science Categories
- Citation Topics Meso
- Citation Topics Micro
- Sustainable Development Goals
- Web of Science Index
- Affiliations
- Affiliation with Department
- Publication Titles
- Languages
- Countries/Regions
- Publishers
- Research Areas
- Open Access
- Filter by Marked List
- Funding Agencies
- Conference Titles
- Group Authors
- Book Series Titles
- Editors
- Editorial Notices

## Result list observations

- Default page size observed: `50`
- Pagination observed:
  - current page input
  - next/prev buttons
  - total pages shown as `2000`
- Each record row includes:
  - title and link to full record
  - authors
  - source / conference / publication info
  - abstract preview
  - citation count
  - reference count
  - related records link
  - options menu
  - full-text links when available

## Export Observations

## Export menu options

Observed menu items:

- EndNote online
- EndNote desktop
- Add to my researcher profile
- Plain text file
- RefWorks
- RIS (other reference software)
- BibTeX
- Excel
- Tab delimited file
- Printable HTML file
- InCites
- Email
- Fast 5000

## Excel export modal

Observed export settings for Excel:

- Record range options:
  - `All records on page`
  - `Records from: <start> to <end>`
- Limit shown in UI:

```text
No more than 1000 records at a time
```

- Record content options:
  - `Author, Title, Source`
  - `Author, Title, Source, Abstract`
  - `Full Record`
  - `Custom selection (10)`

Important implication:

- Large-batch export must be chunked.
- An MCP should support export pagination/range slicing.

## Practical Automation Risks

- Session dependence:
  - Institutional access is required for meaningful search access.
  - `SID` is session-specific and can expire.
- UI interruptions:
  - cookie banner
  - onboarding modal
  - resource center popups
- Dynamic client rendering:
  - the page is Angular-like / SPA behavior
  - some elements appear only after hydration
- Analytics noise:
  - many unrelated requests occur (`pendo`, `snowplow`, chat history, etc.)
- Not all observed network traffic is search-critical.
- Result volume cap:
  - interactive result access appears capped at 100,000 available records
  - export chunks are limited to 1,000 in the Excel flow

## Recommended MCP Design

## Best first version

Use a hybrid browser + API design:

1. Use Playwright to open the site and establish institutional session.
2. Read `wos_sid` from `localStorage`.
3. Reuse browser cookies and session.
4. Submit queries via the same internal search endpoint.
5. Use browser navigation only where UI state is required:
   - dismiss modals
   - refine filters not yet reverse-engineered
   - export flows

Why this is the safest first version:

- Pure UI automation is slower and more brittle.
- Pure direct API access is risky without browser-acquired session state.
- Hybrid lets you keep the working browser session while minimizing click-based fragility.

## Suggested MCP tool surface

- `wos_open_session()`
- `wos_get_session_info()`
- `wos_run_query(query, options)`
- `wos_get_results_page(query_id, page, sort)`
- `wos_get_history()`
- `wos_refine(query_id, filters)`
- `wos_export(query_id, format, start, end, content)`
- `wos_get_full_record(uid)`

## Good defaults for v1

- Default database: `WOSCC`
- Default count per query page: `50`
- Default sort: `relevance`
- Default lemmatization: `On`
- Default flow: raw query via Query Preview

## Recommended Implementation Notes

- Prefer raw query submission over assisted field typing for deterministic automation.
- Store:
  - `sid`
  - current query text
  - `QueryID`
  - `RecordsFound`
  - `RecordsAvailable`
  - current sort
  - current page
- Treat `RecordsAvailable` as the hard cap until proven otherwise.
- If the query exceeds export/retrieval caps:
  - apply year slices
  - apply subject/category slices
  - export in chunks
- Add retry logic for:
  - expired session
  - modal interference
  - slow page hydration

## Open Questions For Next Round

- Whether additional internal endpoints can fetch full result pages directly without UI navigation.
- Whether `RecordsAvailable = 100000` is universal or query-dependent.
- Whether export limits differ by format (`RIS`, `Tab delimited`, `Fast 5000`, etc.).
- Whether refinement actions use stable, reusable API calls.
- Whether full-record detail pages expose a clean API path worth wrapping directly.

## Suggested Next Steps

1. Implement a Playwright bootstrap that:
   - opens the page
   - dismisses modals
   - extracts `wos_sid`
2. Build a `runQuerySearch` wrapper with typed request/response parsing.
3. Add a paging reader for summary results.
4. Add batch export support with chunking and retry.
5. Reverse-engineer one refinement flow (for example Publication Year) before implementing all filters.

## Addendum: RIS Export, Filter Scripting, Download Intercept, And Abstract Retrieval

### RIS export support

Confirmed in the Web of Science results export menu:

- EndNote online
- EndNote desktop
- Plain text file
- RefWorks
- `RIS (other reference software)`
- BibTeX
- Excel
- Tab delimited file
- Printable HTML file

So the answer is: yes, RIS export is supported.

### RIS export modal behavior

Observed RIS export overlay:

- Title: `Export Records to RIS File`
- Range options:
  - `All records on page`
  - `Records from: <start> to <end>`
- Limit:

```text
No more than 1000 records at a time
```

- Content options:
  - `Author, Title, Source`
  - `Author, Title, Source, Abstract`
  - `Full Record`
  - `Custom selection (10)`

### Playwright download takeover

Confirmed working in practice:

- Web of Science generates a real browser download event.
- In this session, Playwright successfully intercepted and saved the RIS file.
- Observed download metadata:
  - Suggested filename: `savedrecs.ris`
  - Download URL seen by Playwright: a `blob:` URL

Working pattern:

```ts
const [download] = await Promise.all([
  page.waitForEvent("download", { timeout: 30000 }),
  page.locator("button#exportButton").click({ force: true }),
]);

await download.saveAs("D:/Workspaces/1.Projects/AgentRearchMCP/docs/tmp-wos-export.ris");
```

Implication:

- You do not need to scrape a direct HTTP file URL.
- The MCP can take over downloads through Playwright's `download` event and then save the file to a controlled path.

### Example RIS file content

The saved RIS file was valid and readable. The first lines looked like:

```text
TY  - CPAPER
AU  - Zhang, H
AU  - Wu, XJ
TI  - Research on the Connotation and Process of Reflection-based Deep Learning
T2  - INTERNATIONAL CONFERENCE ON HUMANITY AND SOCIAL SCIENCE (ICHSS 2014)
PY  - 2014
AN  - WOS:000351909700070
ER  -
```

### UI filter scripting

The refine sidebar is scriptable with stable accessibility hooks.

Observed reliable Playwright pattern:

```ts
const years = page.getByRole("group", { name: "Publication Years" });
await years.getByRole("checkbox", { name: /2025\./ }).check({ force: true });
await years.getByLabel(/Refine button\. Click to filter/).click({ force: true });
```

Another example:

```ts
const docTypes = page.getByRole("group", { name: "Document Types" });
await docTypes.getByRole("checkbox", { name: /Review Article\./ }).check({ force: true });
await docTypes.getByLabel(/Refine button\. Click to filter/).click({ force: true });
```

And quick filter example:

```ts
const quick = page.getByRole("group", { name: "Quick Filters" });
await quick.getByRole("checkbox", { name: /Open Access\./ }).check({ force: true });
await quick.getByLabel(/Refine button\. Click to filter/).click({ force: true });
```

Important note:

- Using `check({ force: true })` was more reliable than a normal click on the custom checkbox widget.

### Refine API observed behind UI filters

When the sidebar `Refine` button is clicked, Web of Science sends:

```text
POST /api/wosnx/core/runQueryRefine?SID=<sid>
```

Observed examples:

#### Publication Year = 2025

```json
{
  "qid": "6e508f17-2b04-4b2c-8aa9-8b45a30fb60d-01a49add3d",
  "refines": [
    { "index": "PY", "value": ["2025"] }
  ]
}
```

#### Document Type = Review Article

```json
{
  "qid": "b7f66a7d-afff-4fc2-af4f-f93300164afa-01a49b4c41",
  "refines": [
    { "index": "DT", "value": ["REVIEW"] }
  ]
}
```

#### Quick Filter = Open Access

```json
{
  "qid": "b2bc50fc-2111-4672-a1e8-837ce04dbff1-01a49b565b",
  "refines": [
    { "index": "OA", "value": ["OPEN ACCESS"] }
  ]
}
```

Implication:

- For an MCP, direct `runQueryRefine` calls are likely more stable than repeatedly clicking sidebar UI.
- UI automation is still useful to discover labels and supported values.

### Query state stored in browser

The current refined query state is cached in local storage under:

```text
wos_search_<qid>
wos_search_hits_<qid>
```

Observed example value:

```json
{
  "mode": "general",
  "database": "WOSCC",
  "query": [{ "rowText": "TS=(deep learning)" }],
  "options": { "lemmatize": "On" },
  "id": "af73a81f-8e38-4037-b2be-33794ffde9e5-01a49b60b7",
  "refines": [
    { "index": "PY", "value": ["2025"] },
    { "index": "DT", "value": ["REVIEW"] },
    { "index": "OA", "value": ["OPEN ACCESS"] }
  ],
  "noRefineParent": "6e508f17-2b04-4b2c-8aa9-8b45a30fb60d-01a49add3d"
}
```

This is very useful for automation because:

- you can reconstruct the current search
- you can replay/refetch the current result set
- you can avoid scraping visible pills from the page

### Show more vs direct abstract retrieval

#### UI approach

The results UI exposes `Show more` buttons on result cards for truncated abstracts.

Recommended UI pattern:

```ts
const record = page.locator("article, .summary-record, .search-results-item").nth(0);
await record.getByRole("button", { name: /Show more/i }).click({ force: true });
```

However, for MCP automation, this is not the best primary strategy because:

- result cards can be virtualized or lazily rendered
- selectors are more brittle than the internal API
- you only need the text, not the expanded UI state

#### Better approach: fetch first-page abstracts directly

A better method is:

1. Read current `qid` from the URL.
2. Read `wos_search_<qid>` from local storage.
3. Re-run `runQueryRefine` or `runQuerySearch` with a small `retrieve.count`.
4. Extract abstracts from the `records` payload.

Observed abstract path in the response:

```text
records["1"].abstract.basic.en.abstract
```

#### Example: first 5 abstracts retrieved directly

For the refined query:

```text
TS=(deep learning)
+ 2025
+ Review Article
+ Open Access
```

we successfully fetched the top 5 records directly from the API. Example titles:

1. `Ensemble Deep Learning Approaches in Health Care: A Review`
2. `A review of deep learning in blink detection`
3. `Which Method Best Predicts Postoperative Complications: Deep Learning, Machine Learning, or Conventional Logistic Regression?`
4. `Deep learning for three-dimensional (3D) plant phenomics`
5. `A review of deep learning models for food flavor data analysis`

The returned abstract bodies were full HTML snippets, not the shortened UI preview.

Implication:

- If your MCP goal is to read abstracts from page 1, use the internal API directly.
- Only use `Show more` when you explicitly need to mirror browser behavior.

## Cross-Database Comparison: Web of Science vs PubMed vs IEEE Xplore

This comparison is focused on search automation, filtering, export, and abstract retrieval.

### Similarities

I would group the three platforms into `7` major similarities:

1. All support advanced search construction.
2. All support Boolean logic.
3. All support result filtering/refinement.
4. All support export/citation-management workflows.
5. All expose abstracts or abstract-like metadata for many records.
6. All support saved searches / alerts in some form.
7. All can be automated, but the best interface differs (UI vs official API vs private API).

### Differences

I would group the main differences into `10` high-impact differences:

1. Domain coverage
   - Web of Science: multidisciplinary citation index
   - PubMed: biomedical / life sciences
   - IEEE Xplore: engineering / CS / electronics / standards
2. Official API posture
   - Web of Science page flow observed here relies on session-bound internal APIs
   - PubMed has public E-utilities
   - IEEE has official Metadata API with API key
3. Session/auth requirements
   - Web of Science is strongly institution/session dependent
   - PubMed is open
   - IEEE web access may depend on subscription, but metadata API is documented separately
4. Search translation behavior
   - Web of Science uses lemmatization/stemming and Exact Search toggle
   - PubMed uses Automatic Term Mapping and exposes Search Details
   - IEEE Metadata API supports simple/Boolean search but is comparatively simpler
5. History model
   - Web of Science uses session queries and query-set combinations
   - PubMed has Advanced Search History and Search Details
   - IEEE web UI has saved searches; API docs focus more on query parameters than history
6. Export format defaults
   - Web of Science supports RIS directly
   - PubMed exports citation-manager files as `.nbib`
   - IEEE Xplore documents cite/export support Plain Text, BibTeX, RIS, and RefWorks
7. Export limits
   - Web of Science observed: 1000 per export batch
   - PubMed help states citation-manager export up to 10,000
   - IEEE web limit was not confirmed here from primary docs, but citation export formats are documented
8. Programmatic paging
   - Web of Science private API observed returns page-sized result blocks
   - PubMed E-utilities expose `retstart` / `retmax`
   - IEEE Metadata API documents `start_record` / `max_records`
9. Abstract retrieval path
   - Web of Science private API returns structured record payloads
   - PubMed abstracts can be fetched through E-utilities / PubMed APIs
   - IEEE Metadata API explicitly states metadata records include abstracts
10. Automation difficulty
   - Easiest: PubMed
   - Moderate: IEEE Metadata API
   - Hardest: Web of Science web flow, because it depends on active browser session and private APIs

### PubMed notes

From official PubMed help:

- Advanced Search Builder supports field-specific search, query building, and history.
- Search Details show how PubMed translated a query.
- PubMed can display up to `10,000` results in the UI.
- Citation export uses `Send to: Citation Manager` and creates an `.nbib` file.
- Citation Manager export supports:
  - selected citations
  - all results on page
  - all results up to `10,000`
- PubMed also has a public programmatic interface:
  - `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/`

### IEEE Xplore notes

From official IEEE docs and IEEE materials:

- IEEE Metadata API can query and retrieve metadata records including abstracts.
- Metadata API supports simple and Boolean searches.
- Filtering parameters include:
  - `content_type`
  - `start_year`
  - `end_year`
  - `open_access`
  - `publisher`
  - `publication_number`
- Sorting/paging parameters include:
  - `start_record`
  - `max_records`
  - `sort_field`
  - `sort_order`
- Document page citation export supports:
  - Plain Text
  - BibTeX
  - RIS
  - RefWorks
- IEEE's 2024 feature sheet also notes:
  - up to `8` wildcards per search
  - up to `25` search terms per search clause

### Automation recommendation by platform

- Web of Science:
  - best with Playwright + session reuse + private API calls
- PubMed:
  - best with direct API first, browser only if needed
- IEEE Xplore:
  - best with official Metadata API first, browser second

## Source Links For The Comparison

- PubMed Help: https://pubmed.ncbi.nlm.nih.gov/help/
- PubMed Advanced Search: https://pubmed.ncbi.nlm.nih.gov/advanced/
- NCBI E-utilities Quick Start: https://www.ncbi.nlm.nih.gov/books/NBK25500/pdf/Bookshelf_NBK25500.pdf
- IEEE Metadata API overview: https://developer.ieee.org/docs
- IEEE API query basics: https://developer.ieee.org/docs/read/Searching_the_IEEE_Xplore_Metadata_API
- IEEE filtering parameters: https://developer.ieee.org/docs/read/metadata_api_details/Filtering_Parameters
- IEEE sorting/paging parameters: https://developer.ieee.org/docs/read/metadata_api_details/Sorting_and_Paging_Parameters
- IEEE Boolean operators: https://developer.ieee.org/docs/read/metadata_api_details/Leveraging_Boolean_Logic
- IEEE 2024 feature sheet: https://innovate.ieee.org/wp-content/uploads/2024/02/Whats-New-2024-23-PIM-0043a-rev-ltr-HR.pdf
