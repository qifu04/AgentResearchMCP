import type {
  ExportCapability,
  ExportRequest,
  ExportResult,
  LoginState,
  ProviderContext,
  ResultItem,
  SearchSummary,
} from "../provider-contract.js";
import { normalizeWhitespace } from "../../browser/page-helpers.js";
import { BaseSearchProviderAdapter } from "../base/base-adapter.js";
import { extractAbstractLine } from "../base/adapter-utils.js";
import { ieeeDescriptor } from "./descriptor.js";
import { ieeeQueryProfile } from "./query-profile.js";
import { ieeeSelectors } from "./selectors.js";

export class IeeeAdapter extends BaseSearchProviderAdapter {
  readonly descriptor = ieeeDescriptor;
  readonly queryProfile = ieeeQueryProfile;
  readonly selectors = ieeeSelectors;
  readonly queryParamName = "queryText";
  readonly submitUrlPattern = /queryText=/;

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

  async readCurrentQuery(context: ProviderContext): Promise<string | null> {
    const url = new URL(context.page.url());
    const query = url.searchParams.get("queryText");
    if (query) return query;
    for (const selector of this.selectors.queryInputs) {
      const locator = context.page.locator(selector).first();
      if (await locator.isVisible().catch(() => false)) {
        return normalizeWhitespace(await locator.inputValue());
      }
    }
    return null;
  }

  async readSearchSummary(context: ProviderContext): Promise<SearchSummary> {
    const info = await context.page.evaluate(() => ({
      url: location.href,
      title: document.title,
      bodyText: document.body.innerText,
    }));
    const url = new URL(info.url);
    const query = url.searchParams.get("queryText") ?? "";
    const resultsMatch = /Showing\s+\d+-\d+\s+of\s+([\d,]+)\s+results/i.exec(info.bodyText);
    return {
      provider: "ieee",
      query,
      totalResultsText: resultsMatch?.[1] ?? null,
      totalResults: resultsMatch?.[1] ? Number(resultsMatch[1].replace(/,/g, "")) : null,
      currentPage: null,
      totalPages: null,
      pageSize: 25,
      queryId: null,
      sort: /Relevance/i.test(info.bodyText) ? "relevance" : null,
      raw: info,
    };
  }

  protected async readResultCards(context: ProviderContext, limit: number, includeAbstracts: boolean): Promise<ResultItem[]> {
    const items = await context.page.evaluate(
      ({ requestedLimit, includeAbstracts: shouldInclude }) => {
        const cards = Array.from(document.querySelectorAll(".List-results-items .List-results-item, .search-results-item, article")) as HTMLElement[];
        return cards.slice(0, requestedLimit).map((card, index) => {
          const titleLink = (card.querySelector("h2 a, h3 a, a.result-item-title-link, a") as HTMLAnchorElement | null);
          const title = titleLink?.textContent?.trim() ?? `Result ${index + 1}`;
          const text = card.innerText;
          const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
          return {
            provider: "ieee",
            indexOnPage: index + 1,
            title,
            href: titleLink?.href ?? null,
            authorsText: lines[1] ?? null,
            sourceText: lines[2] ?? null,
            yearText: text.match(/\b(19|20)\d{2}\b/)?.[0] ?? null,
            abstractPreview: shouldInclude ? (lines.find((l) => l.length > 40) ?? null) : null,
            selectable: Boolean(card.querySelector('input[type="checkbox"]')),
            raw: { text: text.slice(0, 4000) },
          };
        });
      },
      { requestedLimit: limit, includeAbstracts },
    );
    return items as ResultItem[];
  }

  async detectExportCapability(): Promise<ExportCapability> {
    return {
      nativeFormat: "ris",
      convertibleToRis: true,
      requiresInteractiveLogin: false,
      supportsPage: false,
      supportsAll: false,
      supportsSelected: true,
      supportsRange: false,
      maxBatch: 1000,
      blockingReason: null,
      raw: {
        resultsExport: "csv",
        citationExport: ["plain text", "bibtex", "ris", "refworks"],
      },
    };
  }

  async exportNative(_context: ProviderContext, _request: ExportRequest): Promise<ExportResult> {
    throw new Error("IEEE export automation is not finalized in the scaffold adapter.");
  }
}