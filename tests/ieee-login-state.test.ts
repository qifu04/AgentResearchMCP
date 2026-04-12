import { describe, expect, it } from "vitest";
import type { ProviderContext } from "../src/adapters/provider-contract.js";
import { IeeeAdapter } from "../src/adapters/ieee/adapter.js";

type MockIeeeSignals = {
  url: string;
  title: string;
  bodyText: string;
  institution: string | null;
  onAdvancedSearchPage: boolean;
  onResultsPage: boolean;
  hasVisibleQueryInput: boolean;
  hasVisibleExportButton: boolean;
  hasResultCards: boolean;
  hasSearchSummary: boolean;
  hasErrorPage: boolean;
  hasErrorCode418: boolean;
};

const adapter = new IeeeAdapter();

function makeContext(state: MockIeeeSignals): ProviderContext {
  return {
    provider: "ieee",
    sessionId: "session-1",
    phase: "search_ready",
    artifactsDir: "",
    downloadsDir: "",
    page: {
      evaluate: async () => state,
    } as never,
  };
}

function makeState(overrides: Partial<MockIeeeSignals> = {}): MockIeeeSignals {
  return {
    url: "https://ieeexplore.ieee.org/search/advanced/command",
    title: "IEEE Xplore: Advanced Search",
    bodyText: "",
    institution: null,
    onAdvancedSearchPage: true,
    onResultsPage: false,
    hasVisibleQueryInput: true,
    hasVisibleExportButton: false,
    hasResultCards: false,
    hasSearchSummary: false,
    hasErrorPage: false,
    hasErrorCode418: false,
    ...overrides,
  };
}

describe("IeeeAdapter.detectLoginState", () => {
  it("treats institutional advanced-search sessions as export-ready", async () => {
    const loginState = await adapter.detectLoginState(
      makeContext(
        makeState({
          bodyText: "Access provided by: Peking University",
          institution: "Peking University",
        }),
      ),
    );

    expect(loginState.kind).toBe("institutional");
    expect(loginState.authenticated).toBe(false);
    expect(loginState.canSearch).toBe(true);
    expect(loginState.canExport).toBe(true);
    expect(loginState.blockingReason).toBeNull();
  });

  it("treats unavailable-load result pages as blocked even when queryText is present", async () => {
    const loginState = await adapter.detectLoginState(
      makeContext(
        makeState({
          url: "https://ieeexplore.ieee.org/search/searchresult.jsp?action=search&queryText=(%22machine%20learning%22)",
          title: "IEEE Xplore - Unavailable to Load",
          bodyText: "IEEE Xplore - Unable to Load Page\nError Code: 418\nYour support ID is: <123>",
          institution: null,
          onAdvancedSearchPage: false,
          onResultsPage: true,
          hasVisibleQueryInput: false,
          hasErrorPage: true,
          hasErrorCode418: true,
        }),
      ),
    );

    expect(loginState.kind).toBe("anonymous");
    expect(loginState.authenticated).toBe(false);
    expect(loginState.canSearch).toBe(false);
    expect(loginState.canExport).toBe(false);
    expect(loginState.requiresInteractiveLogin).toBe(false);
    expect(loginState.blockingReason).toMatch(/418|unavailable-load page/i);
    expect(loginState.detectedBy).toContain("page:error-418");
  });
});

describe("IeeeAdapter.detectExportCapability", () => {
  it("blocks export on advanced search before results are shown", async () => {
    const exportCapability = await adapter.detectExportCapability(
      makeContext(
        makeState({
          bodyText: "Access provided by: Peking University",
          institution: "Peking University",
          hasVisibleExportButton: false,
        }),
      ),
    );

    expect(exportCapability.requiresInteractiveLogin).toBe(false);
    expect(exportCapability.blockingReason).toMatch(/run a search before exporting/i);
  });

  it("propagates login blocking when institutional access is missing", async () => {
    const exportCapability = await adapter.detectExportCapability(
      makeContext(
        makeState({
          bodyText: "Create Account\nPersonal Sign In",
          institution: null,
          hasVisibleQueryInput: true,
        }),
      ),
    );

    expect(exportCapability.requiresInteractiveLogin).toBe(true);
    expect(exportCapability.blockingReason).toMatch(/institutional access was not detected/i);
  });
});
