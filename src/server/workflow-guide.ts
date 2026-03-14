/**
 * Pre-defined workflow guide returned by the get_workflow_guide MCP tool.
 * This serves as a "system prompt" for AI agents using this MCP server.
 */
export const WORKFLOW_GUIDE = `
# Agent Research MCP — Workflow Guide

## Overview

This MCP server automates scholarly literature searches across academic databases
using real browser sessions (Playwright). It handles login detection, query entry,
search execution, result scraping, filtering, and RIS export.

Every tool response includes a \`nextActions\` array telling you what to call next.
Always check \`ok\` and \`nextActions\` in every response.

## Available Providers

| ID       | Name                              | Login Required | Notes                          |
|----------|-----------------------------------|----------------|--------------------------------|
| pubmed   | PubMed                            | No             | Fully open access              |
| wos      | Web of Science Core Collection    | Yes            | Institutional access required  |
| ieee     | IEEE Xplore                       | Yes            | Institutional or personal      |
| scopus   | Scopus                            | Yes            | Institutional or personal      |

## Canonical Workflow

### Step 1: list_providers
- Input: none
- Returns: Array of provider descriptors with capabilities.
- Use this to discover available providers and their features.

### Step 2: create_session
- Input: \`provider\` (required), \`persistentProfile\` (optional, boolean)
- Returns: \`sessionId\` — use this in all subsequent calls.
- Set \`persistentProfile: true\` to reuse login cookies across sessions.
- A headed browser window opens automatically.

### Step 3: open_advanced_search
- Input: \`sessionId\`
- Navigates the browser to the provider's advanced search page.
- Automatically dismisses cookie banners and overlays.
- MUST be called before any search operations.

### Step 4: get_login_state
- Input: \`sessionId\`
- Returns: \`LoginState\` with \`kind\`, \`canSearch\`, \`canExport\`, \`institutionAccess\`.
- If \`canSearch: true\` → proceed to Step 6.
- If \`canSearch: false\` → proceed to Step 5 (wait_for_login).

### Step 5: wait_for_login (conditional)
- Input: \`sessionId\`, \`capability\` ("search" | "export" | "personal"), \`timeoutMs\`, \`pollMs\`
- Only needed when get_login_state shows \`canSearch: false\`.
- Brings the browser window to the foreground for the user to log in manually.
- Polls until the user completes login and returns to the search page.
- Default timeout: 5 minutes. Increase for slow institutional SSO flows.

### Step 6: get_query_language_profile
- Input: \`sessionId\`
- Returns: Field tags, boolean operators, wildcards, examples, constraints.
- READ THIS before constructing your query to use the correct syntax.
- Each provider has different field codes (e.g., PubMed uses [MeSH], WOS uses TS=).

### Step 7: run_search (preferred) or set_query + submit
- Input: \`sessionId\`, \`query\` (optional), \`sampleSize\` (1-20, default 5)
- \`run_search\` with a \`query\` parameter is the single-call shortcut:
  it sets the query, submits, and returns results in one step.
- Returns: Full search observation — summary, result sample, filters, export capability.
- Alternative: call \`set_query\` then \`run_search\` without query param.
- Do NOT call both \`set_query\` AND \`run_search\` with query (double-sets the query).

### Step 8: Inspect Results (optional)
- \`read_search_summary\`: Re-read total results, pagination info.
- \`read_result_sample\`: Read first N result titles, authors, abstracts.
- \`list_filters\`: See available filter facets (year, document type, etc.).

### Step 9: apply_filters (optional)
- Input: \`sessionId\`, \`filters\` (array of \`{key, values}\`)
- Filter keys come from the \`list_filters\` response.
- Returns updated search observation after applying filters.
- Only available if the provider's \`capabilities.filters\` is true.

### Step 10: export_results
- Input: \`sessionId\`, \`request: { scope: "all", includeAbstracts?: boolean, outputDir?: string }\`
- Automates the provider's export UI to download results as RIS.
- \`outputDir\` copies the exported file to a custom directory.
- Some providers export natively as CSV/NBIB and auto-convert to RIS.
- Large exports (Scopus bulk) may take up to 3 minutes — be patient.

### Step 11: convert_export_to_ris (conditional)
- Input: \`sessionId\`, \`filePath\`, \`format\` (optional)
- Only needed if you have a previously downloaded file in non-RIS format.
- Converts NBIB, CSV, or BibTeX to RIS.

### Step 12: close_session
- Input: \`sessionId\`
- Closes the browser and cleans up resources.
- Always close sessions when done.

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
4. If a tool returns a ManualInterventionRequiredError, the user must interact
   with the headed browser. Use \`capture_session_artifacts\` to debug.
5. PubMed does not require login. WOS, Scopus, and IEEE may require
   institutional or personal access.
6. Use \`persistentProfile: true\` when creating sessions for providers that
   require login — this saves cookies for reuse.
7. The \`scope\` parameter for export only supports "all" — exporting selected
   results is not supported by design.

## Anti-Patterns

- Do NOT call \`export_results\` before \`run_search\` — there are no results to export.
- Do NOT skip \`open_advanced_search\` — the browser needs to be on the right page.
- Do NOT assume all providers support filters — check \`capabilities.filters\`.
- Do NOT call \`set_query\` then \`run_search\` with a query param (double-sets).
- Do NOT ignore the \`phase\` field — it tells you the session's current state.
- Do NOT call \`apply_filters\` on providers with \`capabilities.filters: false\`.

## Session Phases

\`\`\`
created → starting → ready → awaiting_user_login → search_ready →
searching → exporting → completed → closed
(error can occur at any point)
\`\`\`

## Response Envelope

Every tool returns:
\`\`\`json
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
\`\`\`
Always check \`ok\` and follow \`nextActions\`.
`;
