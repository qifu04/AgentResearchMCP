import path from "node:path";
import { readFile } from "node:fs/promises";
import type {
  ExportCapability,
  ExportRequest,
  ExportResult,
  LoginState,
  ProviderContext,
  ResultItem,
  SearchSummary,
} from "../provider-contract.js";
import {
  clickIfVisible,
  fillAndVerify,
  normalizeWhitespace,
  readLocatorValue,
  runWithPageLoad,
  textContentOrNull,
} from "../../browser/page-helpers.js";
import { BaseSearchProviderAdapter } from "../base/base-adapter.js";
import { ieeeDescriptor } from "./descriptor.js";
import { convertCsvToRis } from "../../core/ris-converter.js";
import { writeTextFile } from "../../utils/fs.js";
import { parseIeeeSearchSummary } from "./search-parsing.js";
import { ieeeQueryProfile } from "./query-profile.js";
import { ieeeSelectors } from "./selectors.js";

export class IeeeAdapter extends BaseSearchProviderAdapter {
  readonly descriptor = ieeeDescriptor;
  readonly queryProfile = ieeeQueryProfile;
  readonly selectors = ieeeSelectors;
  readonly queryParamName = "queryText";
  readonly submitUrlPattern = /queryText=/;

  override async openAdvancedSearch(context: ProviderContext): Promise<void> {
    await super.openAdvancedSearch(context);
    await this.waitForAdvancedSearchReady(context);
  }

  override async clearInterferingUi(context: ProviderContext): Promise<void> {
    await super.clearInterferingUi(context);

    const dismissors = [
      context.page.locator(".osano-cm-accept-all").first(),
      context.page.getByRole("button", { name: /accept|agree|全部接受/i }).first(),
      context.page.getByRole("button", { name: /close modal/i }).first(),
    ];

    for (const locator of dismissors) {
      await clickIfVisible(locator);
    }
  }

  async detectLoginState(context: ProviderContext): Promise<LoginState> {
    const state = await context.page.evaluate(() => ({
      url: location.href,
      title: document.title,
      bodyText: document.body.innerText,
    }));
    const institution = /Access provided by:\s*([^\n]+)/i.exec(state.bodyText)?.[1]?.trim() ?? null;
    const canSearch = Boolean(institution) || /Search Results/i.test(state.title) || state.url.includes("queryText=");

    return {
      kind: institution ? "institutional" : "anonymous",
      authenticated: false,
      canSearch,
      canExport: canSearch,
      institutionAccess: institution,
      requiresInteractiveLogin: false,
      blockingReason: canSearch ? null : "IEEE session state is not ready for search.",
      detectedBy: [institution ? "body:access-provided-by" : "body:anonymous"],
      raw: state,
    };
  }

  override async readCurrentQuery(context: ProviderContext): Promise<string | null> {
    const url = new URL(context.page.url());
    const query = normalizeWhitespace(url.searchParams.get("queryText"));
    if (query) {
      return query;
    }

    const input = await this.findAdvancedQueryInput(context).catch(() => null);
    if (!input) {
      return null;
    }

    return readLocatorValue(input);
  }

  override async setCurrentQuery(context: ProviderContext, query: string): Promise<void> {
    const input = await this.findAdvancedQueryInput(context);
    await runWithPageLoad(context.page, async () => {
      await fillAndVerify(input, query);
    });
  }

  override async submitSearch(context: ProviderContext): Promise<SearchSummary> {
    await this.waitForAdvancedSearchReady(context);
    const button = await this.findAdvancedSearchButton(context);
    await runWithPageLoad(context.page, async () => {
      await Promise.all([
        context.page.waitForURL(this.submitUrlPattern, { timeout: 30_000 }).catch(() => undefined),
        button.click(),
      ]);
    });

    // IEEE loads results asynchronously — wait for result items or the summary header
    await this.clearInterferingUi(context);
    await context.page.locator("xpl-results-item, xpl-search-dashboard .Dashboard-header h1").first()
      .waitFor({ state: "visible", timeout: 30_000 })
      .catch(() => undefined);

    return this.readSearchSummary(context);
  }


