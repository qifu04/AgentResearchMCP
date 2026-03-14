import path from "node:path";
import type {
  ExportCapability,
  ExportRequest,
  ExportResult,
  FilterGroup,
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

  override async listFilters(context: ProviderContext): Promise<FilterGroup[]> {
    return context.page.evaluate(() => {
      const normalize = (value: string | null | undefined) => value?.replace(/\s+/g, " ").trim() ?? null;
      const isMeaningful = (value: string | null | undefined): value is string =>
        typeof value === "string" &&
        value.length > 0 &&
        !/^(?:undefined|show all|see all|more)$/i.test(value) &&
        !/^(?:from field of input range\.|to field of input range\.|-)$/i.test(value);
      const facetGroups = Array.from(document.querySelectorAll('[data-testid^="facet-group-"]'));
      const groups: { key: string; label: string; type: string; options: { value: string; label: string }[] }[] = [];

      for (const group of facetGroups) {
        const combobox = group.querySelector('[role="combobox"][aria-controls]') as HTMLElement | null;
        const label =
          normalize(combobox?.getAttribute("aria-label")) ??
          normalize(group.querySelector("h2, h3")?.textContent);
        if (!label) continue;
        const sectionId = combobox?.getAttribute("aria-controls");
        if (!sectionId) continue;
        const section = document.getElementById(sectionId);
        if (!section) continue;

        const radioOptions = Array.from(section.querySelectorAll('label[data-testid="radio-button"]'))
          .map((option) => normalize(option.textContent))
          .filter(isMeaningful)
          .filter((text, index, all) => all.findIndex((candidate) => candidate === text) === index)
          .map((value) => ({ value, label: value }));

        const checkboxOptions = Array.from(section.querySelectorAll('[data-testid^="facet-option-"]'))
          .map((option) => {
            const title = normalize(option.querySelector('[data-testid="facet-title"]')?.textContent);
            const fallbackText =
              normalize(option.getAttribute("aria-label")) ??
              normalize(option.textContent)?.replace(/\s+\d{1,3}(?:,\d{3})*$/, "").trim() ?? null;
            const value = title ?? fallbackText;
            return isMeaningful(value) ? { value, label: value } : null;
          })
          .filter((option): option is { value: string; label: string } => option !== null)
          .filter((option, index, all) => all.findIndex((candidate) => candidate.value === option.value) === index);

        const fallbackOptions =
          radioOptions.length === 0 && checkboxOptions.length === 0
            ? Array.from(section.querySelectorAll('[role="option"], [role="checkbox"], label'))
                .map((option) => normalize(option.textContent))
                .filter(isMeaningful)
                .filter((text, index, all) => all.findIndex((candidate) => candidate === text) === index)
                .map((value) => ({ value, label: value }))
            : [];

        const type = radioOptions.length > 0 && checkboxOptions.length === 0 ? "radio" : "checkbox";
        const options = (checkboxOptions.length > 0 ? checkboxOptions : radioOptions.length > 0 ? radioOptions : fallbackOptions)
          .slice(0, 10);

        if (options.length > 0) {
          groups.push({ key: label, label, type, options });
        }
      }
      return groups;
    }) as Promise<FilterGroup[]>;
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

      // The results list header contains range text like "总共 2000 个结果中的 1 至 10 个结果"
      const resultsListHeader = document.querySelector(".document-results-list-layout header")?.textContent?.trim() ?? null;

      return {
        url: location.href,
        title: document.title,
        headingText: headingCandidates.find((text) => /(Found|found)\s+[\d,]+\s+documents?/i.test(text) || /找到\s+[\d,]+\s+篇文献/.test(text)) ?? null,
        rangeText: resultsListHeader ?? headingCandidates.find((text) => /(\d+)\s+(?:to|TO|至)\s+(\d+)/.test(text) || /总共\s+[\d,]+\s+个结果/.test(text)) ?? null,
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

          const cleanInlineText = (value: string | null | undefined) => value?.replace(/\s+/g, " ").trim() ?? "";
          const isUiOnlyDetail = (value: string) =>
            /^(?:View abstract|Hide abstract|View at Publisher)$/i.test(value) ||
            /^(?:\u67e5\u770b\u6458\u8981|\u9690\u85cf\u6458\u8981|\u5728\u65b0\u7a97\u53e3\u4e2d\u6253\u5f00|\u76f8\u5173\u6587\u732e)$/u.test(value) ||
            /^(?:Article|Review|Conference paper|Conference review|Book chapter|Editorial|Erratum|Short survey)(?:\s*[??]\s*(?:Open Access|\u5f00\u653e\u83b7\u53d6))?$/i.test(value) ||
            /\u9884\u5370\u672c/u.test(value);

          let abstractPreview: string | null = null;
          if (shouldInclude) {
            const detailTexts: string[] = [];
            let sibling = row.nextElementSibling;
            while (sibling instanceof HTMLTableRowElement && !sibling.querySelector(resultCheckboxSelector)) {
              const lines = sibling.innerText
                ?.split("\n")
                .map((line) => cleanInlineText(line))
                .filter(Boolean)
                .filter((line) => !isUiOnlyDetail(line)) ?? [];
              detailTexts.push(...lines);
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
      nativeFormat: "csv",
      convertibleToRis: true,
      requiresInteractiveLogin: !loginState.canExport,
      supportsPage: true,
      supportsAll: true,
      supportsSelected: true,
      supportsRange: false,
      maxBatch: 2000,
      blockingReason: loginState.canExport ? null : loginState.blockingReason,
      raw: { loginState },
    };
  }

  async exportNative(context: ProviderContext, request: ExportRequest): Promise<ExportResult> {
    const loginState = await this.detectLoginState(context);
    if (!loginState.canExport) {
      throw new Error(loginState.blockingReason ?? "Scopus export requires a personal logged-in account.");
    }

    await this.clearInterferingUi(context);

    if (request.scope === "range") {
      throw new Error("Scopus export does not support explicit record ranges from the result page.");
    }

    if (request.scope === "selected" && request.selectedIndices?.length) {
      await this.clearSelection(context);
      await this.selectResultsByIndex(context, request.selectedIndices);
    } else if (request.scope === "page") {
      await this.clearSelection(context);
      await this.selectAllOnPage(context);
    } else {
      // scope === "all" — Scopus exports all results when nothing is selected
      await this.clearSelection(context);
    }

    const dialog = await this.openExportDialog(context);

    // Choose format: CSV is default, switch to RIS if requested
    const formatLabel = request.targetFormat === "ris" ? /RIS/i : /CSV/i;
    const formatOption = dialog.locator("label, button, [role='radio'], [role='option']").filter({ hasText: formatLabel }).first();
    if (await formatOption.isVisible().catch(() => false)) {
      await formatOption.click({ force: true });
    }

    // Click the export/download button inside the dialog
    const downloadButton = dialog.getByRole("button", { name: /export|download/i }).first();
    await downloadButton.waitFor({ state: "visible", timeout: 15_000 });

    const format = request.targetFormat === "ris" ? "ris" : "csv";
    const [download] = await Promise.all([
      context.page.waitForEvent("download", { timeout: 30_000 }),
      downloadButton.click({ force: true }),
    ]);

    const fileName = download.suggestedFilename();
    const targetPath = path.join(context.downloadsDir, fileName || `scopus-export-${Date.now()}.${format}`);
    await download.saveAs(targetPath);

    return {
      provider: "scopus",
      format,
      path: targetPath,
      fileName,
      raw: { scope: request.scope, targetFormat: request.targetFormat, url: download.url() },
    };
  }

  private async selectAllOnPage(context: ProviderContext): Promise<void> {
    const checkbox = context.page.locator('#mainResults-selectAllTop, input[aria-label*="Select all"], input[aria-label*="全选"]').first();
    await checkbox.waitFor({ state: "visible", timeout: 10_000 });

    if (!(await checkbox.isChecked().catch(() => false))) {
      await checkbox.check({ force: true }).catch(async () => {
        await checkbox.click({ force: true });
      });
    }
  }

  private async openExportDialog(context: ProviderContext): Promise<import("playwright").Locator> {
    const exportButton = await this.findFirstVisible(context, this.selectors.exportButtons);
    await exportButton.scrollIntoViewIfNeeded().catch(() => undefined);
    await exportButton.click({ force: true });

    // Wait for the export dialog/modal to appear
    const dialog = context.page
      .locator('[role="dialog"], .modal.show, #exportModals, .export-dialog')
      .first();
    await dialog.waitFor({ state: "visible", timeout: 15_000 });
    return dialog;
  }
}






