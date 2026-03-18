import { describe, expect, it, vi } from "vitest";
import type { SessionRecord } from "../src/types/session.js";
import { StartupPreflightCoordinator } from "../src/core/startup-preflight.js";
import type { SearchService } from "../src/services/search-service.js";

function createSessionRecord(id: string, provider: string): SessionRecord {
  return {
    id,
    provider,
    phase: "created",
    createdAt: "2026-03-18T00:00:00.000Z",
    updatedAt: "2026-03-18T00:00:00.000Z",
    persistentProfile: true,
    headed: true,
    lastError: null,
  };
}

describe("StartupPreflightCoordinator", () => {
  it("waits for login before running the startup probe when export is not ready", async () => {
    const calls: string[] = [];
    const service = {
      createSession: vi.fn(async ({ provider }: { provider: string }) => {
        calls.push(`create:${provider}`);
        return createSessionRecord(`session-${provider}`, provider);
      }),
      openAdvancedSearch: vi.fn(async (sessionId: string) => {
        calls.push(`open:${sessionId}`);
        return createSessionRecord(sessionId, "wos");
      }),
      getLoginState: vi.fn(async (sessionId: string) => {
        calls.push(`login:${sessionId}`);
        return {
          kind: "anonymous",
          authenticated: false,
          canSearch: false,
          canExport: false,
          detectedBy: ["test"],
        };
      }),
      waitForLogin: vi.fn(async (sessionId: string) => {
        calls.push(`wait:${sessionId}`);
        return {
          kind: "institutional",
          authenticated: false,
          canSearch: true,
          canExport: true,
          detectedBy: ["test"],
        };
      }),
      runStartupProbe: vi.fn(async (sessionId: string) => {
        calls.push(`probe:${sessionId}`);
        return {
          provider: "wos",
          query: "probe",
          totalResults: 1,
          exportVerified: true,
          format: "ris",
        };
      }),
      closeSession: vi.fn(async (sessionId: string) => {
        calls.push(`close:${sessionId}`);
        return createSessionRecord(sessionId, "wos");
      }),
    } as unknown as SearchService;

    const coordinator = new StartupPreflightCoordinator(service, {
      listDescriptors: () => [
        {
          id: "wos",
          displayName: "Web of Science",
          entryUrl: "https://example.com",
          supportsManualLoginWait: true,
          capabilities: {
            rawQuery: true,
            builderUi: true,
            filters: true,
            inlineAbstracts: true,
            selection: true,
            export: true,
          },
        },
      ],
    });

    const result = await coordinator.run();

    expect(result).toEqual([
      {
        provider: "wos",
        loginVerified: true,
        exportVerified: true,
        totalResults: 1,
      },
    ]);
    expect(calls).toEqual([
      "create:wos",
      "open:session-wos",
      "login:session-wos",
      "wait:session-wos",
      "open:session-wos",
      "probe:session-wos",
      "close:session-wos",
    ]);
  });

  it("always closes the session when preflight fails", async () => {
    const closeSession = vi.fn(async (sessionId: string) => createSessionRecord(sessionId, "scopus"));
    const service = {
      createSession: vi.fn(async ({ provider }: { provider: string }) => createSessionRecord(`session-${provider}`, provider)),
      openAdvancedSearch: vi.fn(async () => createSessionRecord("session-scopus", "scopus")),
      getLoginState: vi.fn(async () => ({
        kind: "personal",
        authenticated: true,
        canSearch: true,
        canExport: true,
        detectedBy: ["test"],
      })),
      waitForLogin: vi.fn(),
      runStartupProbe: vi.fn(async () => {
        throw new Error("probe failed");
      }),
      closeSession,
    } as unknown as SearchService;

    const coordinator = new StartupPreflightCoordinator(service, {
      listDescriptors: () => [
        {
          id: "scopus",
          displayName: "Scopus",
          entryUrl: "https://example.com",
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
      ],
    });

    await expect(coordinator.run()).rejects.toThrow(/Scopus.*probe failed/i);
    expect(closeSession).toHaveBeenCalledWith("session-scopus");
  });
});
