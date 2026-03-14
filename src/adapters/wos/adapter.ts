import path from "node:path";
import type { Locator } from "playwright";
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
import { clickIfVisible, fillAndVerify, normalizeWhitespace, readLocatorValue, runWithPageLoad, textContentOrNull } from "../../browser/page-helpers.js";
import { ManualInterventionRequiredError } from "../../core/manual-intervention.js";
import { BaseSearchProviderAdapter } from "../base/base-adapter.js";
import { cssEscape, escapeRegExp } from "../base/adapter-utils.js";
import { wosDescriptor } from "./descriptor.js";
import { wosQueryProfile } from "./query-profile.js";
import {
  chooseWosPrimaryExportButtonCandidate,
  WOS_EXPORT_BUTTON_CANDIDATE_ATTRIBUTE,
  type WosExportButtonCandidate,
} from "./export-button-targeting.js";
import { writeTextFile } from "../../utils/fs.js";
import {
  chooseWosPrimarySearchButtonCandidate,
  WOS_SEARCH_BUTTON_CANDIDATE_ATTRIBUTE,
  type WosSearchButtonCandidate,
} from "./search-button-targeting.js";
import { wosFilterKeyToLabel, wosSelectors } from "./selectors.js";
import { extractWosQueryId, parseWosSearchSummary, parseWosStoredQuery } from "./search-parsing.js";

const DEBUG_WOS_EXPORT = process.env.DEBUG_WOS_EXPORT === "1";

export class WosAdapter extends BaseSearchProviderAdapter {
  readonly descriptor = wosDescriptor;
  readonly queryProfile = wosQueryProfile;
  readonly selectors = wosSelectors;
  readonly queryParamName = null;
  readonly submitUrlPattern = /\/summary\//;

  // ── Overrides ──

  override async openAdvancedSearch(context: ProviderContext): Promise<void> {
    await runWithPageLoad(context.page, async () => {
      await context.page.goto(this.descriptor.entryUrl, { waitUntil: "domcontentloaded" });
    });
    await this.ensureQueryBuilderVisible(context);
  }

  override async clearInterferingUi(context: ProviderContext): Promise<void> {
    // Intentionally NOT wrapped in runWithPageLoad — WoS keeps background
    // network requests alive (analytics, telemetry) that prevent networkidle
    // from resolving in a reasonable time.
    await this.resolveBlockingOverlays(context, "preparing the page");
    const dismissors = [
      context.page.getByRole("button", { name: /accept all|accept|agree|continue/i }).first(),
      context.page.getByRole("button", { name: /close this tour/i }).first(),
      context.page.getByRole("button", { name: /close|got it|skip/i }).first(),
      context.page.getByRole("button", { name: /dismiss/i }).first(),
    ];
    for (const locator of dismissors) {
      await clickIfVisible(locator);
    }
  }

  async detectLoginState(context: ProviderContext): Promise<LoginState> {
    const sessionState = await context.page.evaluate(() => ({
      sid: (() => { try { return localStorage.getItem("wos_sid"); } catch { return null; } })(),
      bodyText: document.body.innerText,
      title: document.title,
      url: location.href,
    }));
    const institutionAccess = extractInstitution(sessionState.bodyText);
    const hasSid = Boolean(sessionState.sid);
    const canSearch = hasSid || Boolean(institutionAccess);

    return {
      kind: canSearch ? "institutional" : "anonymous",
      authenticated: false,
      canSearch,
      canExport: canSearch,
      institutionAccess,
      requiresInteractiveLogin: !canSearch,
      blockingReason: canSearch ? null : "Institutional access or session token was not detected.",
      detectedBy: [
        ...(hasSid ? ["localStorage:wos_sid"] : []),
        ...(institutionAccess ? ["body:institutionAccess"] : []),
      ],
      raw: sessionState,
    };
  }

  override async readCurrentQuery(context: ProviderContext): Promise<string | null> {
    if (/\/summary\//.test(context.page.url())) {
      const storedQuery = await this.readStoredQuery(context);
      if (storedQuery) {
        return storedQuery;
      }
    }

    const queryBox = await this.findQueryPreview(context).catch(() => null);
    if (!queryBox) {
      return null;
    }

    return readLocatorValue(queryBox);
  }

  override async setCurrentQuery(context: ProviderContext, query: string): Promise<void> {
    if (/\/summary\//.test(context.page.url())) {
      await this.openAdvancedSearch(context);
    }

    await this.ensureQueryBuilderVisible(context);
    const queryBox = await this.findQueryPreview(context);
    await fillAndVerify(queryBox, query);
  }