  async readSearchSummary(context: ProviderContext): Promise<SearchSummary> {
    const info = await context.page.evaluate(() => ({
      url: location.href,
      title: document.title,
      summaryText:
        document.querySelector("xpl-search-dashboard .Dashboard-header")?.textContent?.trim() ??
        document.querySelector("xpl-search-dashboard h1")?.textContent?.trim() ??
        null,
      sortText:
        document.querySelector(".results-actions .dropdown-toggle")?.textContent?.trim() ??
        document.querySelector(".action-bar .dropdown-toggle")?.textContent?.trim() ??
        null,
      bodyText: document.body.innerText,
    }));
    const parsed = parseIeeeSearchSummary({
      url: info.url,
      summaryText: info.summaryText ?? info.bodyText,
    });

    return {
      provider: "ieee",
      query: parsed.query,
      totalResultsText: parsed.totalResultsText,
      totalResults: parsed.totalResults,
      currentPage: parsed.currentPage,
      totalPages: null,
      pageSize: parsed.pageSize,
      queryId: null,
      sort: normalizeWhitespace(info.sortText) ?? (/Relevance/i.test(info.bodyText) ? "Relevance" : null),
      raw: info,
    };
  }

  protected async readResultCards(context: ProviderContext, limit: number, includeAbstracts: boolean): Promise<ResultItem[]> {
    if (includeAbstracts) {
      await this.expandVisibleAbstracts(context, limit);
    }

    const items = await context.page.evaluate(
      ({ requestedLimit, includeAbstracts: shouldInclude }) => {
        const cards = Array.from(document.querySelectorAll("xpl-results-item"));

        return cards.slice(0, requestedLimit).map((card, index) => {
          const desktopCard = (card.querySelector(".hide-mobile") as HTMLElement | null) ?? (card as HTMLElement);
          const titleLink = desktopCard.querySelector('h3 a[href^="/document/"]') as HTMLAnchorElement | null;
          const authorsText = desktopCard.querySelector(".author")?.textContent?.trim() ?? null;
          const sourceText = desktopCard.querySelector(".description")?.textContent?.trim() ?? null;
          const abstractPreview =
            shouldInclude
              ? desktopCard.querySelector(".twist-container:not(.hide) span")?.textContent?.trim() ?? null
              : null;

          return {
            provider: "ieee",
            indexOnPage: index + 1,
            title: titleLink?.textContent?.trim() ?? `Result ${index + 1}`,
            href: titleLink?.href ?? null,
            authorsText,
            sourceText,
            yearText: sourceText?.match(/\b(19|20)\d{2}\b/)?.[0] ?? null,
            abstractPreview,
            selectable: Boolean(desktopCard.querySelector('input[aria-label="Select search result"]')),
            raw: { text: desktopCard.innerText.slice(0, 4000) },
          };
        });
      },
      { requestedLimit: limit, includeAbstracts },
    );

    return items as ResultItem[];
  }

  override async selectResultsByIndex(context: ProviderContext, indices: number[]): Promise<void> {
    const cards = context.page.locator(this.selectors.resultCards[0]);

    for (const index of indices) {
      const card = cards.nth(Math.max(index - 1, 0));
      await card.scrollIntoViewIfNeeded().catch(() => undefined);
      const checkbox = card.locator('input[aria-label="Select search result"]').first();
      await checkbox.waitFor({ state: "visible", timeout: 10_000 });

      if (!(await checkbox.isChecked().catch(() => false))) {
        // Use evaluate to programmatically click, which reliably triggers Angular bindings
        await checkbox.evaluate((el) => (el as HTMLInputElement).click());
        await context.page.waitForTimeout(200);
      }
    }
  }

  override async clearSelection(context: ProviderContext): Promise<void> {
    const selectAll = context.page.locator(".results-actions-selectall-checkbox").first();
    if ((await selectAll.isVisible().catch(() => false)) && (await selectAll.isChecked().catch(() => false))) {
      await selectAll.evaluate((el) => (el as HTMLInputElement).click());
      await context.page.waitForTimeout(200);
      return;
    }

    const checked = context.page.locator('xpl-results-item input[aria-label="Select search result"]:checked');
    const count = await checked.count();
    for (let i = 0; i < count; i += 1) {
      await checked.nth(i).evaluate((el) => (el as HTMLInputElement).click());
      await context.page.waitForTimeout(100);
    }
  }

