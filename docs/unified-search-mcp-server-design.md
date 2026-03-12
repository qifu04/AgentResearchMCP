# Unified Search MCP Server Design

- Date: 2026-03-12
- Scope: Web of Science, PubMed, IEEE Xplore, Scopus
- Basis:
  - `docs/web-of-science-advanced-search-mcp-research.md`
  - `docs/pubmed-playwright-exploration.md`
  - `docs/ieee-playwright-exploration.md`
  - `docs/scopus-playwright-exploration.md`
  - `docs/scopus-login-state-analysis.md`

## 1. What This Document Solves

The target is not a general browser agent. The target is a search-centric MCP server with a small, stable workflow:

1. create an isolated browser session
2. open the provider's advanced-search entry page
3. detect whether the current session is good enough for the requested capability
4. if login is needed, wait for manual login and auto-continue once the state changes
5. expose provider-specific query-language rules in a structured way
6. run search
7. return titles, abstract samples, filters, and export capability in a normalized envelope
8. let the agent decide whether the query is good enough
9. apply filters or rewrite the query until the result sample is acceptable
10. export native data and convert to RIS when needed

The important design choice is:

- the MCP server should own browser control and normalization
- the agent should own query reasoning and stopping decisions

That split keeps the implementation deterministic while still letting the model iterate on search strategy.

## 2. Verified Cross-Provider Facts

| Provider | Raw advanced query | Search without personal login | Export without personal login | Abstract path | Filter path | Native export observed | Verified batch note |
| --- | --- | --- | --- | --- | --- | --- | --- |
| WOS | Yes | Yes, if institutional access exists | Yes in observed session | Mixed: DOM preview plus richer API data | Rich refine UI plus observed refine API | RIS | Range export observed up to 1000 per batch |
| PubMed | Yes plus builder UI | Yes | Yes | DOM preview already on result card | Left filters, URL/request diffs still incomplete | NBIB | Page / all / selection scopes observed |
| IEEE | Query box plus advanced entry | Yes in observed institutional session | Yes for tested selected citation export | DOM expand on result page | Rich UI filters | RIS for selected citations, CSV for results | Results tab says up to 1000 if no results are selected |
| Scopus | Yes | Yes for search in anonymous institutional state | No, export blocked until account login | DOM expand, likely bulk expand too | Rich UI filters and observed facet endpoints | Not yet verified after login | Interactive result window observed as 2000 visible results |

Immediate implication:

- the workflow is common, but export and login requirements are not
- RIS cannot be assumed as a native provider format
- "usable for search" and "personally logged in" are different states

## 3. The Right Abstraction Boundary

The server should not try to hide every provider difference. It should normalize only what the agent needs for search iteration.

### Normalize

- session lifecycle
- login state
- query-language guide
- search summary
- first-page result sample
- filter descriptors
- export capability
- export result file paths

### Preserve as provider-native `raw`

- request payloads
- response payloads
- provider ids and query ids
- selector/test-id details
- provider-specific capability blockers
- provider-specific export settings

This gives the agent a common workflow without destroying evidence that later implementations will need.

## 4. Recommended Responsibility Split

### Common MCP core

The following should stay provider-agnostic and should not change when a new database is added:

1. create, lease, release, and close isolated browser sessions
2. maintain one action lock per session to avoid cross-agent interference
3. manage storage state, downloads, and artifact directories
4. orchestrate login waiting and resume
5. produce LLM-friendly normalized response envelopes
6. capture screenshots, DOM snapshots, storage snapshots, and downloads
7. plan export chunking for providers that expose range-based export
8. convert native export files to RIS when the provider does not produce RIS natively
9. provide a stable MCP tool surface keyed by `sessionId`
10. persist per-session state so later tool calls can continue from the same browser context

### Provider adapter

The following should be the only parts that differ by database:

