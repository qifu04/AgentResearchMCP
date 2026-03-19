import { describe, expect, it, vi } from "vitest";
import type { SessionRecord } from "../src/types/session.js";
import { resolveStartupPreflightOptions, StartupPreflightCoordinator } from "../src/core/startup-preflight.js";
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

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      provider: "wos",
      mode: "full",
      loginVerified: true,
      searchVerified: true,
      exportVerified: true,
      totalResults: 1,
    });
    expect(calls).toEqual([
      "create:wos",
      "open:session-wos",
      "login:session-wos",
      "wait:session-wos",
      "open:session-wos",
      "probe:session-wos",
      "close:session-wos",
    ]);
    expect(service.runStartupProbe).toHaveBeenCalledWith("session-wos", { verifyExport: true });
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

  it("supports provider filtering and search-only mode for faster debugging", async () => {
    const createSession = vi.fn(async ({ provider }: { provider: string }) => createSessionRecord(`session-${provider}`, provider));
    const runStartupProbe = vi.fn(async () => ({
      provider: "ieee",
      query: "probe",
      totalResults: 3,
      exportVerified: false,
      format: null,
    }));
    const service = {
      createSession,
      openAdvancedSearch: vi.fn(async (sessionId: string) => createSessionRecord(sessionId, "ieee")),
      getLoginState: vi.fn(async () => ({
        kind: "institutional",
        authenticated: true,
        canSearch: true,
        canExport: true,
        detectedBy: ["test"],
      })),
      waitForLogin: vi.fn(),
      runStartupProbe,
      closeSession: vi.fn(async (sessionId: string) => createSessionRecord(sessionId, "ieee")),
      sessionManager: {
        getSession: vi.fn(async () => null),
      },
    } as unknown as SearchService;

    const coordinator = new StartupPreflightCoordinator(
      service,
      {
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
          {
            id: "ieee",
            displayName: "IEEE Xplore",
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
      },
      {
        providers: ["ieee"],
        mode: "search-only",
      },
    );

    const result = await coordinator.run();

    expect(createSession).toHaveBeenCalledTimes(1);
    expect(createSession).toHaveBeenCalledWith({
      provider: "ieee",
      persistentProfile: true,
    });
    expect(runStartupProbe).toHaveBeenCalledWith("session-ieee", { verifyExport: false });
    expect(result[0]).toMatchObject({
      provider: "ieee",
      mode: "search-only",
      loginVerified: true,
      searchVerified: true,
      exportVerified: false,
      totalResults: 3,
    });
  });

  it("runs provider preflights in parallel and preserves descriptor order in results", async () => {
    const calls: string[] = [];
    let releaseSlowProbe!: () => void;
    const slowProbeGate = new Promise<void>((resolve) => {
      releaseSlowProbe = () => resolve();
    });

    const service = {
      createSession: vi.fn(async ({ provider }: { provider: string }) => {
        calls.push(`create:${provider}`);
        return createSessionRecord(`session-${provider}`, provider);
      }),
      openAdvancedSearch: vi.fn(async (sessionId: string) => {
        calls.push(`open:${sessionId}`);
        const provider = sessionId.replace("session-", "");
        return createSessionRecord(sessionId, provider);
      }),
      getLoginState: vi.fn(async (sessionId: string) => {
        calls.push(`login:${sessionId}`);
        return {
          kind: "institutional",
          authenticated: true,
          canSearch: true,
          canExport: true,
          detectedBy: ["test"],
        };
      }),
      waitForLogin: vi.fn(),
      runStartupProbe: vi.fn(async (sessionId: string) => {
        calls.push(`probe:start:${sessionId}`);
        if (sessionId === "session-wos") {
          await slowProbeGate;
        }
        calls.push(`probe:end:${sessionId}`);
        return {
          provider: sessionId.replace("session-", ""),
          query: "probe",
          totalResults: sessionId === "session-wos" ? 1 : 2,
          exportVerified: true,
          format: "ris",
        };
      }),
      closeSession: vi.fn(async (sessionId: string) => {
        calls.push(`close:${sessionId}`);
        const provider = sessionId.replace("session-", "");
        return createSessionRecord(sessionId, provider);
      }),
      sessionManager: {
        getSession: vi.fn(async () => null),
      },
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
        {
          id: "ieee",
          displayName: "IEEE Xplore",
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

    const runPromise = coordinator.run();
    await vi.waitFor(() => {
      expect(calls).toContain("probe:start:session-ieee");
    });

    expect(calls).toContain("probe:start:session-wos");
    expect(calls).not.toContain("probe:end:session-wos");

    releaseSlowProbe();
    const result = await runPromise;

    expect(result.map((entry) => entry.provider)).toEqual(["wos", "ieee"]);
    expect(result).toEqual([
      expect.objectContaining({
        provider: "wos",
        exportVerified: true,
        totalResults: 1,
      }),
      expect.objectContaining({
        provider: "ieee",
        exportVerified: true,
        totalResults: 2,
      }),
    ]);
  });

  it("waits for all parallel providers to settle before surfacing combined failures", async () => {
    const closeSession = vi.fn(async (sessionId: string) => createSessionRecord(sessionId, sessionId.replace("session-", "")));
    let releaseSlowProbe!: () => void;
    const slowProbeGate = new Promise<void>((resolve) => {
      releaseSlowProbe = () => resolve();
    });

    const service = {
      createSession: vi.fn(async ({ provider }: { provider: string }) => createSessionRecord(`session-${provider}`, provider)),
      openAdvancedSearch: vi.fn(async (sessionId: string) => createSessionRecord(sessionId, sessionId.replace("session-", ""))),
      getLoginState: vi.fn(async () => ({
        kind: "institutional",
        authenticated: true,
        canSearch: true,
        canExport: true,
        detectedBy: ["test"],
      })),
      waitForLogin: vi.fn(),
      runStartupProbe: vi.fn(async (sessionId: string) => {
        if (sessionId === "session-wos") {
          await slowProbeGate;
          return {
            provider: "wos",
            query: "probe",
            totalResults: 1,
            exportVerified: true,
            format: "ris",
          };
        }
        throw new Error("probe failed");
      }),
      closeSession,
      sessionManager: {
        getSession: vi.fn(async () => null),
      },
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

    const runPromise = coordinator.run();
    await vi.waitFor(() => {
      expect(service.runStartupProbe).toHaveBeenCalledWith("session-scopus", { verifyExport: true });
    });
    expect(closeSession).toHaveBeenCalledTimes(1);

    releaseSlowProbe();

    await expect(runPromise).rejects.toThrow(/Scopus/i);
    expect(closeSession).toHaveBeenCalledTimes(2);
    expect(closeSession).toHaveBeenCalledWith("session-wos");
    expect(closeSession).toHaveBeenCalledWith("session-scopus");
  });
});

describe("resolveStartupPreflightOptions", () => {
  it("parses filter, mode, trace, and metrics env vars", () => {
    expect(
      resolveStartupPreflightOptions({
        STARTUP_PREFLIGHT_PROVIDERS: "wos, ieee",
        STARTUP_PREFLIGHT_MODE: "search-only",
        STARTUP_PREFLIGHT_TRACE: "1",
        STARTUP_PREFLIGHT_METRICS: "true",
        STARTUP_PREFLIGHT_MAX_ATTEMPTS: "4",
      } as NodeJS.ProcessEnv),
    ).toEqual({
      providers: ["wos", "ieee"],
      mode: "search-only",
      trace: true,
      collectBrowserMetrics: true,
      maxAttempts: 4,
    });
  });

  it("rejects invalid modes", () => {
    expect(() =>
      resolveStartupPreflightOptions({
        STARTUP_PREFLIGHT_MODE: "export-only",
      } as NodeJS.ProcessEnv),
    ).toThrow(/STARTUP_PREFLIGHT_MODE/i);
  });
});
