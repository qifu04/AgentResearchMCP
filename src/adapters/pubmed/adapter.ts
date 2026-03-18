import path from "node:path";
import { readFile } from "node:fs/promises";
import type {
  ExportCapability,
  ExportRequest,
  ExportResult,
  FilterApplyRequest,
  FilterGroup,
  LoginState,
  ProviderContext,
  ResultItem,
  SearchSummary,
} from "../provider-contract.js";
import { runWithPageLoad } from "../../browser/page-helpers.js";
import { BaseSearchProviderAdapter } from "../base/base-adapter.js";
import { convertNbibToRis } from "../../core/ris-converter.js";
import { writeTextFile } from "../../utils/fs.js";
import { cssEscape } from "../base/adapter-utils.js";
import { pubmedDescriptor } from "./descriptor.js";
import { pubmedQueryProfile } from "./query-profile.js";
import { parsePubMedSearchSummary } from "./summary-parsing.js";
import { pubmedSelectors } from "./selectors.js";

export class PubMedAdapter extends BaseSearchProviderAdapter {
  readonly descriptor = pubmedDescriptor;
  readonly queryProfile = pubmedQueryProfile;
  readonly selectors = pubmedSelectors;
  protected readonly startupProbeQuery = "Bitencourt-Ferreira G[au] AND 2019[dp] AND docking[tiab]";
  readonly queryParamName = "term";
  readonly submitUrlPattern = /term=/;

  async detectLoginState(context: ProviderContext): Promise<LoginState> {
    const state = await context.page.evaluate(() => ({
      url: location.href,
      title: document.title,
      bodyText: document.body.innerText,
    }));
    return {
      kind: "anonymous",
      authenticated: false,
      canSearch: true,
      canExport: true,
      institutionAccess: null,
      requiresInteractiveLogin: false,
      blockingReason: null,
      detectedBy: ["pubmed-anonymous-default"],
      raw: state,
    };
  }

  async readSearchSummary(context: ProviderContext): Promise<SearchSummary> {
    const info = await context.page.evaluate(() => ({
      title: document.title,
      url: location.href,
      bodyText: document.body.innerText,
      metaResultCount: document.querySelector('meta[name="log_resultcount"]')?.getAttribute("content") ?? null,
      resultsAmountText: document.querySelector(".results-amount .value")?.textContent?.trim() ?? null,
      chunkResultsAmount: document.querySelector(".search-results-chunk")?.getAttribute("data-results-amount") ?? null,
      chunkPagesAmount: document.querySelector(".search-results-chunk")?.getAttribute("data-pages-amount") ?? null,
      chunkPageNumber: document.querySelector(".search-results-chunk")?.getAttribute("data-page-number") ?? null,
      chunkIdsCount:
        document
          .querySelector(".search-results-chunk")
          ?.getAttribute("data-chunk-ids")
          ?.split(",")
          .map((value) => value.trim())
          .filter(Boolean).length ?? null,
    }));
    const url = new URL(info.url);
    const query = url.searchParams.get("term") ?? "";
    const parsed = parsePubMedSearchSummary(info);

    return {
      provider: "pubmed",
      query,
      totalResultsText: parsed.totalResults ? parsed.totalResults.toLocaleString("en-US") : null,
      totalResults: parsed.totalResults,
      currentPage: parsed.currentPage,
      totalPages: parsed.totalPages,
      pageSize: parsed.pageSize,
      queryId: null,
      sort: url.searchParams.get("sort"),
      raw: info,
    };
  }