1. advanced-search entry URL
2. blocker cleanup logic such as cookie banners or onboarding popups
3. login-state detection logic
4. query-language metadata and field tags
5. query input and submit actions
6. summary extraction
7. result-card parsing
8. abstract extraction mode
9. filter enumeration and apply logic
10. selection logic
11. export detection and export trigger logic
12. provider-specific raw payload capture

This is the key rule for future extensibility:

- new providers should add a new adapter package
- they should not require changes to session management, MCP tools, or response envelopes

## 5. Session Isolation And Browser Access Model

The best fixed access model is not "give every agent arbitrary browser control". The better model is:

1. create one isolated browser context per session
2. store all session artifacts under one session directory
3. expose the session only through session-scoped MCP tools
4. allow optional manual-login attachment for the human user
5. keep a single writer lock so two agents cannot click the same session concurrently

### Recommended state layout

Use the existing repository layout as the base:

```text
.agent-research-mcp/
  auth/
    <provider>/
      <profile-key>/
        profile/              # persistent browser profile only when explicitly allowed
  sessions/
    <session-id>/
      session.json
      state.json
      dom/
      network/
      storage/
      downloads/
      exports/
      screenshots/
```

### Session rules

1. one provider per session
2. one Playwright browser context per session
3. one primary page per session
4. one download directory per session
5. one artifact directory per session
6. one active mutating caller per session
7. optional read-only inspection by other callers if no click or navigation occurs

### Session phases

```ts
type SessionPhase =
  | "created"
  | "starting"
  | "ready"
  | "awaiting_user_login"
  | "search_ready"
  | "searching"
  | "exporting"
  | "completed"
  | "closed"
  | "error";
```

## 6. Login State Must Be More Than Boolean

Across the four providers, login is not just `true` or `false`.

### Recommended normalized login states

```ts
type LoginStateKind =
  | "anonymous"
  | "institutional"
  | "personal"
  | "unknown";
```

### Why this is necessary

- WOS: search works with institutional access even when personal sign-in is false
- IEEE: tested search and RIS export worked under institutional access
- PubMed: current scope works anonymously
- Scopus: anonymous institutional search works, but export is blocked until personal account login

### Normalized login-state object

```ts
interface LoginState {
  kind: LoginStateKind;
  authenticated: boolean;
  canSearch: boolean;
  canExport: boolean;
  institutionAccess?: string | null;
  requiresInteractiveLogin?: boolean;
  blockingReason?: string | null;
  detectedBy: string[];
  raw?: unknown;
}
```

### Manual login flow

The generic flow should be:

1. `createSession(provider)`
2. core opens provider advanced-search page
3. provider adapter runs `detectLoginState()`
4. if capability is blocked:
   - set phase to `awaiting_user_login`
   - return `requiresInteractiveLogin = true`
   - keep browser session alive
5. user logs in manually in that same session
6. core runs `waitForLoginStateChange(sessionId, targetCapability)`
7. once provider adapter detects the expected state, the session phase changes to `search_ready`
8. the original workflow resumes automatically

Important design rule:

- login waiting belongs in the common core
- login detection belongs in the provider adapter

## 7. Query Rules Should Be Returned As Structured Guidance

The agent should not have to read provider docs every time. Each adapter should publish a structured query-language profile.

```ts
interface QueryFieldTag {
  code: string;
  label: string;
  description?: string | null;
}

interface QueryLanguageProfile {
  provider: string;
  supportsRawEditor: boolean;
  supportsBuilderUi: boolean;
  supportsUrlQueryRecovery: boolean;
  rawEntryLabel?: string | null;
  fieldTags: QueryFieldTag[];
  booleanOperators: string[];
  proximityOperators?: string[];
  wildcards?: string[];
  examples: string[];
  constraints: string[];
  recommendedPatterns: string[];
  antiPatterns: string[];
  raw?: unknown;
}
```

### Why this matters for the agent

The agent can ask for `getQueryLanguageProfile(sessionId)` before it writes a query and then:

1. construct a first-pass query using provider field tags
2. avoid invalid syntax
3. explain its own rewrite decisions using provider rules
4. stay provider-correct without branching its own logic too much

