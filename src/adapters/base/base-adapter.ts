import type { Locator } from "playwright";
import type { AdapterSelectors } from "./adapter-selectors.js";
import type {
  ExportCapability,
  ExportRequest,
  ExportResult,
  FilterApplyRequest,
  FilterGroup,
  LoginState,
  ProviderContext,
  ProviderDescriptor,
  QueryLanguageProfile,
  ResultItem,
  SearchProviderAdapter,
  SearchSummary,
  StartupProbeOptions,
  StartupProbeResult,
} from "../provider-contract.js";
import {
  clickIfVisible,
  fillAndVerify,
  readLocatorValue,
  runWithPageLoad,
} from "../../browser/page-helpers.js";
import { removePath } from "../../utils/fs.js";

export abstract class BaseSearchProviderAdapter implements SearchProviderAdapter {
  abstract readonly descriptor: ProviderDescriptor;
  abstract readonly queryProfile: QueryLanguageProfile;
  abstract readonly selectors: AdapterSelectors;
  protected abstract readonly startupProbeQuery: string;

  abstract readonly queryParamName: string | null;
  abstract readonly submitUrlPattern: RegExp;

  abstract detectLoginState(context: ProviderContext): Promise<LoginState>;
  abstract readSearchSummary(context: ProviderContext): Promise<SearchSummary>;
  protected abstract readResultCards(
    context: ProviderContext,
    limit: number,
    includeAbstracts: boolean,
  ): Promise<ResultItem[]>;
  abstract detectExportCapability(context: ProviderContext): Promise<ExportCapability>;
  abstract exportNative(context: ProviderContext, request: ExportRequest): Promise<ExportResult>;

  async openAdvancedSearch(context: ProviderContext): Promise<void> {
    await runWithPageLoad(context.page, async () => {
      await context.page.goto(this.descriptor.entryUrl, { waitUntil: "domcontentloaded" });
    });
  }

  async clearInterferingUi(context: ProviderContext): Promise<void> {
    const dismissors = [
      context.page.getByRole("button", { name: /accept|agree|continue|close/i }).first(),
      context.page.getByRole("button", { name: /got it/i }).first(),
      context.page.getByRole("button", { name: /dismiss/i }).first(),
    ];
    for (const locator of dismissors) {
      await clickIfVisible(locator);
    }
  }

  async getQueryLanguageProfile(_context: ProviderContext): Promise<QueryLanguageProfile> {
    return this.queryProfile;
  }

  async readCurrentQuery(context: ProviderContext): Promise<string | null> {
    if (this.queryParamName) {
      const url = new URL(context.page.url());
      const fromUrl = url.searchParams.get(this.queryParamName);
      if (fromUrl) {
        return fromUrl;
      }
    }

    try {
      const input = await this.findQueryInput(context);
      return readLocatorValue(input);
    } catch {
      return null;
    }
  }

  async setCurrentQuery(context: ProviderContext, query: string): Promise<void> {
    await this.openAdvancedSearch(context);
    await this.clearInterferingUi(context);
    const input = await this.findQueryInput(context);
    await runWithPageLoad(context.page, async () => {
      await fillAndVerify(input, query);
    });
  }

  async submitSearch(context: ProviderContext): Promise<SearchSummary> {
    const button = await this.findSearchButton(context);
    await runWithPageLoad(context.page, async () => {
      await Promise.all([
        context.page.waitForURL(this.submitUrlPattern, { timeout: 30_000 }).catch(() => undefined),
        button.click(),
      ]);
    });
    return this.readSearchSummary(context);
  }

  async readResultItems(context: ProviderContext, limit: number): Promise<ResultItem[]> {
    return this.readResultCards(context, limit, false);
  }

  async readResultAbstracts(context: ProviderContext, limit: number): Promise<ResultItem[]> {
    return this.readResultCards(context, limit, true);
  }