  protected async readResultCards(context: ProviderContext, limit: number, includeAbstract: boolean): Promise<ResultItem[]> {
    const items = await context.page.evaluate(
      ({ requestedLimit, includeAbstracts }) => {
        const cards = Array.from(document.querySelectorAll("article.full-docsum, article")) as HTMLElement[];
        return cards.slice(0, requestedLimit).map((card, index) => {
          const titleLink =
            (card.querySelector(".docsum-title") as HTMLAnchorElement | null) ??
            (card.querySelector("a") as HTMLAnchorElement | null);
          const title = titleLink?.textContent?.trim() ?? `Result ${index + 1}`;
          const authorsText =
            card.querySelector(".docsum-authors")?.textContent?.trim() ??
            card.querySelector(".authors-list")?.textContent?.trim() ??
            null;
          const sourceText =
            card.querySelector(".full-journal-citation")?.textContent?.trim() ??
            card.querySelector(".docsum-journal-citation")?.textContent?.trim() ??
            null;
          const abstractPreview =
            includeAbstracts
              ? card.querySelector(".full-view-snippet, .docsum-snippet")?.textContent?.trim() ??
                (card.innerText.split("\n").map((l) => l.trim()).filter(Boolean).find((l) => l.length > 40) ?? null)
              : null;
          const labels = Array.from(card.querySelectorAll(".docsum-status, .publication-type, .full-view-snippet"))
            .map((value) => value.textContent?.trim())
            .filter(Boolean) as string[];
          return {
            provider: "pubmed",
            indexOnPage: index + 1,
            title,
            href: titleLink?.href ?? null,
            authorsText,
            sourceText,
            yearText: sourceText?.match(/\b(19|20)\d{2}\b/)?.[0] ?? null,
            abstractPreview,
            labels,
            selectable: Boolean(card.querySelector('input[type="checkbox"]')),
            raw: { text: card.innerText.slice(0, 4000) },
          };
        });
      },
      { requestedLimit: limit, includeAbstracts: includeAbstract },
    );
    return items as ResultItem[];
  }

  override async listFilters(context: ProviderContext): Promise<FilterGroup[]> {
    const filters = await context.page.evaluate(() => {
      const normalize = (value: string | null | undefined) => value?.replace(/\s+/g, " ").trim() ?? null;
      const groups = Array.from(document.querySelectorAll([
        '#static-filters .choice-group-wrapper[role="group"][aria-label="Filters"] > .choice-group',
        '#additional_filters.choice-group-wrapper[role="group"][aria-label="Additional filters"] > .choice-group',
      ].join(", ")));
      if (groups.length === 0) {
        return [];
      }

      return groups
        .map((group) => {
          const heading = normalize(group.querySelector("h3.title")?.textContent);
          const inputs = Array.from(group.querySelectorAll('input[type="checkbox"], input[type="radio"]'));
          const options = inputs
            .map((input) => {
              const boundLabel =
                input.id
                  ? group.querySelector(`label[for="${input.id}"]`)
                  : input.closest("label");
              const label = normalize(boundLabel?.textContent) ?? normalize(input.getAttribute("aria-label"));
              return label ? { value: label, label } : null;
            })
            .filter((option): option is { value: string; label: string } => option !== null)
            .filter((option, index, all) => all.findIndex((candidate) => candidate.value === option.value) === index);
          const type = inputs.every((input) => input instanceof HTMLInputElement && input.type === "radio") ? "radio" : "checkbox";
          return heading ? { key: heading, label: heading, type, options } : null;
        })
        .filter((group): group is NonNullable<typeof group> => group !== null && group.options.length > 0);
    });

    return filters as FilterGroup[];
  }