## 8. The LLM-Optimized Response Envelope

The server should return one stable envelope shape for all tools.

```ts
interface ToolEnvelope<T> {
  ok: boolean;
  provider: string;
  sessionId: string;
  phase: SessionPhase;
  timestamp: string;
  warnings?: string[];
  nextActions?: string[];
  data: T;
  raw?: unknown;
}
```

### Response design rules

1. normalized fields first
2. small arrays for result samples
3. short strings for headlines and labels
4. provider-specific fields only under `raw`
5. always return `nextActions`
6. always include current session phase
7. always include enough context for the next agent step

### Search observation payload

This is the most important response shape for the agent loop.

```ts
interface SearchObservation {
  loginState: LoginState;
  queryProfile: QueryLanguageProfile;
  summary: SearchSummary;
  results: ResultItem[];
  filters: FilterGroup[];
  exportCapability: ExportCapability;
}

interface SearchSummary {
  query: string;
  totalResultsText?: string | null;
  totalResults?: number | null;
  currentPage?: number | null;
  totalPages?: number | null;
  pageSize?: number | null;
  queryId?: string | null;
  sort?: string | null;
  raw?: unknown;
}

interface ResultItem {
  indexOnPage: number;
  title: string;
  href?: string | null;
  authorsText?: string | null;
  sourceText?: string | null;
  yearText?: string | null;
  abstractPreview?: string | null;
  labels?: string[];
  selectable?: boolean;
  raw?: unknown;
}

interface FilterOption {
  value: string;
  label: string;
  countText?: string | null;
}

interface FilterGroup {
  key: string;
  label: string;
  type: "checkbox" | "radio" | "range" | "date-range" | "text" | "unknown";
  options?: FilterOption[];
  raw?: unknown;
}

interface ExportCapability {
  nativeFormat: "ris" | "nbib" | "csv" | "bibtex" | "unknown";
  convertibleToRis: boolean;
  requiresInteractiveLogin?: boolean;
  supportsPage?: boolean;
  supportsAll?: boolean;
  supportsSelected?: boolean;
  supportsRange?: boolean;
  maxBatch?: number | null;
  blockingReason?: string | null;
  raw?: unknown;
}
```

### Example search response

```json
{
  "ok": true,
  "provider": "wos",
  "sessionId": "sess_01",
  "phase": "search_ready",
  "timestamp": "2026-03-12T15:00:00.000Z",
  "nextActions": ["rewrite_query", "apply_filters", "export_results"],
  "data": {
    "loginState": {
      "kind": "institutional",
      "authenticated": false,
      "canSearch": true,
      "canExport": true,
      "institutionAccess": "Peking University",
      "detectedBy": ["institution-text", "wos_sid"]
    },
    "queryProfile": {
      "provider": "wos",
      "supportsRawEditor": true,
      "supportsBuilderUi": true,
      "supportsUrlQueryRecovery": false,
      "fieldTags": [
        { "code": "TS", "label": "Topic" },
        { "code": "TI", "label": "Title" }
      ],
      "booleanOperators": ["AND", "OR", "NOT"],
      "proximityOperators": ["NEAR/x", "SAME"],
      "examples": ["TS=(deep learning)"],
      "constraints": ["AF queries are limited to 49 operators"],
      "recommendedPatterns": ["Prefer raw query entry for deterministic automation"],
      "antiPatterns": ["Do not assume all providers use WOS field tags"]
    },
    "summary": {
      "query": "TS=(deep learning)",
      "totalResults": 549235,
      "pageSize": 50,
      "totalPages": 2000,
      "queryId": "..."
    },
    "results": [
      {
        "indexOnPage": 1,
        "title": "Example title",
        "abstractPreview": "Example abstract"
      }
    ],
    "filters": [
      {
        "key": "PY",
        "label": "Publication Years",
        "type": "checkbox"
      }
    ],
    "exportCapability": {
      "nativeFormat": "ris",
      "convertibleToRis": true,
      "supportsRange": true,
      "maxBatch": 1000
    }
  }
}
```