  override async submitSearch(context: ProviderContext): Promise<SearchSummary> {
    await this.ensureQueryBuilderVisible(context);
    await this.clearInterferingUi(context);
    const button = await this.findWosSearchButton(context);
    await Promise.all([
      context.page.waitForURL(/\/summary\//, { timeout: 30_000 }).catch(() => undefined),
      button.click(),
    ]);
    await context.page.waitForLoadState("domcontentloaded");
    return this.readSearchSummary(context);
  }

  async readSearchSummary(context: ProviderContext): Promise<SearchSummary> {
    const queryId = extractWosQueryId(context.page.url());
    const storedQuery = await this.readStoredQuery(context);
    const storedHits = await this.readStoredHits(context, queryId);
    const info = await context.page.evaluate(() => {
      const normalize = (value: string | null | undefined) => value?.replace(/\s+/g, " ").trim() ?? null;
      const resultsHeadingText =
        Array.from(document.querySelectorAll("h1, h2, h3"))
          .map((node) => normalize(node.textContent))
          .find((text) => Boolean(text && /\bresults?\s+from\s+Web of Science\b/i.test(text))) ?? null;
      const matchedRecordsText =
        Array.from(document.querySelectorAll("div, p, span"))
          .map((node) => normalize(node.textContent))
          .find((text) => Boolean(text && /\brecords?\s+matched your query\b/i.test(text))) ?? null;
      const visibleQueryText =
        Array.from(document.querySelectorAll("strong"))
          .map((node) => normalize(node.textContent))
          .find((text) => Boolean(text && /[=#()]/.test(text) && (/[=]/.test(text) || /\b(?:AND|OR|NOT)\b/i.test(text)))) ?? null;
      const paginationText =
        Array.from(document.querySelectorAll("button, span, div"))
          .map((node) => normalize(node.textContent) ?? "")
          .find((text) => /\bPage\s+\d+\s+of\s+[\d,]+\b/i.test(text)) ?? null;

      return {
        title: document.title,
        url: location.href,
        paginationText,
        resultsHeadingText,
        matchedRecordsText,
        visibleQueryText,
        bodyText: document.body.innerText,
      };
    });
    const parsed = parseWosSearchSummary({
      url: info.url,
      title: info.title,
      paginationText: info.paginationText,
      currentQuery: storedQuery,
      resultsHeadingText: info.resultsHeadingText,
      matchedRecordsText: info.matchedRecordsText,
      visibleQueryText: info.visibleQueryText,
    });
    const totalResults = parsed.totalResults ?? storedHits?.found ?? null;
    const totalResultsText = parsed.totalResultsText ?? (totalResults ? totalResults.toLocaleString("en-US") : null);

    return {
      provider: "wos",
      query: parsed.query ?? "",
      totalResultsText,
      totalResults,
      currentPage: parsed.currentPage ?? 1,
      totalPages: parsed.totalPages,
      pageSize: 50,
      queryId,
      sort: /\/summary\/[^/]+\/([^/]+)\//.exec(info.url)?.[1] ?? "relevance",
      raw: {
        ...info,
        storedQuery,
        storedHits,
      },
    };
  }

  protected async readResultCards(context: ProviderContext, limit: number, includeAbstract: boolean): Promise<ResultItem[]> {
    const items = await context.page.evaluate(
      ({ limit: requestedLimit, selectors, includeAbstracts }) => {
        const containers: HTMLElement[] = [];
        for (const selector of selectors) {
          const nodes = Array.from(document.querySelectorAll(selector)) as HTMLElement[];
          if (nodes.length > 0) { containers.push(...nodes); break; }
        }
        const links = Array.from(document.querySelectorAll('a[href*="/full-record/"]')) as HTMLAnchorElement[];
        const fallbackContainers =
          containers.length > 0
            ? containers
            : links.map((link) => (link.closest("article, li, div") as HTMLElement | null)).filter(Boolean) as HTMLElement[];

        return fallbackContainers.slice(0, requestedLimit).map((container, index) => {
          const titleLink =
            (container.querySelector('a[href*="/full-record/"]') as HTMLAnchorElement | null) ??
            (container.querySelector("h1 a, h2 a, h3 a, a") as HTMLAnchorElement | null);
          const lines = container.innerText.split("\n").map((line) => line.trim()).filter(Boolean);
          const cleanInlineText = (value: string | null | undefined) =>
            value
              ?.replace(/(?:arrow_drop_down|expand_more|more_horiz)/gi, " ")
              .replace(/\b(?:Show more|Show less|Full text at publisher|Free Full Text from Publisher|Enriched Cited References|Related records)\b/gi, " ")
              .replace(/\s+/g, " ")
              .trim() ?? "";
          const isNoiseLine = (value: string) => /^(?:Citation|Citations|References|\d+)$/i.test(value);
          const title = cleanInlineText(titleLink?.textContent) || lines[0] || `Result ${index + 1}`;
          const titleLineIndex = lines.findIndex((line) => cleanInlineText(line) === title);
          const contentLines = (titleLineIndex >= 0 ? lines.slice(titleLineIndex + 1) : lines.slice(1))
            .map((line) => cleanInlineText(line))
            .filter(Boolean);
          const authorsText = contentLines[0] || null;
          const detailLines = contentLines.slice(1);
          const abstractStartIndex = detailLines.findIndex((line) => {
            const wordCount = line.split(/\s+/).filter(Boolean).length;
            return line.length >= 120 || (wordCount >= 12 && /[.!?]$/.test(line));
          });
          const sourceLines = (abstractStartIndex >= 0 ? detailLines.slice(0, abstractStartIndex) : detailLines.slice(0, 3))
            .filter((line) => !isNoiseLine(line));
          const abstractLines = (abstractStartIndex >= 0 ? detailLines.slice(abstractStartIndex) : detailLines.slice(3))
            .filter((line) => !isNoiseLine(line));
          const sourceText = cleanInlineText(sourceLines.join(" ")) || null;
          const yearText = contentLines
            .map((line) => /\b(19|20)\d{2}\b/.exec(line)?.[0] ?? null)
            .find((value): value is string => value !== null) ?? null;
          const abstractPreview = includeAbstracts ? cleanInlineText(abstractLines.join(" ")) || null : null;
          return {
            provider: "wos",
            indexOnPage: index + 1,
            title,
            href: titleLink?.href ?? null,
            authorsText,
            sourceText,
            yearText,
            abstractPreview,
            selectable: Boolean(container.querySelector('input[type="checkbox"]')),
            raw: { text: container.innerText.slice(0, 4000) },
          };
        });
      },
      { limit, selectors: this.selectors.resultCards, includeAbstracts: includeAbstract },
    );
    return items as ResultItem[];
  }

  override async listFilters(context: ProviderContext): Promise<FilterGroup[]> {
    const filters = await context.page.evaluate(() => {
      const normalize = (value: string | null | undefined) => value?.replace(/\s+/g, " ").trim() ?? null;
      const refinePanel = document.querySelector('form[aria-label="Refine panel"]');
      if (!refinePanel) {
        return [];
      }

      const sections = Array.from(refinePanel.querySelectorAll('fieldset.filter-section[id^="filter-section-"]'));
      return sections.slice(0, 20).map((section) => {
        const label =
          normalize(section.querySelector('legend.filter-heading')?.textContent) ??
          normalize(section.querySelector('button.filter-heading.legend-button[aria-controls]')?.textContent) ??
          null;

        const options = Array.from(section.querySelectorAll('input.mdc-checkbox__native-control[name][value][aria-label]'))
          .map((option) => normalize(option.getAttribute("aria-label")))
          .map((value) => {
            if (!value) {
              return null;
            }

            const labelMatch = /^(.*?)\.\s+[\d,]+\s+matching records\b/i.exec(value);
            const optionLabel = normalize(labelMatch?.[1] ?? value);
            return optionLabel ? { value: optionLabel, label: optionLabel } : null;
          })
          .filter((option): option is { value: string; label: string } => option !== null)
          .filter((option, index, all) => all.findIndex((candidate) => candidate.value === option.value) === index)
          .slice(0, 10);

        return label ? { key: label, label, type: "checkbox", options } : null;
      }).filter((group) => group && group.options.length > 0);
    });
    return filters as FilterGroup[];
  }

  override async applyFilters(context: ProviderContext, input: FilterApplyRequest[]): Promise<SearchSummary> {
    for (const filter of input) {
      const groupLabel = wosFilterKeyToLabel[filter.key] ?? filter.key;
      const sectionId = await this.findWosFilterSectionId(context, groupLabel);
      if (!sectionId) {
        continue;
      }

      const section = context.page.locator(`#${cssEscape(sectionId)}`).first();
      if (!(await section.isVisible().catch(() => false))) {
        continue;
      }

      for (const value of filter.values ?? []) {
        let option = section.getByRole("checkbox", { name: new RegExp(`^${escapeRegExp(value)}(?:\\.|$)`, "i") }).first();
        if (!(await option.isVisible().catch(() => false))) {
          const toggle = section.locator('button.filter-heading.legend-button[aria-controls]').first();
          if (await toggle.isVisible().catch(() => false)) {
            await toggle.click({ force: true }).catch(() => undefined);
          }
          option = section.getByRole("checkbox", { name: new RegExp(`^${escapeRegExp(value)}(?:\\.|$)`, "i") }).first();
        }

        if (await option.isVisible().catch(() => false)) {
          await option.scrollIntoViewIfNeeded().catch(() => undefined);
          await option.check({ force: true }).catch(async () => {
            await option.click({ force: true });
          });
        }
      }

      const refineButton = section.locator('button[data-ta="refine-submit"][aria-label^="Refine button"]').first();
      if (await refineButton.isVisible().catch(() => false)) {
        await runWithPageLoad(context.page, async () => {
          await refineButton.click({ force: true });
        });
      }
    }
    return this.readSearchSummary(context);
  }

  override async selectResultsByIndex(context: ProviderContext, indices: number[]): Promise<void> {
    for (const index of indices) {
      const checkbox = await this.findResultSelectionCheckboxByIndex(context, index);
      await checkbox.scrollIntoViewIfNeeded().catch(() => undefined);
      await checkbox.check({ force: true }).catch(async () => {
        await checkbox.click({ force: true });
      });
    }
  }

  override async clearSelection(context: ProviderContext): Promise<void> {
    const checked = context.page.locator(
      this.selectors.resultCards
        .map((sel) => `${sel} input[type="checkbox"]:checked`)
        .join(", "),
    );
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
      requiresInteractiveLogin: !loginState.canExport,
      maxBatch: 1000,
      blockingReason: loginState.canExport ? null : loginState.blockingReason,
      raw: { loginState, maxBatch: 1000 },
    };
  }

  async exportNative(context: ProviderContext, request: ExportRequest): Promise<ExportResult> {
    await this.clearInterferingUi(context);
    this.debugExport("start", { scope: request.scope });

    const exportButton = await this.findExportButton(context);
    await exportButton.click({ force: true });
    await this.resolveBlockingOverlays(context, "opening the export menu");
    this.debugExport("menu opened");

    const exportMenu = context.page
      .getByRole("menu")
      .filter({ has: context.page.getByRole("menuitem", { name: /^RIS \(other reference software\)$/i }) })
      .first();
    await exportMenu.waitFor({ state: "visible", timeout: 15_000 }).catch(async (error) => {
      await this.resolveBlockingOverlays(context, "opening the RIS export menu");
      throw error;
    });

    const risMenuItem = exportMenu.getByRole("menuitem", { name: /^RIS \(other reference software\)$/i }).first();
    await risMenuItem.click({ force: true });
    await this.resolveBlockingOverlays(context, "opening the RIS export dialog");
    this.debugExport("ris menu clicked");

    const exportDialog = await this.findRisExportDialog(context);
    this.debugExport("dialog visible");

    // Always export all results via the range mechanism (start=1, end=totalResults or maxBatch)
    const summary = await this.readSearchSummary(context).catch(() => null);
    const totalResults = summary?.totalResults ?? null;
    const start = request.start ?? 1;
    const end = request.end ?? (totalResults ? Math.min(totalResults, 1000) : 1000);
    await this.selectExportRange(exportDialog, start, end);

    await this.selectExportContent(exportDialog, request.includeAbstracts !== false);

    const confirm = exportDialog.getByRole("button", { name: /^Export$/i }).first();
    await confirm.waitFor({ state: "visible", timeout: 15_000 });
    this.debugExport("confirm visible");

    const exportResponsePromise = context.page.waitForResponse(
      (response) =>
        response.url().includes("/api/wosnx/indic/export/saveToFile") &&
        response.request().method() === "POST",
      { timeout: 30_000 },
    ).catch(async (error) => {
      await this.resolveBlockingOverlays(context, "downloading the RIS export");
      throw error;
    });
    const [exportResponse] = await Promise.all([
      exportResponsePromise,
      confirm.click({ force: true }),
    ]);
    this.debugExport("response received", { status: exportResponse.status() });

    if (!exportResponse.ok()) {
      throw new Error(`Web of Science RIS export failed with status ${exportResponse.status()}.`);
    }

    const risText = await exportResponse.text();
    const fileName = `wos-export-${Date.now()}.ris`;
    const targetPath = path.join(context.downloadsDir, fileName);
    await writeTextFile(targetPath, risText.endsWith("\n") ? risText : `${risText}\n`);
    this.debugExport("file written", { targetPath });

    return {
      provider: "wos",
      format: "ris",
      path: targetPath,
      fileName,
      raw: {
        url: exportResponse.url(),
        status: exportResponse.status(),
        scope: request.scope,
        start,
        end,
      },
    };
  }

  // ── WoS-specific private methods ──

  private async selectExportRange(dialog: Locator, start: number, end: number): Promise<void> {
    const rangeRadio = dialog.getByRole("radio", { name: /Records from/i }).first();
    if (await rangeRadio.isVisible().catch(() => false)) { await rangeRadio.click({ force: true }); }

    const spinbuttons = dialog.getByRole("spinbutton");
    const count = await spinbuttons.count();
    if (count >= 2) {
      await spinbuttons.nth(0).fill(String(start));
      await spinbuttons.nth(1).fill(String(end));
    } else {
      const inputs = dialog.locator('input[type="number"], input[type="text"]');
      if ((await inputs.count()) >= 2) {
        await inputs.nth(0).fill(String(start));
        await inputs.nth(1).fill(String(end));
      }
    }
  }

  private async selectExportContent(dialog: Locator, _includeAbstracts: boolean): Promise<void> {
    const desiredLabel = /Full Record/i;
    const dropdownButton = dialog.locator("button").filter({
      hasText: /Author, Title, Source|Full Record|Custom selection/i,
    }).first();

    if (!(await dropdownButton.isVisible().catch(() => false))) return;

    const currentText = normalizeWhitespace(await textContentOrNull(dropdownButton)) ?? "";
    if (desiredLabel.test(currentText)) return;

    await dropdownButton.click({ force: true });
    const option = dialog.page().getByRole("option", { name: desiredLabel }).first();
    await option.waitFor({ state: "visible", timeout: 5_000 }).catch(() => undefined);
    if (await option.isVisible().catch(() => false)) {
      await option.click({ force: true });
    } else {
      await dialog.page().keyboard.press("Escape");
    }
  }

  private async ensureQueryBuilderVisible(context: ProviderContext): Promise<void> {
    const queryBox = await this.findQueryPreview(context).catch(() => null);
    if (queryBox) return;
    const tab = await this.findFirstVisible(context, this.selectors.queryBuilderTab).catch(() => null);
    if (tab) {
      await tab.click();
      await context.page.waitForLoadState("domcontentloaded");
    }
  }

  private async findQueryPreview(context: ProviderContext) {
    return this.findFirstVisible(context, this.selectors.queryInputs);
  }

  private async findWosSearchButton(context: ProviderContext) {
    const queryPreview = await this.findQueryPreview(context).catch(() => null);
    if (queryPreview) {
      const previewHolder = context.page.locator(".search-preview-left-holder").filter({ has: queryPreview }).first();
      const previewButtonRow = previewHolder.locator(".button-row.adv").first();
      const primaryButton = previewButtonRow.getByRole("button", { name: /^Search$/ }).first();
      if (await primaryButton.isVisible().catch(() => false)) return primaryButton;

      const scopedFallback = previewHolder.locator("button.search").filter({ hasText: /^Search$/ }).first();
      if (await scopedFallback.isVisible().catch(() => false)) return scopedFallback;
    }

    const analyzedButton = await this.findSearchButtonByCandidateAnalysis(context);
    if (analyzedButton) return analyzedButton;

    for (const selector of this.selectors.searchButtons) {
      const locator = context.page.locator(selector).filter({ hasText: /Search/ }).first();
      if (await locator.isVisible().catch(() => false)) return locator;
    }

    throw new Error("Unable to find the primary Web of Science search button.");
  }

  private async findExportButton(context: ProviderContext) {
    const summaryToolbar = context.page.getByRole("region", { name: /summaryRecordsTop/i }).first();
    if (await summaryToolbar.isVisible().catch(() => false)) {
      const toolbarButton = summaryToolbar.getByRole("button", { name: /^Export$/i }).first();
      if (await toolbarButton.isVisible().catch(() => false)) return toolbarButton;
    }

    const primaryButton = context.page
      .locator("button.mat-mdc-menu-trigger.new-wos-btn-style")
      .filter({ hasText: /^Export\b/i })
      .first();
    if (await primaryButton.isVisible().catch(() => false)) return primaryButton;

    const analyzedButton = await this.findExportButtonByCandidateAnalysis(context);
    if (analyzedButton) return analyzedButton;

    const fallbackCandidates = context.page.locator("button.mat-mdc-menu-trigger, button[aria-haspopup='menu']");
    const count = await fallbackCandidates.count();
    for (let i = 0; i < count; i += 1) {
      const candidate = fallbackCandidates.nth(i);
      const text = normalizeWhitespace(await textContentOrNull(candidate)) ?? "";
      if (!/^Export\b/i.test(text) || /Refine/i.test(text)) continue;
      if (await candidate.isVisible().catch(() => false)) return candidate;
    }

    throw new Error("Unable to find the primary Web of Science export button.");
  }

  private async findRisExportDialog(context: ProviderContext): Promise<Locator> {
    // Target the `.window` container inside `app-export-overlay` rather than
    // the custom element itself — Angular components default to
    // `display: inline` which Playwright treats as zero-size / hidden.
    const dialog = context.page
      .locator("app-export-overlay .window")
      .filter({
        has: context.page.locator("h1", { hasText: /Export Records to RIS File/i }),
      })
      .first();

    // Wait for the Angular overlay route to activate — do NOT accept the mere
    // existence of `app-export-overlay` because the element may already be in
    // the DOM as a hidden component shell from a previous export.
    await context.page.waitForFunction(
      () => location.href.includes("(overlay:export/ris)"),
      undefined,
      { timeout: 30_000 },
    ).catch(async (error) => {
      await this.resolveBlockingOverlays(context, "opening the RIS export dialog");
      throw error;
    });

    await dialog.waitFor({ state: "visible", timeout: 30_000 }).catch(async (error) => {
      await this.resolveBlockingOverlays(context, "opening the RIS export dialog");
      throw error;
    });

    return dialog;
  }

  private debugExport(step: string, data?: Record<string, unknown>): void {
    if (!DEBUG_WOS_EXPORT) {
      return;
    }

    console.log(`[wos export] ${step}`, data ?? "");
  }

  private async findSearchButtonByCandidateAnalysis(context: ProviderContext) {
    const candidates = await context.page.evaluate(
      ({ querySelectors, candidateAttribute }) => {
        const queryPreview = querySelectors
          .map((selector) => document.querySelector(selector))
          .find((node): node is HTMLTextAreaElement => node instanceof HTMLTextAreaElement);
        const queryBuilderForm = queryPreview?.closest("form");
        const queryPreviewSection = queryPreview?.closest(".search-preview-left-holder, .upper-search-preview-holder");
        const queryPreviewButtonRow =
          queryPreviewSection?.querySelector(".button-row.adv") ??
          queryBuilderForm?.querySelector(".button-row.adv");

        for (const existing of Array.from(document.querySelectorAll(`[${candidateAttribute}]`))) {
          existing.removeAttribute(candidateAttribute);
        }

        return Array.from(document.querySelectorAll("button, [role='button']")).map((button, index) => {
          button.setAttribute(candidateAttribute, String(index));
          return {
            id: String(index),
            text: button.textContent?.replace(/\s+/g, " ").trim() ?? "",
            ariaLabel: button.getAttribute("aria-label"),
            className: typeof button.className === "string" ? button.className : "",
            disabled:
              (button instanceof HTMLButtonElement && button.disabled) ||
              button.getAttribute("aria-disabled") === "true",
            withinQueryBuilderForm: Boolean(queryBuilderForm?.contains(button)),
            withinQueryPreviewSection: Boolean(queryPreviewSection?.contains(button)),
            withinQueryPreviewButtonRow: Boolean(queryPreviewButtonRow?.contains(button)),
          };
        });
      },
      { querySelectors: this.selectors.queryInputs, candidateAttribute: WOS_SEARCH_BUTTON_CANDIDATE_ATTRIBUTE },
    );

    const candidateId = chooseWosPrimarySearchButtonCandidate(candidates as WosSearchButtonCandidate[]);
    if (!candidateId) return null;

    const locator = context.page.locator(`[${WOS_SEARCH_BUTTON_CANDIDATE_ATTRIBUTE}="${candidateId}"]`).first();
    if (await locator.isVisible().catch(() => false)) return locator;
    return null;
  }

  private async findExportButtonByCandidateAnalysis(context: ProviderContext) {
    const candidates = await context.page.evaluate(
      ({ candidateAttribute }) => {
        for (const existing of Array.from(document.querySelectorAll(`[${candidateAttribute}]`))) {
          existing.removeAttribute(candidateAttribute);
        }
        return Array.from(document.querySelectorAll("button, [role='button']")).map((button, index) => {
          button.setAttribute(candidateAttribute, String(index));
          return {
            id: String(index),
            text: button.textContent?.replace(/\s+/g, " ").trim() ?? "",
            ariaLabel: button.getAttribute("aria-label"),
            className: typeof button.className === "string" ? button.className : "",
            disabled:
              (button instanceof HTMLButtonElement && button.disabled) ||
              button.getAttribute("aria-disabled") === "true",
            withinRefinePanel: Boolean(button.closest("app-refine-panel, .refine-panel-container")),
            withinSummaryToolbar: Boolean(button.closest(".summary-top-options, .summary-section")),
            isMenuTrigger:
              button.getAttribute("aria-haspopup") === "menu" ||
              button.classList.contains("mat-mdc-menu-trigger"),
            hasPrimaryExportClass: button.classList.contains("new-wos-btn-style"),
          };
        });
      },
      { candidateAttribute: WOS_EXPORT_BUTTON_CANDIDATE_ATTRIBUTE },
    );

    const candidateId = chooseWosPrimaryExportButtonCandidate(candidates as WosExportButtonCandidate[]);
    if (!candidateId) return null;

    const locator = context.page.locator(`[${WOS_EXPORT_BUTTON_CANDIDATE_ATTRIBUTE}="${candidateId}"]`).first();
    if (await locator.isVisible().catch(() => false)) return locator;
    return null;
  }

  private async findWosFilterSectionId(context: ProviderContext, label: string): Promise<string | null> {
    return context.page.evaluate((requestedLabel) => {
      const normalize = (value: string | null | undefined) => value?.replace(/\s+/g, " ").trim().toLowerCase() ?? "";
      const expected = normalize(requestedLabel);
      const sections = Array.from(document.querySelectorAll('form[aria-label="Refine panel"] fieldset.filter-section[id^="filter-section-"]'));
      const matchingSection = sections.find((section) => {
        if (!(section instanceof HTMLFieldSetElement)) {
          return false;
        }

        const legendText = normalize(section.querySelector('legend.filter-heading')?.textContent);
        const buttonText = normalize(section.querySelector('button.filter-heading.legend-button[aria-controls]')?.textContent);
        return legendText === expected || buttonText === expected || Boolean(buttonText && buttonText.startsWith(`${expected} `));
      });

      return matchingSection instanceof HTMLFieldSetElement ? matchingSection.id : null;
    }, label);
  }

  private async readStoredQuery(context: ProviderContext): Promise<string | null> {
    return context.page.evaluate((queryId) => {
      if (!queryId) {
        return null;
      }

      try {
        return localStorage.getItem(`wos_search_${queryId}`);
      } catch {
        return null;
      }
    }, extractWosQueryId(context.page.url())).then((value) => parseWosStoredQuery(value));
  }

  private async readStoredHits(
    context: ProviderContext,
    queryId: string | null,
  ): Promise<{ found: number | null; available: number | null } | null> {
    return context.page.evaluate((id) => {
      if (!id) {
        return null;
      }

      try {
        const raw = localStorage.getItem(`wos_search_hits_${id}`);
        if (!raw) {
          return null;
        }

        const parsed = JSON.parse(raw) as { found?: unknown; available?: unknown };
        const toNumber = (value: unknown) => {
          if (typeof value === "number" && Number.isFinite(value)) {
            return value;
          }
          if (typeof value === "string") {
            const numeric = Number(value.replace(/,/g, ""));
            return Number.isFinite(numeric) ? numeric : null;
          }
          return null;
        };

        return {
          found: toNumber(parsed.found),
          available: toNumber(parsed.available),
        };
      } catch {
        return null;
      }
    }, queryId);
  }

  private async findResultSelectionCheckboxByIndex(context: ProviderContext, index: number) {
    const cards = context.page.locator(this.selectors.resultCards.join(", "));
    const card = cards.nth(Math.max(index - 1, 0));
    const checkbox = card.locator('input[type="checkbox"]').first();
    await checkbox.waitFor({ state: "visible", timeout: 10_000 });
    return checkbox;
  }

  private async acceptCrossBorderPrivacyDialog(context: ProviderContext): Promise<void> {
    const confirmButton = context.page.locator("#cbdt_confirm").first();
    await confirmButton.waitFor({ state: "visible", timeout: 1_500 }).catch(() => undefined);
    if (!(await confirmButton.isVisible().catch(() => false))) return;

    const checkboxSelectors = [
      'input[aria-label="cbdt_checkbox_text1"]',
      'input[aria-label="cbdt_checkbox_text2"]',
    ];
    for (const selector of checkboxSelectors) {
      const checkbox = context.page.locator(selector).first();
      if (!(await checkbox.isVisible().catch(() => false))) continue;
      if (await checkbox.isChecked().catch(() => false)) continue;
      await checkbox.scrollIntoViewIfNeeded().catch(() => undefined);
      await checkbox.check({ force: true }).catch(async () => { await checkbox.click({ force: true }); });
    }

    if (await confirmButton.isVisible().catch(() => false)) {
      await confirmButton.waitFor({ state: "visible", timeout: 15_000 });
      await confirmButton.click({ force: true });
      await confirmButton.waitFor({ state: "hidden", timeout: 15_000 }).catch(() => undefined);
    }
  }

  private async closeCookiePreferenceCenter(context: ProviderContext): Promise<void> {
    // Try the "Accept all" banner button first (OneTrust cookie consent)
    const acceptAll = context.page.locator("#onetrust-accept-btn-handler").first();
    if (await acceptAll.isVisible().catch(() => false)) {
      await acceptAll.click({ force: true });
      await acceptAll.waitFor({ state: "hidden", timeout: 15_000 }).catch(() => undefined);
      return;
    }

    // Fallback: close the cookie preference center panel
    const closeButton = context.page.locator("#close-pc-btn-handler").first();
    if (!(await closeButton.isVisible().catch(() => false))) return;
    await closeButton.click({ force: true });
    await closeButton.waitFor({ state: "hidden", timeout: 15_000 }).catch(() => undefined);
  }

  private async resolveBlockingOverlays(context: ProviderContext, action: string): Promise<void> {
    await this.acceptCrossBorderPrivacyDialog(context);
    await this.closeCookiePreferenceCenter(context);
    await context.page.waitForTimeout(500);
    await this.acceptCrossBorderPrivacyDialog(context);
    await this.closeCookiePreferenceCenter(context);

    if (await context.page.locator("#cbdt_confirm").first().isVisible().catch(() => false)) {
      throw new ManualInterventionRequiredError(
        `Web of Science is blocked by a cross-border data consent dialog while ${action}. Please complete the dialog manually in the headed browser, then retry the same action.`,
        {
          provider: "wos",
          blockerType: "dialog",
          selectors: ["#cbdt_confirm", 'input[aria-label=\"cbdt_checkbox_text1\"]', 'input[aria-label=\"cbdt_checkbox_text2\"]'],
          instructions: [
            "Tick both consent checkboxes in the Cross Border Personal Data Transfer dialog.",
            "Click Confirm and continue.",
            "Retry the same MCP action in the same session.",
          ],
        },
      );
    }

    if (await context.page.locator("#onetrust-pc-sdk:not(.ot-hide)").first().isVisible().catch(() => false)) {
      throw new ManualInterventionRequiredError(
        `Web of Science is blocked by the Cookie Preference Center while ${action}. Please close the cookie dialog manually in the headed browser, then retry the same action.`,
        {
          provider: "wos",
          blockerType: "cookie",
          selectors: ["#close-pc-btn-handler", "#onetrust-pc-sdk"],
          instructions: [
            "Close the Cookie Preference Center dialog.",
            "Retry the same MCP action in the same session.",
          ],
        },
      );
    }
  }
}

// ── Module-level helpers ──

function parseNumber(value: string): number | null {
  const match = value.match(/\b(\d{1,3}(?:,\d{3})+|\d+)\b/);
  if (!match) return null;
  return Number(match[1].replace(/,/g, ""));
}

function extractPageCount(value: string): number | null {
  const match = value.match(/\bof\s+(\d{1,3}(?:,\d{3})+|\d+)\b/i);
  if (!match) return null;
  return Number(match[1].replace(/,/g, ""));
}

function extractInstitution(bodyText: string): string | null {
  const match = bodyText.match(/(?:Access provided by|Institutional access)\s*:?\s*([^\n]+)/i);
  if (match?.[1]) return normalizeWhitespace(match[1]);
  if (/Peking University/i.test(bodyText)) return "Peking University";
  return null;
}





















