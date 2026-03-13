import type {
  ExportCapability,
  ExportRequest,
  ExportResult,
  LoginState,
  ProviderContext,
  ResultItem,
  SearchSummary,
} from "../provider-contract.js";
import { clickIfVisible } from "../../browser/page-helpers.js";
import { BaseSearchProviderAdapter } from "../base/base-adapter.js";
import { scopusDescriptor } from "./descriptor.js";
import { scopusQueryProfile } from "./query-profile.js";
import { parseScopusSearchSummary } from "./search-parsing.js";
import { scopusSelectors } from "./selectors.js";

export class ScopusAdapter extends BaseSearchProviderAdapter {
  readonly descriptor = scopusDescriptor;
  readonly queryProfile = scopusQueryProfile;
  readonly selectors = scopusSelectors;
  readonly queryParamName = "s";
  readonly submitUrlPattern = /results\.uri|[?&]s=/;

  override async clearInterferingUi(context: ProviderContext): Promise<void> {
    await super.clearInterferingUi(context);

    const dismissors = [
      context.page.getByRole("button", { name: /accept|agree/i }).first(),
      context.page.getByRole("button", { name: /close|关闭/i }).first(),
    ];

    for (const locator of dismissors) {
      await clickIfVisible(locator);
    }
  }

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
    const info = await context.page.evaluate(() => {
      const headingCandidates = Array.from(document.querySelectorAll("h1, h2, h3"))
        .map((node) => node.textContent?.trim() ?? "")
        .filter(Boolean);

      return {
        url: location.href,
        title: document.title,
        headingText: headingCandidates.find((text) => /(Found|found)\s+[\d,]+\s+documents?/i.test(text) || /找到\s+[\d,]+\s+篇文献/.test(text)) ?? null,
        rangeText: headingCandidates.find((text) => /(\d+)\s+(?:to|TO|至)\s+(\d+)/.test(text) || /总共\s+[\d,]+\s+个结果/.test(text)) ?? null,
        bodyText: document.body.innerText,
      };
    });
    const parsed = parseScopusSearchSummary(info);
    const url = new URL(info.url);

    return {
      provider: "scopus",
      query: parsed.query,
      totalResultsText: parsed.totalResultsText,
      totalResults: parsed.totalResults,
      currentPage: parsed.currentPage,
      totalPages: null,
      pageSize: parsed.pageSize ?? Number(url.searchParams.get("limit") ?? "10"),
      queryId: url.searchParams.get("sessionSearchId"),
      sort: url.searchParams.get("sort"),
      raw: info,
    };
  }

  protected async readResultCards(context: ProviderContext, limit: number, includeAbstracts: boolean): Promise<ResultItem[]> {
    if (includeAbstracts) {
      const showAll = context.page.getByRole("button", { name: /Show all abstracts|显示所有摘要/i }).first();
      if (await showAll.isVisible().catch(() => false)) {
        await showAll.click({ force: true }).catch(() => undefined);
      }
    }

    const items = await context.page.evaluate(
      ({ requestedLimit, includeAbstracts: shouldInclude }) => {
        const resultCheckboxSelector = 'input[aria-label^="选择结果 "], input[aria-label^="Select result "]';
        const rows = Array.from(document.querySelectorAll(resultCheckboxSelector))
          .map((node) => node.closest("tr"))
          .filter((row): row is HTMLTableRowElement => row instanceof HTMLTableRowElement);

        return rows.slice(0, requestedLimit).map((row, index) => {
          const checkbox = row.querySelector(resultCheckboxSelector) as HTMLInputElement | null;
          const label = checkbox?.getAttribute("aria-label") ?? "";
          const derivedIndex = /([0-9]+)/.exec(label)?.[1];
          const cells = Array.from(row.cells);
          const titleCell = cells[1] ?? null;
          const authorsCell = cells[2] ?? null;
          const sourceCell = cells[3] ?? null;
          const yearCell = cells[4] ?? null;
          const titleLink = titleCell?.querySelector("h3 a, a") as HTMLAnchorElement | null;

          let abstractPreview: string | null = null;
          if (shouldInclude) {
            const detailTexts: string[] = [];
            let sibling = row.nextElementSibling;
            while (sibling instanceof HTMLTableRowElement && !sibling.querySelector(resultCheckboxSelector)) {
              const text = sibling.innerText?.trim();
              if (text && !/^(查看摘要|View abstract)\b/i.test(text)) {
                detailTexts.push(text);
              }
              sibling = sibling.nextElementSibling;
            }
            abstractPreview = detailTexts.join(" ").trim() || null;
          }

          return {
            provider: "scopus",
            indexOnPage: derivedIndex ? Number(derivedIndex) : index + 1,
            title: titleLink?.textContent?.trim() ?? `Result ${index + 1}`,
            href: titleLink?.href ?? null,
            authorsText: authorsCell?.innerText?.trim() ?? null,
            sourceText: sourceCell?.innerText?.trim() ?? null,
            yearText: yearCell?.innerText?.trim() ?? null,
            abstractPreview,
            selectable: Boolean(checkbox),
            raw: { text: row.innerText.slice(0, 4000) },
          };
        });
      },
      { requestedLimit: limit, includeAbstracts },
    );

    return items as ResultItem[];
  }

  override async selectResultsByIndex(context: ProviderContext, indices: number[]): Promise<void> {
    for (const index of indices) {
      const checkbox = context.page
        .locator(`input[aria-label="选择结果 ${index}"], input[aria-label="Select result ${index}"]`)
        .first();
      await checkbox.waitFor({ state: "visible", timeout: 10_000 });

      if (!(await checkbox.isChecked().catch(() => false))) {
        await checkbox.check({ force: true }).catch(async () => {
          await checkbox.click({ force: true });
        });
      }
    }
  }

  override async clearSelection(context: ProviderContext): Promise<void> {
    const checked = context.page.locator('input[aria-label^="选择结果 "]:checked, input[aria-label^="Select result "]:checked');
    const count = await checked.count();
    for (let i = 0; i < count; i += 1) {
      await checked.nth(i).uncheck({ force: true }).catch(async () => {
        await checked.nth(i).click({ force: true });
      });
    }
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