## 9. The Common Workflow The Agent Should Reuse

This is the workflow that should stay the same no matter which provider is used.

1. `create_session(provider)`
2. `open_advanced_search(sessionId)`
3. `get_login_state(sessionId, capability)`
4. if blocked, `wait_for_login(sessionId, capability)`
5. `get_query_language_profile(sessionId)`
6. agent writes query
7. `run_search(sessionId, query, options)`
8. inspect returned titles, abstracts, filters, and export capability
9. if unsatisfied:
   - rewrite query and run search again
   - or apply filters and run search again
10. once satisfied, call `export_results(sessionId, request)`
11. if export format is not RIS, run `convert_export_to_ris(sessionId, filePath)`

The agent loop should stay outside the provider adapter. The provider adapter should only supply deterministic actions and structured observations.

## 10. Recommended MCP Tool Surface

These are the stable tools the server should expose. They should not change when a new database is added.

### Session tools

1. `create_session`
2. `get_session`
3. `close_session`
4. `list_sessions`
5. `acquire_session_lock`
6. `release_session_lock`

### Navigation and login tools

1. `open_advanced_search`
2. `get_login_state`
3. `wait_for_login`
4. `capture_session_artifacts`

### Query and search tools

1. `get_query_language_profile`
2. `read_current_query`
3. `set_query`
4. `run_search`
5. `read_search_summary`
6. `read_result_sample`

### Filter and selection tools

1. `list_filters`
2. `apply_filters`
3. `select_results`
4. `clear_selection`

### Export tools

1. `get_export_capability`
2. `export_results`
3. `convert_export_to_ris`

### Why this tool surface is stable

Because every provider currently fits the same high-level process:

- enter
- check session
- query
- inspect
- refine
- export

The differences live behind the adapter, not in the tool names.

## 11. Common Functions That Should Not Change With New Providers

These are the most important reusable functions in the whole system.

### Session core

1. `createIsolatedSession(provider, options)`
2. `loadSession(sessionId)`
3. `saveSessionState(sessionId, state)`
4. `acquireActionLock(sessionId, ownerId)`
5. `releaseActionLock(sessionId, ownerId)`
6. `closeSession(sessionId)`

### Browser and artifact core

1. `prepareSessionDirectories(sessionId)`
2. `captureDomSnapshot(sessionId, label)`
3. `captureScreenshot(sessionId, label)`
4. `captureNetworkLog(sessionId, label)`
5. `captureStorageState(sessionId, label)`
6. `captureDownload(sessionId, requestId)`

### Login orchestration core

1. `ensureAdvancedSearchLoaded(sessionId)`
2. `waitForProviderReady(sessionId)`
3. `waitForLoginTransition(sessionId, targetCapability, timeoutMs)`
4. `resumePendingWorkflow(sessionId)`

### Response normalization core

1. `buildEnvelope(data, context)`
2. `truncateResultSample(items, limit)`
3. `normalizeWarnings(rawWarnings)`
4. `inferNextActions(observation)`

### Export core

1. `planExportChunks(capability, requestedScope, totalResults)`
2. `saveExportFile(sessionId, download)`
3. `convertNativeExportToRis(format, filePath)`
4. `mergeExportChunks(filePaths, targetPath)`

These functions belong in the common core because they do not depend on which database is being automated.

## 12. Provider Interface That Should Stay Stable

This is the contract each provider should implement.

