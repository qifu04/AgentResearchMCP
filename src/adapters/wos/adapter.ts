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
import { clickIfVisible, fillAndVerify, normalizeWhitespace, runWithPageLoad, textContentOrNull } from "../../browser/page-helpers.js";
import { ManualInterventionRequiredError } from "../../core/manual-intervention.js";
import { BaseSearchProviderAdapter } from "../base/base-adapter.js";
import { escapeRegExp } from "../base/adapter-utils.js";
import { wosDescriptor } from "./descriptor.js";
import { wosQueryProfile } from "./query-profile.js";
import {
  chooseWosPrimaryExportButtonCandidate,
  WOS_EXPORT_BUTTON_CANDIDATE_ATTRIBUTE,
  type WosExportButtonCandidate,
} from "./export-button-targeting.js";
import {
  chooseWosPrimarySearchButtonCandidate,
  WOS_SEARCH_BUTTON_CANDIDATE_ATTRIBUTE,
  type WosSearchButtonCandidate,
} from "./search-button-targeting.js";
import { wosFilterKeyToLabel, wosSelectors } from "./selectors.js";

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
    await runWithPageLoad(context.page, async () => {
      await this.resolveBlockingOverlays(context, "preparing the page");
      const dismissors = [
        context.page.getByRole("button", { name: /accept|agree|continue/i }).first(),
        context.page.getByRole("button", { name: /close|got it|skip/i }).first(),
        context.page.getByRole("button", { name: /dismiss/i }).first(),
      ];
      for (const locator of dismissors) {
        await clickIfVisible(locator);
      }
    });
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
    const queryBox = await this.findQueryPreview(context);
    return normalizeWhitespace(await queryBox.inputValue());
  }

  override async setCurrentQuery(context: ProviderContext, query: string): Promise<void> {
    await this.ensureQueryBuilderVisible(context);
    await runWithPageLoad(context.page, async () => {
      const queryBox = await this.findQueryPreview(context);
      await fillAndVerify(queryBox, query);
    });
  }

  override async submitSearch(context: ProviderContext): Promise<SearchSummary> {
    await this.ensureQueryBuilderVisible(context);
    await this.clearInterferingUi(context);
    await runWithPageLoad(context.page, async () => {
      const button = await this.findWosSearchButton(context);
      await Promise.all([
        context.page.waitForURL(/\/summary\//, { timeout: 30_000 }).catch(() => undefined),
        button.click(),
      ]);
    });
    return this.readSearchSummary(context);
  }

  async readSearchSummary(context: ProviderContext): Promise<SearchSummary> {
    const info = await context.page.evaluate(() => ({
      title: document.title,
      url: location.href,
      bodyText: document.body.innerText,
    }));
    const queryId = /\/summary\/([^/]+)/.exec(info.url)?.[1] ?? null;
    const totalResults = parseNumber(info.bodyText);
    const currentPage = /\/summary\/[^/]+\/[^/]+\/(\d+)/.exec(info.url)?.[1];
    const totalPages = extractPageCount(info.bodyText);
    const query = info.title.split(" - ")[0]?.trim() || (await this.readCurrentQuery(context)) || "";

    return {
      provider: "wos",
      query,
      totalResultsText: totalResults ? totalResults.toLocaleString("en-US") : null,
      totalResults,
      currentPage: currentPage ? Number(currentPage) : 1,
      totalPages,
      pageSize: 50,
      queryId,
      sort: /\/summary\/[^/]+\/([^/]+)\//.exec(info.url)?.[1] ?? "relevance",
      raw: info,
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
          const title = titleLink?.textContent?.trim() ?? lines[0] ?? `Result ${index + 1}`;
          const abstractLine = lines.find((line) => /abstract/i.test(line)) ?? lines.slice(3).join(" ");
          return {
            provider: "wos",
            indexOnPage: index + 1,
            title,
            href: titleLink?.href ?? null,
            authorsText: lines[1] ?? null,
            sourceText: lines[2] ?? null,
            yearText: lines.find((line) => /\b(19|20)\d{2}\b/.test(line)) ?? null,
            abstractPreview: includeAbstracts ? abstractLine : null,
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
      const groups = Array.from(document.querySelectorAll('[role="group"], aside section, mat-expansion-panel'));
      return groups.slice(0, 20).map((group, index) => {
        const label =
          group.querySelector("h2, h3, h4, button, [role='button']")?.textContent?.trim() ??
          group.textContent?.trim()?.slice(0, 80) ??
          `group-${index + 1}`;
        const options = Array.from(group.querySelectorAll('label, [role="checkbox"]'))
          .map((option) => option.textContent?.trim())
          .filter(Boolean)
          .slice(0, 10)
          .map((value) => ({ value: value as string, label: value as string }));
        return { key: label, label, type: "checkbox", options };
      });
    });
    return filters.filter((group) => group.label && group.options.length > 0) as FilterGroup[];
  }

  override async applyFilters(context: ProviderContext, input: FilterApplyRequest[]): Promise<SearchSummary> {
    for (const filter of input) {
      const groupLabel = wosFilterKeyToLabel[filter.key] ?? filter.key;
      const group = context.page.getByRole("group", { name: new RegExp(groupLabel, "i") }).first();
      if (!(await group.isVisible().catch(() => false))) continue;

      for (const value of filter.values ?? []) {
        const option = group.getByLabel(new RegExp(escapeRegExp(value), "i")).first();
        if (await option.isVisible().catch(() => false)) {
          await option.check({ force: true }).catch(async () => { await option.click({ force: true }); });
        }
      }

      const refineButton = group.getByLabel(/Refine button|Click to filter/i).first();
      if (await refineButton.isVisible().catch(() => false)) {
        await runWithPageLoad(context.page, async () => { await refineButton.click({ force: true }); });
      }
    }
    return this.readSearchSummary(context);
  }

  override async selectResultsByIndex(context: ProviderContext, indices: number[]): Promise<void> {
    for (const index of indices) {
      const checkbox = context.page.locator(`input[type="checkbox"]`).nth(Math.max(index - 1, 0));
      if (await checkbox.isVisible().catch(() => false)) {
        await checkbox.check({ force: true }).catch(async () => { await checkbox.click({ force: true }); });
      }
    }
  }

  override async clearSelection(context: ProviderContext): Promise<void> {
    const checked = context.page.locator('input[type="checkbox"]:checked');
    const count = await checked.count();
    for (let i = 0; i < count; i += 1) {
      await checked.nth(i).uncheck({ force: true }).catch(async () => { await checked.nth(i).click({ force: true }); });
    }
  }

  async detectExportCapability(context: ProviderContext): Promise<ExportCapability> {
    const loginState = await this.detectLoginState(context);
    return {
      nativeFormat: "ris",
      convertibleToRis: true,
      requiresInteractiveLogin: !loginState.canExport,
      supportsPage: true,
      supportsAll: true,
      supportsSelected: true,
      supportsRange: true,
      maxBatch: 1000,
      blockingReason: loginState.canExport ? null : loginState.blockingReason,
      raw: { loginState, maxBatch: 1000 },
    };
  }

  async exportNative(context: ProviderContext, request: ExportRequest): Promise<ExportResult> {
    await this.clearInterferingUi(context);
    const exportButton = await this.findExportButton(context);
    await runWithPageLoad(context.page, async () => { await exportButton.click({ force: true }); });
    await this.resolveBlockingOverlays(context, "opening the export menu");

    const risMenuItem = context.page.locator("button, [role='menuitem']").filter({
      hasText: /RIS \(other reference software\)|^RIS\b/i,
    }).first();
    await risMenuItem.waitFor({ state: "visible", timeout: 15_000 }).catch(async (error) => {
      await this.resolveBlockingOverlays(context, "opening the RIS export menu");
      throw error;
    });

    await runWithPageLoad(context.page, async () => { await risMenuItem.click({ force: true }); });
    await this.resolveBlockingOverlays(context, "opening the RIS export dialog");

    const exportDialog = context.page.locator("mat-dialog-container, [role='dialog'], .cdk-overlay-pane, app-export-overlay").filter({
      hasText: /Export Records to RIS File/i,
    }).first();
    await exportDialog.waitFor({ state: "visible", timeout: 15_000 }).catch(async (error) => {
      await this.resolveBlockingOverlays(context, "opening the RIS export dialog");
      throw error;
    });

    if (request.scope === "page") {
      const pageRadio = exportDialog.getByRole("radio", { name: /All records on page/i }).first();
      if (await pageRadio.isVisible().catch(() => false)) { await pageRadio.click({ force: true }); }
    } else {
      const start = request.start ?? 1;
      const end = request.end ?? 1000;
      await this.selectExportRange(exportDialog, start, end);
    }

    await this.selectExportContent(exportDialog, request.includeAbstracts !== false);

    const confirm = exportDialog.getByRole("button", { name: /^Export$/i }).first();
    await confirm.waitFor({ state: "visible", timeout: 15_000 });

    const downloadPromise = context.page.waitForEvent("download", { timeout: 30_000 }).catch(async (error) => {
      await this.resolveBlockingOverlays(context, "downloading the RIS export");
      throw error;
    });
    const [download] = await Promise.all([
      downloadPromise,
      runWithPageLoad(context.page, async () => { await confirm.click({ force: true }); }),
    ]);

    const fileName = download.suggestedFilename();
    const targetPath = path.join(context.downloadsDir, fileName || `wos-export-${Date.now()}.ris`);
    await download.saveAs(targetPath);

    return {
      provider: "wos",
      format: "ris",
      path: targetPath,
      fileName,
      raw: { url: download.url(), scope: request.scope, start: request.start, end: request.end },
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
      await runWithPageLoad(context.page, async () => { await tab.click(); });
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
      const locator = context.page.locator(selector).filter({ hasText: /^Search$/ }).first();
      if (await locator.isVisible().catch(() => false)) return locator;
    }

    throw new Error("Unable to find the primary Web of Science search button.");
  }

  private async findExportButton(context: ProviderContext) {
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
