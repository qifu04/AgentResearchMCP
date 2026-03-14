/**
 * Pre-defined workflow guide returned by the get_workflow_guide MCP tool.
 * This serves as a "system prompt" for AI agents using this MCP server.
 */
export const WORKFLOW_GUIDE = `
# Agent Research MCP — Workflow Guide

## Overview

This MCP server automates scholarly literature searches across academic databases
using real browser sessions (Playwright). It handles login detection, query entry,
search execution, result scraping, and RIS export.

Every tool response includes a \`nextActions\` array telling you what to call next.
Always check \`ok\` and \`nextActions\` in every response.

## Available Providers

| ID       | Name                              | Login Required | Notes                          |
|----------|-----------------------------------|----------------|--------------------------------|
| pubmed   | PubMed                            | No             | Fully open access              |
| wos      | Web of Science Core Collection    | Yes            | Institutional access required  |
| ieee     | IEEE Xplore                       | Yes            | Institutional or personal      |
| scopus   | Scopus                            | Yes            | Institutional or personal      |

## Workflow Overview

The complete literature search workflow has two layers:
1. **Session Setup** (one-time): create session -> login -> get query syntax
2. **Iterative Search Loop** (repeat): build query -> search -> evaluate -> refine -> export

Phase A: Session Setup
  list_providers -> create_session -> open_advanced_search ->
  get_login_state -> (wait_for_login) -> get_query_language_profile
        |
        v
Phase B: Iterative Search & Refinement (repeat until satisfied)
  1. Construct/refine search query (include filtering in query syntax)
  2. run_search -> check totalResults
  3. read_result_sample -> evaluate title relevance
  4. read_result_sample (with abstracts) -> extract keywords
  5. Refine query with new keywords/terms
  6. Repeat from step 1 if not satisfied
        |
        v
Phase C: Export & Cleanup
  export_results -> (convert_export_to_ris) -> close_session

---

## Phase A: Session Setup

### A1. list_providers
- Input: none
- Returns: Array of provider descriptors with capabilities.
- Use this to discover available providers and their features.

### A2. create_session
- Input: \`provider\` (required), \`persistentProfile\` (optional, boolean)
- Returns: \`sessionId\` — use this in all subsequent calls.
- Set \`persistentProfile: true\` to reuse login cookies across sessions.
- A headed browser window opens automatically.

### A3. open_advanced_search
- Input: \`sessionId\`
- Navigates the browser to the provider's advanced search page.
- Automatically dismisses cookie banners and overlays.
- MUST be called before any search operations.

### A4. get_login_state
- Input: \`sessionId\`
- Returns: \`LoginState\` with \`kind\`, \`canSearch\`, \`canExport\`, \`institutionAccess\`.
- If \`canSearch: true\` -> proceed to A6.
- If \`canSearch: false\` -> proceed to A5 (wait_for_login).

### A5. wait_for_login (conditional)
- Input: \`sessionId\`, \`capability\` ("search" | "export" | "personal"), \`timeoutMs\`, \`pollMs\`
- Only needed when get_login_state shows \`canSearch: false\`.
- Brings the browser window to the foreground for the user to log in manually.
- Polls until the user completes login and returns to the search page.
- Default timeout: 5 minutes. Increase for slow institutional SSO flows.

### A6. get_query_language_profile
- Input: \`sessionId\`
- Returns: Field tags, boolean operators, wildcards, examples, constraints.
- READ THIS before constructing your query to use the correct syntax.
- Each provider has different field codes (e.g., PubMed uses [MeSH], WOS uses TS=).

---

## Phase B: Iterative Search & Refinement

This is the core research loop. Repeat until the results meet the user's requirements.

### B1. Construct the initial search query
- Based on the user's research topic, build a boolean query using the
  provider's syntax from \`get_query_language_profile\`.
- Start broad: use core concepts connected with AND.
- Example: "deep learning" AND "medical imaging"
- Incorporate ALL filtering (document type, year, language) directly into
  the query syntax. Do NOT rely on sidebar UI filters.

Query-based filtering quick reference:
- PubMed: Review[pt], english[la], 2020:2024[dp], Systematic Review[pt]
- WOS: PY=(2020-2024), WC=(Genetics & Heredity). NOTE: DT and LA are NOT
  query fields in current WOS — only available as post-search sidebar filters.
- Scopus: DOCTYPE(re), LANGUAGE(english), PUBYEAR AFT 2019, SUBJAREA(MEDI)
- IEEE: "Field Name":"value" syntax. NOTE: Year and content type CANNOT be
  filtered in query — use URL parameters or post-search facets.

### B2. run_search
- Input: \`sessionId\`, \`query\`, \`sampleSize\` (1-20, default 5)
- Submits the query and returns: summary (totalResults), result sample,
  filters, and export capability — all in one call.
- Check \`totalResults\`: too many (>10,000)? too few (<50)? Adjust in B5.

### B3. Evaluate titles — are results relevant?
- Use \`read_result_sample\` with a reasonable limit (e.g., 10-20).
- Scan the titles: Do they match the research topic?
- If most titles are off-topic, the query needs major revision -> go to B5.
- If titles look promising, proceed to B4 for deeper inspection.

### B4. Read abstracts — extract valuable keywords
- Use \`read_result_sample\` with \`sampleSize\` up to 20 to get abstracts.
  (\`run_search\` already returns abstracts if \`sampleSize\` was set.)
- From relevant abstracts, identify:
  - Synonyms and alternative terms for your concepts
  - MeSH terms, subject headings, or domain-specific vocabulary
  - Author keywords that could improve recall
- These become candidates for query expansion in B5.

### B5. Refine the search query
- Based on evaluation from B3/B4, adjust the query:
  - **Too many results**: Add more specific terms, use AND, narrow with field codes
  - **Too few results**: Add synonyms with OR, use wildcards, broaden field scope
  - **Off-topic results**: Add NOT exclusions, use more precise field tags
  - **Missing key papers**: Add newly discovered keywords from abstracts
- Example refinement:
  Round 1: "deep learning" AND "medical imaging"
  Round 2: ("deep learning" OR "convolutional neural network") AND
           ("medical imaging" OR "radiology" OR "diagnostic imaging")
  Round 3: ... AND NOT "survey" (if too many review papers)
- Go back to B2 with the refined query.

### B6. Decide: satisfied or iterate?
- If the results are relevant and the count is manageable -> proceed to Phase C.
- If not satisfied -> return to B5 and refine further.
- Typical iteration: 2-4 rounds of refinement.

---

## Phase C: Export & Cleanup

### C1. export_results
- Input: \`sessionId\`, \`request: { scope: "all", includeAbstracts?: boolean, outputDir?: string }\`
- Automates the provider's export UI to download results as RIS.
- \`outputDir\` copies the exported file to a custom directory.
- Some providers export natively as CSV/NBIB and auto-convert to RIS.
- Large exports (Scopus bulk) may take up to 3 minutes — be patient.

### C2. convert_export_to_ris (conditional)
- Input: \`sessionId\`, \`filePath\`, \`format\` (optional)
- Only needed if you have a previously downloaded file in non-RIS format.
- Converts NBIB, CSV, or BibTeX to RIS.

### C3. close_session
- Input: \`sessionId\`
- Closes the browser and cleans up resources.
- Always close sessions when done.

---

## Multi-Database Strategy

For comprehensive literature reviews, search across multiple databases:
1. Create sessions for 2-4 providers in parallel.
2. Use the same refined query (adapted to each provider's syntax).
3. Export RIS from each provider.
4. Merge and deduplicate RIS files externally (e.g., in a reference manager).

## Utility Tools

| Tool                      | Purpose                                              |
|---------------------------|------------------------------------------------------|
| get_session               | Check session metadata and current phase             |
| list_sessions             | See all active sessions                              |
| read_current_query        | Read what's currently in the query input              |
| select_results            | Select specific result rows by 1-based index         |
| clear_selection           | Clear all selected results                           |
| get_export_capability     | Check export limits and blockers before exporting    |
| capture_session_artifacts | Save DOM, screenshot, network log for debugging      |

## Tips & Best Practices

1. Always call \`get_query_language_profile\` before constructing queries.
2. Use \`run_search\` with the \`query\` parameter for a single-call search workflow.
3. Check \`nextActions\` in every response — it tells you what to do next.
4. Iterate on the query 2-4 times. The first query is rarely the best one.
5. Read abstracts of the top results to discover domain-specific keywords
   and synonyms you might have missed.
6. If a tool returns a ManualInterventionRequiredError, the user must interact
   with the headed browser. Use \`capture_session_artifacts\` to debug.
7. PubMed does not require login. WOS, Scopus, and IEEE may require
   institutional or personal access.
8. Use \`persistentProfile: true\` when creating sessions for providers that
   require login — this saves cookies for reuse.
9. The \`scope\` parameter for export only supports "all" — exporting selected
   results is not supported by design.
10. For systematic reviews, search at least 2-3 databases and merge results.
11. Incorporate all filtering (document type, year, language) directly into
   the query. Avoid sidebar UI filters — they depend on fragile CSS selectors.

## Anti-Patterns

- Do NOT call \`export_results\` before \`run_search\` — there are no results to export.
- Do NOT skip \`open_advanced_search\` — the browser needs to be on the right page.
- Do NOT call \`set_query\` then \`run_search\` with a query param (double-sets).
- Do NOT use sidebar UI filters — incorporate all filtering into the query syntax.
- Do NOT ignore the \`phase\` field — it tells you the session's current state.
- Do NOT export without first iterating on the query — refine until results are relevant.

## Session Phases

created -> starting -> ready -> awaiting_user_login -> search_ready ->
searching -> exporting -> completed -> closed
(error can occur at any point)

## Response Envelope

Every tool returns:
{
  "ok": true/false,
  "provider": "provider_id",
  "sessionId": "uuid",
  "phase": "current_phase",
  "timestamp": "ISO string",
  "warnings": [],
  "nextActions": ["next_tool_1", "next_tool_2"],
  "data": { ... }
}
Always check \`ok\` and follow \`nextActions\`.
`;