  async listFilters(context: ProviderContext): Promise<FilterGroup[]> {
    const filterGroupSelectors = this.selectors.filterGroups;
    const filters = await context.page.evaluate(
      (groupSelectors: string[]) => {
        const seen = new Set<Element>();
        const groups: Element[] = [];
        for (const selector of groupSelectors) {
          for (const node of Array.from(document.querySelectorAll(selector))) {
            if (!seen.has(node)) {
              seen.add(node);
              groups.push(node);
            }
          }
        }
        return groups.slice(0, 20).map((group, index) => {
          const label =
            group.querySelector("h2, h3, h4, legend, button, [role='button']")?.textContent?.trim() ??
            group.textContent?.trim()?.slice(0, 80) ??
            `group-${index + 1}`;
          const options = Array.from(group.querySelectorAll('label, [role="checkbox"], [role="option"]'))
            .map((option) => option.textContent?.trim())
            .filter((text): text is string => Boolean(text) && text.length > 1)
            .slice(0, 10)
            .map((value) => ({ value, label: value }));
          return { key: label, label, type: "checkbox", options };
        });
      },
      filterGroupSelectors,
    );
    return filters.filter((group) => group.label && group.options.length > 0) as FilterGroup[];
  }

  async applyFilters(_context: ProviderContext, _input: FilterApplyRequest[]): Promise<SearchSummary> {
    throw new Error(`${this.descriptor.displayName} filter automation is not implemented.`);
  }

  async selectResultsByIndex(_context: ProviderContext, _indices: number[]): Promise<void> {
    throw new Error(`${this.descriptor.displayName} selection automation is not implemented.`);
  }

  async clearSelection(_context: ProviderContext): Promise<void> {
    // Default no-op.
  }

  async runStartupProbe(
    context: ProviderContext,
    options: StartupProbeOptions = {},
  ): Promise<StartupProbeResult> {
    const verifyExport = options.verifyExport ?? true;
    const query = this.resolveStartupProbeQuery();
    await this.setCurrentQuery(context, query);
    const summary = await this.submitSearch(context);
    const totalResults = summary.totalResults ?? null;

    if (totalResults !== null && totalResults < 1) {
      throw new Error(
        `${this.descriptor.displayName} startup probe query returned no results. ` +
          `Override ${this.startupProbeEnvKey()} if a different smoke-test query is needed.`,
      );
    }

    let exportCapability: ExportCapability | undefined;
    let result: ExportResult | undefined;

    if (verifyExport) {
      exportCapability = await this.detectExportCapability(context);
      if (exportCapability.requiresInteractiveLogin || exportCapability.blockingReason) {
        throw new Error(
          exportCapability.blockingReason ??
            `${this.descriptor.displayName} startup probe is not export-ready yet.`,
        );
      }

      result = await this.exportNative(context, {
        scope: "all",
        start: 1,
        end: 1,
        includeAbstracts: false,
        raw: {
          startupProbe: true,
        },
      });

      if (!result.path && (!result.chunks || result.chunks.length === 0)) {
        throw new Error(`${this.descriptor.displayName} startup probe did not produce an export artifact.`);
      }

      if (result.path) {
        await removePath(result.path);
      }
    }

    return {
      provider: this.descriptor.id,
      query,
      totalResults,
      exportVerified: verifyExport,
      format: result?.format ?? null,
      fileName: result?.fileName ?? null,
      raw: {
        summary,
        exportCapability: exportCapability ?? null,
      },
    };
  }

  protected async findFirstVisible(context: ProviderContext, selectorList: string[]): Promise<Locator> {
    for (const selector of selectorList) {
      const locator = context.page.locator(selector).first();
      if (await locator.isVisible().catch(() => false)) {
        return locator;
      }
    }
    throw new Error(`Unable to find visible element for selectors: ${selectorList.join(", ")}`);
  }

  protected async findQueryInput(context: ProviderContext): Promise<Locator> {
    return this.findFirstVisible(context, this.selectors.queryInputs);
  }

  protected async findSearchButton(context: ProviderContext): Promise<Locator> {
    return this.findFirstVisible(context, this.selectors.searchButtons);
  }

  protected resolveStartupProbeQuery(): string {
    return process.env[this.startupProbeEnvKey()]?.trim() || this.startupProbeQuery;
  }

  private startupProbeEnvKey(): string {
    return `STARTUP_PROBE_QUERY_${this.descriptor.id.toUpperCase().replace(/[^A-Z0-9]/g, "_")}`;
  }
}