```ts
interface SearchProviderAdapter {
  readonly descriptor: ProviderDescriptor;

  openAdvancedSearch(context: ProviderContext): Promise<void>;
  clearInterferingUi(context: ProviderContext): Promise<void>;
  detectLoginState(context: ProviderContext): Promise<LoginState>;
  getQueryLanguageProfile(context: ProviderContext): Promise<QueryLanguageProfile>;
  readCurrentQuery(context: ProviderContext): Promise<string | null>;
  setCurrentQuery(context: ProviderContext, query: string): Promise<void>;
  submitSearch(context: ProviderContext): Promise<SearchSummary>;
  readSearchSummary(context: ProviderContext): Promise<SearchSummary>;
  readResultItems(context: ProviderContext, limit: number): Promise<ResultItem[]>;
  readResultAbstracts(context: ProviderContext, limit: number): Promise<ResultItem[]>;
  listFilters(context: ProviderContext): Promise<FilterGroup[]>;
  applyFilters(context: ProviderContext, input: FilterApplyRequest[]): Promise<SearchSummary>;
  selectResultsByIndex(context: ProviderContext, indices: number[]): Promise<void>;
  clearSelection(context: ProviderContext): Promise<void>;
  detectExportCapability(context: ProviderContext): Promise<ExportCapability>;
  exportNative(context: ProviderContext, request: ExportRequest): Promise<ExportResult>;
}
```

### Provider descriptor

```ts
interface ProviderDescriptor {
  id: string;
  displayName: string;
  entryUrl: string;
  supportsManualLoginWait: boolean;
  capabilities: {
    rawQuery: boolean;
    builderUi: boolean;
    filters: boolean;
    inlineAbstracts: boolean;
    selection: boolean;
    export: boolean;
  };
}
```

## 13. Search Satisfaction Loop

The server should not decide whether a query is "good enough". The model should.

### Why the model should own the loop

Only the model can judge:

- semantic fit between the result titles and the user's real topic
- whether the abstracts match the intended concept
- whether recall is too broad or too narrow
- whether date or article-type filters should be tightened

### What the server should return for that decision

Each search step should return:

1. normalized summary
2. first `N` titles
3. first `N` abstract previews
4. available filters
5. export capability
6. warnings and next actions

That is enough for the agent to decide:

- rewrite query
- apply filters
- continue as is
- export now

## 14. Provider-Specific Notes That Matter To The Contract

### WOS

- strongest hybrid provider for browser plus internal API
- `wos_sid` is a valuable session token
- export should be modeled as range-first
- abstracts can be read more richly from observed API payloads

### PubMed

- simplest search provider for anonymous access
- result cards already contain abstract previews
- native export is `nbib`, so RIS is a conversion step

### IEEE

- results-page citation export already supports native RIS
- result-page export and citation export are two separate workflows
- cookie banners and sign-in panels should be handled by `clearInterferingUi()`

### Scopus

- the clearest case where search and export have different login requirements
- login-state detection should use page globals first, not just DOM text
- native citation export after login is still not documented enough and should remain marked as provider-pending

## 15. Template For Future Providers

Every new provider should be filled using the same questions.

### Provider checklist

1. What is the advanced-search entry URL?
2. Can the target capability work anonymously, institutionally, or only with a personal account?
3. What is the best login-state signal?
4. What are the raw-query rules, field tags, wildcards, and examples?
5. How is search submitted?
6. How is summary read?
7. Are abstracts visible directly, expandable, or retrievable by observed API?
8. What filters exist and how are they applied?
9. How is selection handled?
10. What export formats exist?
11. Which export scopes exist?
12. Which observed payload fields are worth persisting in `raw`?

### Success condition for adding a new provider

A new provider is "done enough" when:

1. the core can create and isolate a session
2. the adapter can open advanced search
3. the agent can receive structured query rules
4. the agent can run search and inspect top results
5. the agent can apply filters
6. the export path is either implemented or truthfully marked as blocked

## 16. Final Recommendation

The next implementation step should be:

1. freeze the session model and tool envelope
2. freeze the provider adapter contract
3. implement one end-to-end provider first using that contract
4. only after that, fill the remaining providers against the same interface

The best first provider for implementation is still WOS, because it already exposes:

- clear advanced-search entry
- session token capture
- strong search-summary state
- structured refine behavior
- verified RIS export

PubMed should be the second implementation because it validates the same workflow in the simplest anonymous case.

Scopus and IEEE should follow after the session model and export model are stable.
