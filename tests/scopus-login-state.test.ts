import { describe, expect, it } from "vitest";
import type { ProviderContext } from "../src/adapters/provider-contract.js";
import { ScopusAdapter } from "../src/adapters/scopus/adapter.js";

type MockScopusState = {
  url: string;
  title: string;
  isPreviewPage: boolean | null;
  isLoggedInUser: boolean | null;
  isIndividuallyAuthenticated: boolean | null;
  accessTypeAA: string | null;
  usagePathInfo: string | null;
  email: string | null;
  isIndividual: boolean | null;
  hasUserMenu: boolean;
  hasSigninButton: boolean;
  hasSearchForm: boolean;
  bodyText: string;
};

const adapter = new ScopusAdapter();

function makeContext(state: MockScopusState): ProviderContext {
  return {
    provider: "scopus",
    sessionId: "session-1",
    phase: "search_ready",
    artifactsDir: "",
    downloadsDir: "",
    page: {
      evaluate: async () => state,
    } as never,
  };
}

function makeState(overrides: Partial<MockScopusState> = {}): MockScopusState {
  return {
    url: "https://www.scopus.com/results/results.uri",
    title: "Scopus",
    isPreviewPage: false,
    isLoggedInUser: null,
    isIndividuallyAuthenticated: null,
    accessTypeAA: null,
    usagePathInfo: null,
    email: null,
    isIndividual: null,
    hasUserMenu: false,
    hasSigninButton: false,
    hasSearchForm: false,
    bodyText: "",
    ...overrides,
  };
}

describe("ScopusAdapter.detectLoginState", () => {
  it("treats registered home-page sessions as personal logins", async () => {
    const loginState = await adapter.detectLoginState(
      makeContext(
        makeState({
          url: "https://www.scopus.com/pages/home",
          accessTypeAA: "ae:REG:SHIBBOLETH:INST:SHIBBOLETH",
          usagePathInfo: "(SCOPUS,SSO|REG_SHIBBOLETH,ACCESS_TYPE)",
          email: "user@example.edu",
          hasUserMenu: true,
        }),
      ),
    );

    expect(loginState.kind).toBe("personal");
    expect(loginState.authenticated).toBe(true);
    expect(loginState.canSearch).toBe(true);
    expect(loginState.canExport).toBe(true);
  });

  it("treats preview pages as expired even with stale personal markers", async () => {
    const loginState = await adapter.detectLoginState(
      makeContext(
        makeState({
          url: "https://www.scopus.com/pages/home",
          isPreviewPage: true,
          isLoggedInUser: true,
          isIndividuallyAuthenticated: true,
          accessTypeAA: "ae:REG:U_P:INST:IP",
          usagePathInfo: "(SCOPUS,SSO|REG_IP,ACCESS_TYPE)",
          email: "user@example.edu",
          hasUserMenu: true,
        }),
      ),
    );

    expect(loginState.kind).toBe("anonymous");
    expect(loginState.authenticated).toBe(false);
    expect(loginState.canSearch).toBe(false);
    expect(loginState.canExport).toBe(false);
    expect(loginState.blockingReason).toMatch(/session expired/i);
  });

  it("keeps anonymous institutional sessions searchable but not exportable", async () => {
    const loginState = await adapter.detectLoginState(
      makeContext(
        makeState({
          url: "https://www.scopus.com/results/results.uri",
          accessTypeAA: "ae:ANON::INST:IP",
          usagePathInfo: "(SCOPUS,SSO|ANON_IP,ACCESS_TYPE)",
        }),
      ),
    );

    expect(loginState.kind).toBe("institutional");
    expect(loginState.authenticated).toBe(false);
    expect(loginState.canSearch).toBe(true);
    expect(loginState.canExport).toBe(false);
  });
});
