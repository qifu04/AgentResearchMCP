import { describe, expect, it, vi } from "vitest";
import { registerTools } from "../src/server/tool-registry.js";

function createServerHarness() {
  const tools = new Map<string, { config: unknown; handler: (args: any, extra?: any) => Promise<any> }>();
  const server = {
    registerTool: vi.fn((name: string, config: unknown, handler: (args: any, extra?: any) => Promise<any>) => {
      tools.set(name, { config, handler });
    }),
  };

  return { server, tools };
}

describe("registerTools", () => {
  it("registers only the minimal public MCP tools", () => {
    const { server, tools } = createServerHarness();
    const descriptor = {
      id: "pubmed",
      displayName: "PubMed",
      entryUrl: "https://example.com",
      supportsManualLoginWait: false,
      capabilities: {
        rawQuery: true,
        builderUi: false,
        filters: false,
        inlineAbstracts: true,
        selection: false,
        export: true,
      },
    };
    const providers = {
      listDescriptors: vi.fn(() => [descriptor]),
      get: vi.fn(() => ({
        descriptor,
        queryProfile: {
          provider: "pubmed",
          supportsRawEditor: true,
          supportsBuilderUi: false,
          supportsUrlQueryRecovery: true,
          fieldTags: [],
          booleanOperators: ["AND", "OR", "NOT"],
          examples: [],
          constraints: [],
          recommendedPatterns: [],
          antiPatterns: [],
        },
      })),
    };
    const service = {
      createSession: vi.fn(),
      closeSession: vi.fn(),
      getSession: vi.fn(),
      readCurrentQuery: vi.fn(),
      runSearch: vi.fn(),
      exportResults: vi.fn(),
    };

    registerTools(server as never, service as never, providers as never);

    expect(server.registerTool).toHaveBeenCalledTimes(6);
    expect(Array.from(tools.keys())).toEqual([
      "create_session",
      "close_session",
      "read_current_query",
      "run_search",
      "export_results",
      "list_providers",
    ]);
  });

  it("inlines the query profile into create_session and fixes export_results to current RIS export", async () => {
    const { server, tools } = createServerHarness();
    const descriptor = {
      id: "pubmed",
      displayName: "PubMed",
      entryUrl: "https://example.com",
      supportsManualLoginWait: false,
      capabilities: {
        rawQuery: true,
        builderUi: false,
        filters: false,
        inlineAbstracts: true,
        selection: false,
        export: true,
      },
    };
    const queryProfile = {
      provider: "pubmed",
      supportsRawEditor: true,
      supportsBuilderUi: false,
      supportsUrlQueryRecovery: true,
      fieldTags: [{ code: "TIAB", label: "Title/Abstract" }],
      booleanOperators: ["AND", "OR", "NOT"],
      examples: ["cancer AND therapy"],
      constraints: ["Use PubMed field tags."],
      recommendedPatterns: ["Combine synonyms with OR."],
      antiPatterns: ["Do not use sidebar filters."],
    };
    const sessionRecord = {
      id: "session-1",
      provider: "pubmed",
      phase: "created",
      createdAt: "2026-03-19T00:00:00.000Z",
      updatedAt: "2026-03-19T00:00:00.000Z",
      persistentProfile: false,
      headed: true,
      lastError: null,
    };
    const service = {
      createSession: vi.fn(async () => sessionRecord),
      closeSession: vi.fn(async () => ({ ...sessionRecord, phase: "closed" })),
      getSession: vi.fn(async () => sessionRecord),
      readCurrentQuery: vi.fn(async () => "cancer AND therapy"),
      runSearch: vi.fn(async () => ({
        query: "cancer AND therapy",
        totalResults: 42,
        totalResultsText: "42",
        results: [],
      })),
      exportResults: vi.fn(async () => ({
        provider: "pubmed",
        format: "ris",
        path: "C:/exports/pubmed.ris",
        fileName: "pubmed.ris",
      })),
    };
    const providers = {
      listDescriptors: vi.fn(() => [descriptor]),
      get: vi.fn(() => ({ descriptor, queryProfile })),
    };

    registerTools(server as never, service as never, providers as never);

    const createSessionResult = await tools.get("create_session")!.handler({ provider: "pubmed" });
    expect(service.createSession).toHaveBeenCalledWith({
      provider: "pubmed",
      profileKey: undefined,
      persistentProfile: undefined,
    });
    expect(createSessionResult.structuredContent.data).toMatchObject({
      sessionId: "session-1",
      provider: "pubmed",
      displayName: "PubMed",
      queryProfile,
    });

    const exportResult = await tools.get("export_results")!.handler({
      sessionId: "session-1",
      outputDir: "C:/exports",
    });
    expect(service.exportResults).toHaveBeenCalledWith("session-1", {
      request: {
        scope: "all",
        outputDir: "C:/exports",
      },
    });
    expect(exportResult.structuredContent.data).toEqual({
      path: "C:/exports/pubmed.ris",
      fileName: "pubmed.ris",
      format: "ris",
    });
  });
});
