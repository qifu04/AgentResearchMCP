import { describe, expect, it, vi } from "vitest";
import { SessionLock } from "../src/core/session-lock.js";
import type { SessionManager } from "../src/core/session-manager.js";
import type { SearchProviderAdapter } from "../src/adapters/provider-contract.js";
import { SearchService } from "../src/services/search-service.js";
import type { SessionRecord } from "../src/types/session.js";

function createHarness(currentQuery: string | null) {
  const calls: string[] = [];
  const page = {
    waitForLoadState: vi.fn(async () => undefined),
    url: vi.fn(() => "about:blank"),
  } as any;

  const record: SessionRecord = {
    id: "session-1",
    provider: "ieee",
    phase: "search_ready",
    createdAt: "2026-03-19T00:00:00.000Z",
    updatedAt: "2026-03-19T00:00:00.000Z",
    persistentProfile: false,
    headed: true,
    lastError: null,
  };

  const session = {
    record,
    runtime: { page },
    paths: {
      rootDir: "",
      domDir: "",
      networkDir: "",
      storageDir: "",
      downloadsDir: "",
      exportsDir: "",
      screenshotsDir: "",
      sessionFile: "",
      stateFile: "",
    },
    networkEntries: [],
    consoleEntries: [],
  };

  const adapter = {
    descriptor: {
      id: "ieee",
      displayName: "IEEE Xplore",
      entryUrl: "https://example.com/advanced",
      supportsManualLoginWait: true,
      capabilities: {
        rawQuery: true,
        builderUi: true,
        filters: false,
        inlineAbstracts: true,
        selection: true,
        export: true,
      },
    },
    openAdvancedSearch: vi.fn(),
    clearInterferingUi: vi.fn(),
    detectLoginState: vi.fn(async () => ({
      kind: "institutional",
      authenticated: false,
      canSearch: true,
      canExport: true,
      detectedBy: ["test"],
    })),
    getQueryLanguageProfile: vi.fn(async () => ({
      provider: "ieee",
      supportsRawEditor: true,
      supportsBuilderUi: true,
      supportsUrlQueryRecovery: true,
      fieldTags: [],
      booleanOperators: ["AND", "OR", "NOT"],
      examples: [],
      constraints: [],
      recommendedPatterns: [],
      antiPatterns: [],
    })),
    readCurrentQuery: vi.fn(async () => {
      calls.push("readCurrentQuery");
      return currentQuery;
    }),
    setCurrentQuery: vi.fn(async (_context, query: string) => {
      calls.push(`setCurrentQuery:${query}`);
    }),
    submitSearch: vi.fn(async () => {
      calls.push("submitSearch");
      return {
        provider: "ieee",
        query: currentQuery ?? "",
        totalResultsText: "1",
        totalResults: 1,
        currentPage: 1,
        totalPages: 1,
        pageSize: 10,
        queryId: null,
        sort: "relevance",
      };
    }),
    readSearchSummary: vi.fn(async () => ({
      provider: "ieee",
      query: currentQuery ?? "",
      totalResultsText: "1",
      totalResults: 1,
      currentPage: 1,
      totalPages: 1,
      pageSize: 10,
      queryId: null,
      sort: "relevance",
    })),
    readResultItems: vi.fn(async () => []),
    readResultAbstracts: vi.fn(async () => []),
    listFilters: vi.fn(async () => []),
    applyFilters: vi.fn(),
    selectResultsByIndex: vi.fn(),
    clearSelection: vi.fn(),
    detectExportCapability: vi.fn(async () => ({
      requiresInteractiveLogin: false,
      maxBatch: null,
      blockingReason: null,
    })),
    exportNative: vi.fn(),
    runStartupProbe: vi.fn(),
  };

  const sessionManager = {
    ensureRuntime: vi.fn(async () => session),
    buildProviderContext: vi.fn(() => ({
      provider: record.provider,
      sessionId: record.id,
      phase: record.phase,
      artifactsDir: "",
      downloadsDir: "",
      page,
    })),
    setPhase: vi.fn(async (_sessionId: string, phase: SessionRecord["phase"]) => {
      record.phase = phase;
      return session;
    }),
    requireSession: vi.fn(async () => session),
    markError: vi.fn(async () => session),
  };

  const service = new SearchService(
    {
      get: vi.fn(() => adapter as unknown as SearchProviderAdapter),
    },
    {
      workspaceRoot: "C:\\agent-research-mcp-test",
      sessionManager: sessionManager as unknown as SessionManager,
      sessionLock: new SessionLock(),
      exportManager: {} as never,
      loginOrchestrator: {} as never,
    },
  );

  return { service, adapter, calls };
}

describe("SearchService.runSearch", () => {
  it("reapplies an explicit query before submitting the search", async () => {
    const { service, adapter, calls } = createHarness("TITLE(existing)");
    const query = '"Document Title":"deep learning"';

    await service.runSearch("session-1", { query });

    expect(adapter.readCurrentQuery).not.toHaveBeenCalled();
    expect(adapter.setCurrentQuery).toHaveBeenCalledOnce();
    expect(adapter.setCurrentQuery).toHaveBeenCalledWith(expect.anything(), query);
    expect(calls).toEqual([`setCurrentQuery:${query}`, "submitSearch"]);
  });

  it("reopens advanced search with the recovered current query when query is omitted", async () => {
    const { service, adapter, calls } = createHarness('TITLE("graph neural network")');

    await service.runSearch("session-1");

    expect(adapter.readCurrentQuery).toHaveBeenCalledOnce();
    expect(adapter.setCurrentQuery).toHaveBeenCalledOnce();
    expect(adapter.setCurrentQuery).toHaveBeenCalledWith(expect.anything(), 'TITLE("graph neural network")');
    expect(calls).toEqual([
      "readCurrentQuery",
      'setCurrentQuery:TITLE("graph neural network")',
      "submitSearch",
    ]);
  });

  it("falls back to submitting when the current query cannot be recovered", async () => {
    const { service, adapter, calls } = createHarness(null);

    await service.runSearch("session-1");

    expect(adapter.readCurrentQuery).toHaveBeenCalledOnce();
    expect(adapter.setCurrentQuery).not.toHaveBeenCalled();
    expect(calls).toEqual(["readCurrentQuery", "submitSearch"]);
  });
});
