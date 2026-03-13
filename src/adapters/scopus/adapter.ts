import type {
  ExportCapability,
  ExportRequest,
  ExportResult,
  LoginState,
  ProviderContext,
  ResultItem,
  SearchSummary,
} from "../provider-contract.js";
import { BaseSearchProviderAdapter } from "../base/base-adapter.js";
import { scopusDescriptor } from "./descriptor.js";
import { scopusQueryProfile } from "./query-profile.js";
import { scopusSelectors } from "./selectors.js";

export class ScopusAdapter extends BaseSearchProviderAdapter {
  readonly descriptor = scopusDescriptor;
  readonly queryProfile = scopusQueryProfile;
  readonly selectors = scopusSelectors;
  readonly queryParamName = "s";
  readonly submitUrlPattern = /results|s=/;

  async detectLoginState(context: ProviderContext): Promise<LoginState> {
    const state = await context.page.evaluate(() => {
      const user = (window as typeof window & {
        isLoggedInUser?: boolean;
        isIndividuallyAuthenticated?: boolean;
        ScopusUser?: {
          accessTypeAA?: string;
          usagePathInfo?: string;
          email?: string;
          isIndividual?: boolean;
        };
      }).ScopusUser;

      return {
        url: location.href,
        title: document.title,
        isLoggedInUser: (window as typeof window & { isLoggedInUser?: boolean }).isLoggedInUser ?? null,
        isIndividuallyAuthenticated:
          (window as typeof window & { isIndividuallyAuthenticated?: boolean }).isIndividuallyAuthenticated ?? null,
        accessTypeAA: user?.accessTypeAA ?? null,
        usagePathInfo: user?.usagePathInfo ?? null,
        email: user?.email ?? null,
        isIndividual: user?.isIndividual ?? null,
        hasUserMenu: Boolean(document.querySelector("#user-menu")),
        hasSigninButton: Boolean(document.querySelector("#signin_link_move")),
        bodyText: document.body.innerText,
      };
    });

    const isPersonal = state.isLoggedInUser === true || state.isIndividuallyAuthenticated === true || state.isIndividual === true;
    const isInstitutional =
      !isPersonal &&
      (state.accessTypeAA?.includes("INST") ||
        state.accessTypeAA?.includes("ANON") ||
        state.usagePathInfo?.includes("ANON_IP") ||
        state.usagePathInfo?.includes("REG_SHIBBOLETH") ||
        state.bodyText.includes("Scopus"));

    return {
      kind: isPersonal ? "personal" : isInstitutional ? "institutional" : "anonymous",
      authenticated: isPersonal,
      canSearch: isPersonal || isInstitutional,
      canExport: isPersonal,
      institutionAccess: isInstitutional ? "Scopus institutional session" : null,
      requiresInteractiveLogin: !isPersonal,
      blockingReason: isPersonal ? null : "Scopus export requires a personal logged-in account.",
      detectedBy: [
        "window.isLoggedInUser",
        "window.isIndividuallyAuthenticated",
        "window.ScopusUser.accessTypeAA",
        "#user-menu",
      ],
      raw: state,
    };
  }

  async readSearchSummary(context: ProviderContext): Promise<SearchSummary> {
    const info = await context.page.evaluate(() => ({
      url: location.href,
      title: document.title,
      bodyText: document.body.innerText,
    }));
    const url = new URL(info.url);
    const totalResultsMatch = /(Found|found)\s+([\d,]+)\s+documents/i.exec(info.bodyText);
    return {
      provider: "scopus",
      query: url.searchParams.get("s") ?? "",
      totalResultsText: totalResultsMatch?.[2] ?? null,
      totalResults: totalResultsMatch?.[2] ? Number(totalResultsMatch[2].replace(/,/g, "")) : null,
      currentPage: /\b1 to 10\b/.test(info.bodyText) ? 1 : null,
      totalPages: null,
      pageSize: Number(url.searchParams.get("limit") ?? "10"),
      queryId: url.searchParams.get("sessionSearchId"),
      sort: url.searchParams.get("sort"),
      raw: info,
    };
  }

  protected async readResultCards(context: ProviderContext, limit: number, includeAbstracts: boolean): Promise<ResultItem[]> {
    const items = await context.page.evaluate(
      ({ requestedLimit, includeAbstracts: shouldInclude }) => {
        const rows = Array.from(document.querySelectorAll('[data-testid="results-row"], tr, article')) as HTMLElement[];
        return rows.slice(0, requestedLimit).map((row, index) => {
          const titleLink = (row.querySelector("a") as HTMLAnchorElement | null);
          const text = row.innerText;
          const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
          return {
            provider: "scopus",
            indexOnPage: index + 1,
            title: titleLink?.textContent?.trim() ?? `Result ${index + 1}`,
            href: titleLink?.href ?? null,
            authorsText: lines[1] ?? null,
            sourceText: lines[2] ?? null,
            yearText: text.match(/\b(19|20)\d{2}\b/)?.[0] ?? null,
            abstractPreview: shouldInclude ? (lines.find((l) => l.length > 40) ?? null) : null,
            selectable: Boolean(row.querySelector('input[type="checkbox"]')),
            raw: { text: text.slice(0, 4000) },
          };
        });
      },
      { requestedLimit: limit, includeAbstracts },
    );
    return items as ResultItem[];
  }

  async detectExportCapability(context: ProviderContext): Promise<ExportCapability> {
    const loginState = await this.detectLoginState(context);
    return {
      nativeFormat: "unknown",
      convertibleToRis: false,
      requiresInteractiveLogin: !loginState.canExport,
      supportsPage: false,
      supportsAll: false,
      supportsSelected: false,
      supportsRange: false,
      maxBatch: null,
      blockingReason: loginState.canExport ? "Scopus export format is not yet verified in this implementation." : loginState.blockingReason,
      raw: { loginState },
    };
  }

  async exportNative(context: ProviderContext, _request: ExportRequest): Promise<ExportResult> {
    const loginState = await this.detectLoginState(context);
    throw new Error(loginState.canExport ? "Scopus export automation is not finalized in the scaffold adapter." : loginState.blockingReason ?? "Scopus export is blocked.");
  }
}
