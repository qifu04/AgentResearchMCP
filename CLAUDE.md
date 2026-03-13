# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

A Playwright-driven MCP (Model Context Protocol) server that lets AI agents perform scholarly literature searches across multiple academic databases (Web of Science, PubMed, IEEE Xplore, Scopus). It automates real browser sessions — login detection, query entry, search execution, result scraping, filtering, and export — exposing everything as MCP tools.

## Commands

```bash
npm run build        # tsc compile → dist/
npm run dev          # run server via tsx (stdio transport)
npm run check        # type-check without emitting
npm run test         # vitest run (single pass)
npm run test:watch   # vitest in watch mode
```

Run a single test: `npx vitest run tests/session-lock.test.ts`

## Architecture

### Layered Design

```
MCP Client ↔ server/index.ts (stdio transport)
               ↓
           server/tool-registry.ts  → registers ~20 MCP tools
               ↓
           services/search-service.ts → orchestrates all operations
               ↓
           adapters/<provider>/adapter.ts → Playwright automation per site
           core/* → session lifecycle, export, login, artifacts
           browser/* → Playwright factory, page helpers, profile store
```

### Key Abstractions

- **`SearchProviderAdapter`** (adapters/provider-contract.ts): The central interface every provider implements. Defines the full lifecycle: `openAdvancedSearch` → `detectLoginState` → `setCurrentQuery` → `submitSearch` → `readResultItems` → `exportNative`, etc.

- **`ProviderContext`**: Passed to every adapter method — contains the Playwright `Page`, session ID, phase, and directory paths.

- **`SearchService`** (services/search-service.ts): Stateful orchestrator. Wraps every adapter call with session locking (`SessionLock`), runtime bootstrapping (`ensureRuntime`), and error tracking. All MCP tool handlers delegate here.

- **`SessionManager`** (core/session-manager.ts): Manages `ManagedSession` objects — creates browser runtimes on demand, persists session records to `.agent-research-mcp/sessions/<id>/session.json`, attaches console/network observers.

- **`ToolEnvelope<T>`**: Every MCP tool response is wrapped in a standard envelope with `ok`, `provider`, `sessionId`, `phase`, `timestamp`, `nextActions`, and `data`.

### Adapter Structure

Each provider lives in `src/adapters/<id>/` with four files:
- `descriptor.ts` — static `ProviderDescriptor` (id, URL, capabilities)
- `query-profile.ts` — `QueryLanguageProfile` (field tags, operators, examples)
- `selectors.ts` — CSS/text selectors for page elements
- `adapter.ts` — `SearchProviderAdapter` implementation

Providers are registered in `adapters/registry.ts`. Current providers: `wos`, `pubmed`, `ieee`, `scopus`.

### Session Lifecycle Phases

`created → starting → ready → awaiting_user_login → search_ready → searching → exporting → completed → closed` (or `error` at any point)

### State on Disk

The server writes session state under `.agent-research-mcp/` in the working directory:
- `sessions/<uuid>/` — session.json, DOM snapshots, screenshots, network logs, downloads, exports
- `auth/` — persistent browser profiles for login reuse

## Conventions

- ESM-only (`"type": "module"` in package.json). All local imports use `.js` extensions.
- Zod v4 for MCP tool input schemas (imported as `zod/v4`).
- `@modelcontextprotocol/sdk` for MCP server primitives.
- Adapter methods receive `ProviderContext` and return normalized types — never raw Playwright objects.
- Browser helpers in `browser/page-helpers.ts` (`runWithPageLoad`, `clickIfVisible`, `fillAndVerify`, `waitForDocumentReady`) handle common Playwright patterns.