  async detectExportCapability(): Promise<ExportCapability> {
    return {
      requiresInteractiveLogin: false,
      maxBatch: null,
      blockingReason: null,
      raw: {
        defaultResultsFormat: "csv",
        defaultResultsLimit: 1000,
        citationExportFormats: ["plain text", "bibtex", "ris", "refworks"],
      },
    };
  }

  async exportNative(context: ProviderContext, request: ExportRequest): Promise<ExportResult> {
    await this.clearInterferingUi(context);
    return this.exportCsv(context, request);
  }

  private async expandVisibleAbstracts(context: ProviderContext, limit: number): Promise<void> {
    const cards = context.page.locator(this.selectors.resultCards[0]);

    for (let i = 0; i < limit; i += 1) {
      const card = cards.nth(i);
      if (await card.locator(".twist-container:not(.hide)").first().isVisible().catch(() => false)) {
        continue;
      }

      const button = card.getByRole("button", { name: /^Abstract$/i }).first();
      if (!(await button.isVisible().catch(() => false))) {
        continue;
      }

      await button.click({ force: true }).catch(() => undefined);
      await card.locator(".twist-container:not(.hide)").first().waitFor({ state: "visible", timeout: 5_000 }).catch(() => undefined);
    }
  }

  private async exportCsv(context: ProviderContext, request: ExportRequest): Promise<ExportResult> {
    // IEEE exports all available CSV rows when nothing is selected.
    await this.clearSelection(context);

    const dialog = await this.openExportDialog(context);
    const resultsTab = dialog.getByRole("tab", { name: /^Results$/i }).first();
    if ((await resultsTab.getAttribute("aria-selected")) !== "true") {
      await resultsTab.click({ force: true });
    }

    const downloadButton = dialog.getByRole("button", { name: /^Download$/i }).first();
    await downloadButton.waitFor({ state: "visible", timeout: 15_000 });

    const [download] = await Promise.all([
      context.page.waitForEvent("download", { timeout: 30_000 }),
      downloadButton.click({ force: true }),
    ]);

    const fileName = download.suggestedFilename();
    const csvPath = path.join(context.downloadsDir, fileName || `ieee-results-${Date.now()}.csv`);
    await download.saveAs(csvPath);

    // Convert CSV to RIS in-place
    const csvContent = await readFile(csvPath, "utf8");
    const risContent = convertCsvToRis(csvContent);
    const risPath = csvPath.replace(/\.csv$/i, ".ris");
    await writeTextFile(risPath, risContent);

    return {
      provider: "ieee",
      format: "ris",
      path: risPath,
      fileName: fileName?.replace(/\.csv$/i, ".ris"),
      raw: { scope: request.scope, url: download.url() },
    };
  }

  private async waitForAdvancedSearchReady(context: ProviderContext): Promise<void> {
    const loading = context.page.getByText(/^Loading\.\.\.$/i).first();
    await loading.waitFor({ state: "hidden", timeout: 15_000 }).catch(() => undefined);

    for (const selector of this.selectors.queryInputs) {
      const locator = context.page.locator(selector).first();
      await locator.waitFor({ state: "visible", timeout: 5_000 }).catch(() => undefined);
      if (await locator.isVisible().catch(() => false)) {
        return;
      }
    }

    throw new Error(`Unable to find visible IEEE advanced-search input for selectors: ${this.selectors.queryInputs.join(", ")}`);
  }

  private async findAdvancedQueryInput(context: ProviderContext) {
    await this.waitForAdvancedSearchReady(context);
    return this.findFirstVisible(context, this.selectors.queryInputs);
  }

  private async findAdvancedSearchButton(context: ProviderContext) {
    await this.waitForAdvancedSearchReady(context);
    return this.findFirstVisible(context, this.selectors.searchButtons);
  }

  private async openExportDialog(context: ProviderContext) {
    const exportButton = await this.findFirstVisible(context, this.selectors.exportButtons);
    await exportButton.scrollIntoViewIfNeeded().catch(() => undefined);
    await exportButton.click({ force: true });

    const dialog = context.page
      .locator('ngb-modal-window[role="dialog"].modal.show')
      .filter({ hasText: /Download Results|Download Citations/i })
      .last();
    await dialog.waitFor({ state: "visible", timeout: 15_000 });
    return dialog;
  }
}





