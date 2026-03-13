import path from "node:path";
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
  normalizeWhitespace,
  readLocatorValue,
  textContentOrNull,
} from "../../browser/page-helpers.js";
import { BaseSearchProviderAdapter } from "../base/base-adapter.js";
import { ieeeDescriptor } from "./descriptor.js";
import { parseIeeeSearchSummary } from "./search-parsing.js";
import { ieeeQueryProfile } from "./query-profile.js";
import { ieeeSelectors } from "./selectors.js";

export class IeeeAdapter extends BaseSearchProviderAdapter {
  readonly descriptor = ieeeDescriptor;
  readonly queryProfile = ieeeQueryProfile;
  readonly selectors = ieeeSelectors;
  readonly queryParamName = "queryText";
  readonly submitUrlPattern = /queryText=/;

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

    const input = await this.findQueryInput(context).catch(() => null);
    if (!input) {
      return null;
    }

    return readLocatorValue(input);
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
        await checkbox.check({ force: true }).catch(async () => {
          await checkbox.click({ force: true });
        });
      }
    }
  }

  override async clearSelection(context: ProviderContext): Promise<void> {
    const selectAll = context.page.locator(".results-actions-selectall-checkbox").first();
    if ((await selectAll.isVisible().catch(() => false)) && (await selectAll.isChecked().catch(() => false))) {
      await selectAll.uncheck({ force: true }).catch(async () => {
        await selectAll.click({ force: true });
      });
      return;
    }

    const checked = context.page.locator('xpl-results-item input[aria-label="Select search result"]:checked');
    const count = await checked.count();
    for (let i = 0; i < count; i += 1) {
      await checked.nth(i).uncheck({ force: true }).catch(async () => {
        await checked.nth(i).click({ force: true });
      });
    }
  }

  async detectExportCapability(): Promise<ExportCapability> {
    return {
      nativeFormat: "csv",
      convertibleToRis: true,
      requiresInteractiveLogin: false,
      supportsPage: true,
      supportsAll: true,
      supportsSelected: true,
      supportsRange: false,
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

    if (request.scope === "range") {
      throw new Error("IEEE export does not support explicit record ranges from the result page.");
    }

    if (request.targetFormat === "ris") {
      return this.exportRis(context, request);
    }

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
    if (request.scope === "selected" && request.selectedIndices?.length) {
      await this.clearSelection(context);
      await this.selectResultsByIndex(context, request.selectedIndices);
    } else if (request.scope === "page") {
      await this.clearSelection(context);
      await this.selectAllOnPage(context);
    } else {
      // IEEE Results -> Download exports all available CSV rows only when nothing is selected.
      await this.clearSelection(context);
    }

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
    const targetPath = path.join(context.downloadsDir, fileName || `ieee-results-${Date.now()}.csv`);
    await download.saveAs(targetPath);

    return {
      provider: "ieee",
      format: "csv",
      path: targetPath,
      fileName,
      raw: { scope: request.scope, targetFormat: request.targetFormat, url: download.url() },
    };
  }

  private async exportRis(context: ProviderContext, request: ExportRequest): Promise<ExportResult> {
    if (request.scope === "selected" && request.selectedIndices?.length) {
      await this.clearSelection(context);
      await this.selectResultsByIndex(context, request.selectedIndices);
    } else if (request.scope === "page") {
      await this.clearSelection(context);
      await this.selectAllOnPage(context);
    }

    const selectedCount = await context.page.locator('xpl-results-item input[aria-label="Select search result"]:checked').count();
    if (selectedCount === 0) {
      throw new Error("IEEE RIS export requires selected results. Use scope='selected' or scope='page'.");
    }

    const dialog = await this.openExportDialog(context);
    const citationsTab = dialog.getByRole("tab", { name: /^Citations$/i }).first();
    await citationsTab.waitFor({ state: "visible", timeout: 15_000 });
    await citationsTab.click({ force: true });

    const risOption = dialog.getByLabel(/RIS/i).first();
    if (await risOption.isVisible().catch(() => false)) {
      await risOption.check({ force: true }).catch(async () => {
        await risOption.click({ force: true });
      });
    } else {
      const risLabel = dialog.locator("label, button").filter({ hasText: /^RIS$/i }).first();
      await risLabel.click({ force: true });
    }

    const includeLabel = request.includeAbstracts === false ? /Citation Only/i : /Citation and Abstract/i;
    const includeOption = dialog.getByLabel(includeLabel).first();
    if (await includeOption.isVisible().catch(() => false)) {
      await includeOption.check({ force: true }).catch(async () => {
        await includeOption.click({ force: true });
      });
    } else {
      const includeButton = dialog.locator("label, button").filter({ hasText: includeLabel }).first();
      await includeButton.click({ force: true }).catch(() => undefined);
    }

    const downloadButton = dialog.getByRole("button", { name: /^Download$/i }).first();
    await downloadButton.waitFor({ state: "visible", timeout: 15_000 });

    const [download] = await Promise.all([
      context.page.waitForEvent("download", { timeout: 30_000 }),
      downloadButton.click({ force: true }),
    ]);

    const fileName = download.suggestedFilename();
    const targetPath = path.join(context.downloadsDir, fileName || `ieee-citations-${Date.now()}.ris`);
    await download.saveAs(targetPath);

    return {
      provider: "ieee",
      format: "ris",
      path: targetPath,
      fileName,
      raw: {
        scope: request.scope,
        selectedCount,
        includeAbstracts: request.includeAbstracts !== false,
        url: download.url(),
      },
    };
  }

  private async selectAllOnPage(context: ProviderContext): Promise<void> {
    const checkbox = context.page.locator(".results-actions-selectall-checkbox").first();
    await checkbox.waitFor({ state: "visible", timeout: 10_000 });

    if (!(await checkbox.isChecked().catch(() => false))) {
      await checkbox.check({ force: true }).catch(async () => {
        await checkbox.click({ force: true });
      });
    }
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