  override async applyFilters(context: ProviderContext, input: FilterApplyRequest[]): Promise<SearchSummary> {
    const filterRoot = context.page.locator("#static-filters").first();
    const additionalFiltersButton = filterRoot.getByRole("button", { name: /^Additional filters$/i }).first();

    for (const filter of input) {
      let hasGroup = await this.findPubMedFilterGroup(context, filter.key);
      if (!hasGroup && await additionalFiltersButton.isVisible().catch(() => false)) {
        await additionalFiltersButton.click({ force: true }).catch(() => undefined);
        hasGroup = await this.findPubMedFilterGroup(context, filter.key);
      }
      if (!hasGroup) {
        continue;
      }

      for (const value of filter.values ?? []) {
        const optionId = await this.findPubMedFilterInputId(context, filter.key, value);
        if (!optionId) {
          continue;
        }

        const checkbox = context.page.locator(`#${cssEscape(optionId)}`).first();
        if (await checkbox.isChecked().catch(() => false)) {
          continue;
        }

        const option = context.page.locator(`label[for="${escapeAttributeSelectorValue(optionId)}"]`).first();
        await option.waitFor({ state: "visible", timeout: 10_000 });
        await option.scrollIntoViewIfNeeded().catch(() => undefined);
        await runWithPageLoad(context.page, async () => {
          await option.click({ force: true });
        });
      }
    }

    return this.readSearchSummary(context);
  }

  override async selectResultsByIndex(context: ProviderContext, indices: number[]): Promise<void> {
    const cards = context.page.locator(this.selectors.resultCards[0]);
    for (const index of indices) {
      const card = cards.nth(Math.max(index - 1, 0));
      const checkbox = card.locator("input.search-result-selector").first();
      await checkbox.waitFor({ state: "attached", timeout: 10_000 });
      await card.scrollIntoViewIfNeeded().catch(() => undefined);

      const checkboxId = await checkbox.getAttribute("id");
      const visibleLabel =
        checkboxId
          ? card.locator(`label.search-result-position[for="${checkboxId}"]`).first()
          : card.locator("label.search-result-position").first();

      if (await visibleLabel.isVisible().catch(() => false)) {
        await visibleLabel.click({ force: true });
      }

      if (!(await checkbox.isChecked().catch(() => false))) {
        await checkbox.check({ force: true }).catch(async () => {
          await checkbox.click({ force: true });
        });
      }
    }
  }

  override async clearSelection(context: ProviderContext): Promise<void> {
    const clearButton = context.page.locator("button.clear-selection-button").first();
    if (await clearButton.isVisible().catch(() => false)) {
      await runWithPageLoad(context.page, async () => {
        await clearButton.click({ force: true });
      });
      return;
    }

    const checkedIds = await context.page.locator("input.search-result-selector:checked").evaluateAll((nodes) =>
      nodes
        .map((node) => (node instanceof HTMLInputElement ? node.id : null))
        .filter((value): value is string => Boolean(value)),
    );

    for (const checkboxId of checkedIds) {
      const label = context.page.locator(`label.search-result-position[for="${checkboxId}"]`).first();
      if (await label.isVisible().catch(() => false)) {
        await label.click({ force: true });
        continue;
      }
      const checkbox = context.page.locator(`#${cssEscape(checkboxId)}`).first();
      await checkbox.uncheck({ force: true }).catch(async () => {
        await checkbox.click({ force: true });
      });
    }
  }

  async detectExportCapability(): Promise<ExportCapability> {
    return {
      requiresInteractiveLogin: false,
      maxBatch: null,
      blockingReason: null,
      raw: { format: "nbib" },
    };
  }

  async exportNative(context: ProviderContext, request: ExportRequest): Promise<ExportResult> {
    const sendToButton = await this.findFirstVisible(context, this.selectors.sendToButtons);
    await runWithPageLoad(context.page, async () => {
      await sendToButton.click({ force: true });
    });

    const dropdownId = await sendToButton.getAttribute("aria-controls");
    const dropdown =
      dropdownId
        ? context.page.locator(`#${cssEscape(dropdownId)}`).first()
        : context.page.locator("#more-actions-dropdown, #results-container-more-actions-dropdown, #page-label-more-actions-dropdown").first();
    const citationTrigger = dropdown.locator(".citation-manager-panel-trigger").filter({ hasText: /Citation manager/i }).first();
    await citationTrigger.waitFor({ state: "visible", timeout: 15_000 });

    await runWithPageLoad(context.page, async () => {
      await citationTrigger.click({ force: true });
    });

    const panel = context.page.locator("#citation-manager-action-panel").first();
    await panel.waitFor({ state: "visible", timeout: 15_000 });

    const scopeSelect = panel.locator("select#citation-manager-action-selection").first();
    if (await scopeSelect.isVisible().catch(() => false)) {
      await scopeSelect.selectOption("all-results");
    }

    const createFileButton = panel.locator('button.action-panel-submit[type="submit"]').first();
    await createFileButton.waitFor({ state: "visible", timeout: 15_000 });
    const exportForm = panel.locator("form#citation-manager-action-panel-form").first();
    await exportForm.waitFor({ state: "attached", timeout: 15_000 });

    const [download] = await Promise.all([
      context.page.waitForEvent("download", { timeout: 30_000 }),
      runWithPageLoad(context.page, async () => {
        await exportForm.evaluate((form) => {
          if (!(form instanceof HTMLFormElement)) {
            throw new Error("PubMed citation manager form was not found.");
          }
          form.requestSubmit();
        });
      }),
    ]);

    const fileName = download.suggestedFilename();
    const nbibPath = path.join(context.downloadsDir, fileName || `pubmed-export-${Date.now()}.nbib`);
    await download.saveAs(nbibPath);

    // Convert NBIB to RIS in-place
    const nbibContent = await readFile(nbibPath, "utf8");
    const risContent = convertNbibToRis(nbibContent);
    const risPath = nbibPath.replace(/\.nbib$/i, ".ris");
    await writeTextFile(risPath, risContent);

    return {
      provider: "pubmed",
      format: "ris",
      path: risPath,
      fileName: fileName?.replace(/\.nbib$/i, ".ris"),
      raw: { scope: request.scope, url: download.url() },
    };
  }
  private async findPubMedFilterGroup(context: ProviderContext, key: string): Promise<boolean> {
    const groupSelector = [
      '#static-filters .choice-group-wrapper[role="group"][aria-label="Filters"] > .choice-group',
      '#additional_filters.choice-group-wrapper[role="group"][aria-label="Additional filters"] > .choice-group',
    ].join(", ");

    return context.page.evaluate(
      ({ requestedKey, selector }) => {
        const normalize = (value: string | null | undefined) => value?.replace(/\s+/g, " ").trim().toLowerCase() ?? "";
        return Array.from(document.querySelectorAll(selector)).some((node) => {
          if (!(node instanceof HTMLElement)) {
            return false;
          }
          return normalize(node.querySelector("h3.title")?.textContent) === normalize(requestedKey);
        });
      },
      { requestedKey: key, selector: groupSelector },
    );
  }

  private async findPubMedFilterInputId(context: ProviderContext, key: string, value: string): Promise<string | null> {
    const groupSelector = [
      '#static-filters .choice-group-wrapper[role="group"][aria-label="Filters"] > .choice-group',
      '#additional_filters.choice-group-wrapper[role="group"][aria-label="Additional filters"] > .choice-group',
    ].join(", ");

    return context.page.evaluate(
      ({ requestedKey, requestedValue, selector }) => {
        const normalize = (text: string | null | undefined) => text?.replace(/\s+/g, " ").trim().toLowerCase() ?? "";
        const groups = Array.from(document.querySelectorAll(selector)).filter((node): node is HTMLElement => node instanceof HTMLElement);
        const group = groups.find((node) => normalize(node.querySelector("h3.title")?.textContent) === normalize(requestedKey));
        if (!group) {
          return null;
        }

        const labels = Array.from(group.querySelectorAll("label"));
        const matchingLabel = labels.find((node) => normalize(node.textContent) === normalize(requestedValue));
        return matchingLabel?.getAttribute("for") ?? null;
      },
      { requestedKey: key, requestedValue: value, selector: groupSelector },
    );
  }
}


function escapeAttributeSelectorValue(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}





