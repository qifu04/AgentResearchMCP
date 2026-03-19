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
import { writeTextFile } from "../../utils/fs.js";
import { sleep } from "../../utils/time.js";
import { scopusDescriptor } from "./descriptor.js";
import {
  deriveScopusExportFileName,
  findScopusBulkJob,
  parseScopusBulkExportId,
  parseScopusPresignedUrl,
  type ScopusBulkJob,
} from "./export-job.js";
import { scopusQueryProfile } from "./query-profile.js";
import { parseScopusSearchSummary } from "./search-parsing.js";
import { scopusSelectors } from "./selectors.js";

const SCOPUS_EXPORT_INITIATE_PATH = "/gateway/export-service-reactive/export/bulk-job/initiate";
const SCOPUS_EXPORT_JOBS_PATH = "/gateway/export-service-reactive/export/bulk-jobs";
const SCOPUS_EXPORT_POLL_MS = 2_000;
const SCOPUS_EXPORT_READY_TIMEOUT_MS = 90_000;
const SCOPUS_EXPORT_DOWNLOAD_TIMEOUT_MS = 30_000;
const SCOPUS_EXPORT_FIELD_GROUPS = [
  "authors",
  "titles",
  "year",
  "eid",
  "sourceTitle",
  "volumeIssuePages",
  "citedBy",
  "source",
  "documentType",
  "publicationStage",
  "doi",
  "openAccess",
  "affiliations",
  "serialIdentifiers",
  "pubMedId",
  "publisher",
  "editors",
  "originalLanguage",
  "correspondenceAddress",
  "abbreviatedSourceTitle",
  "abstract",
  "authorKeywords",
  "indexedKeywords",
  "fundingDetails",
  "fundingTexts",
  "tradenamesAndManufacturers",
  "accessionNumbersAndChemicals",
  "conferenceInformation",
  "references",
] as const;

export class ScopusAdapter extends BaseSearchProviderAdapter {
  readonly descriptor = scopusDescriptor;
  readonly queryProfile = scopusQueryProfile;
  readonly selectors = scopusSelectors;
  protected readonly startupProbeQuery = 'DOI("10.1016/j.cell.2011.02.013")';
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
    const onScopusDomain = new URL(state.url).hostname.endsWith("scopus.com");
    const isInstitutional =
      !isPersonal &&
      onScopusDomain &&
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
      requiresInteractiveLogin: !loginState.canExport,
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

    const summary = await this.readSearchSummary(context).catch(() => null);
    const start = Math.max(1, request.start ?? 1);
    const end = Math.max(start, Math.min(summary?.totalResults ?? 2000, request.end ?? 2000));
    const query = summary?.query?.trim();
    if (!query) {
      throw new Error("Scopus export requires a resolved query before starting the bulk export.");
    }

    await this.clearInterferingUi(context);
    const locale = await context.page.evaluate(() => document.documentElement.lang || navigator.language || "en-US");
    const bulkExportId = await this.initiateBulkExport(context, {
      query,
      start,
      end,
      locale,
    });
    const bulkJob = await this.waitForBulkExportJob(context, bulkExportId);
    const presignedUrl = await this.generateBulkExportUrl(context, bulkExportId);
    const response = await context.page.context().request.get(presignedUrl, {
      failOnStatusCode: false,
      timeout: SCOPUS_EXPORT_DOWNLOAD_TIMEOUT_MS,
    });
    if (!response.ok()) {
      throw new Error(`Scopus export download failed with status ${response.status()}.`);
    }

    const fileName = deriveScopusExportFileName(presignedUrl, bulkJob.fileUrl ?? null);
    const targetPath = path.join(context.downloadsDir, fileName);
    await writeTextFile(targetPath, await response.text());

    return {
      provider: "scopus",
      format: "ris",
      path: targetPath,
      fileName,
      raw: {
        scope: request.scope,
        start,
        end,
        bulkExportId,
        status: bulkJob.status,
        fileUrl: bulkJob.fileUrl ?? null,
        url: presignedUrl,
      },
    };
  }

  private async initiateBulkExport(
    context: ProviderContext,
    input: { query: string; start: number; end: number; locale: string },
  ): Promise<string> {
    const initiateResponse = await this.fetchScopusApiText(context, SCOPUS_EXPORT_INITIATE_PATH, {
      method: "POST",
      body: JSON.stringify({
        searchRequest: {
          query: input.query,
          documentClassification: "PRIMARY",
          resultSet: {
            offset: input.start - 1,
            itemCount: input.end - input.start + 1,
          },
        },
        fileType: "RIS",
        exportType: "PUBLICATION",
        fieldGroupIdentifiers: SCOPUS_EXPORT_FIELD_GROUPS,
        locale: input.locale,
        userQuery: input.query,
      }),
    });
    if (!initiateResponse.ok) {
      throw new Error(`Scopus bulk export initiation failed with status ${initiateResponse.status}.`);
    }

    const bulkExportId = parseScopusBulkExportId(initiateResponse.text);
    if (!bulkExportId) {
      throw new Error("Scopus bulk export initiation did not return a bulkExportId.");
    }

    return bulkExportId;
  }

  private async waitForBulkExportJob(context: ProviderContext, bulkExportId: string): Promise<ScopusBulkJob> {
    const startedAt = Date.now();

    while (Date.now() - startedAt < SCOPUS_EXPORT_READY_TIMEOUT_MS) {
      const response = await this.fetchScopusApiText(context, SCOPUS_EXPORT_JOBS_PATH, {
        method: "GET",
      });
      if (!response.ok) {
        if (isTransientScopusExportStatus(response.status)) {
          await sleep(SCOPUS_EXPORT_POLL_MS);
          continue;
        }
        throw new Error(`Scopus bulk export polling failed with status ${response.status}.`);
      }

      const job = findScopusBulkJob(response.text, bulkExportId);
      if (job?.status === "COMPLETED") {
        return job;
      }
      if (job?.status === "FAILED") {
        throw new Error(`Scopus bulk export job ${bulkExportId} failed.`);
      }

      await sleep(SCOPUS_EXPORT_POLL_MS);
    }

    throw new Error(`Timed out waiting for Scopus bulk export job ${bulkExportId} to complete.`);
  }

  private async generateBulkExportUrl(context: ProviderContext, bulkExportId: string): Promise<string> {
    const generateUrl = new URL(
      `/gateway/export-service-reactive/export/bulk-job/${bulkExportId}/generate-url`,
      context.page.url(),
    ).pathname;
    for (let attempt = 1; attempt <= 5; attempt += 1) {
      const response = await this.fetchScopusApiText(context, generateUrl, {
        method: "POST",
      });
      if (!response.ok) {
        if (isTransientScopusExportStatus(response.status) && attempt < 5) {
          await sleep(SCOPUS_EXPORT_POLL_MS);
          continue;
        }
        throw new Error(`Scopus bulk export URL generation failed with status ${response.status}.`);
      }

      const presignedUrl = parseScopusPresignedUrl(response.text);
      if (!presignedUrl) {
        throw new Error(`Scopus bulk export job ${bulkExportId} did not return a presigned URL.`);
      }

      return presignedUrl;
    }

    throw new Error(`Scopus bulk export job ${bulkExportId} did not return a presigned URL.`);
  }

  private async fetchScopusApiText(
    context: ProviderContext,
    pathName: string,
    init: { method: "GET" | "POST"; body?: string },
  ): Promise<{ ok: boolean; status: number; text: string }> {
    return context.page.evaluate(
      async ({ pathName: requestPath, method, body }) => {
        const response = await fetch(requestPath, {
          method,
          credentials: "include",
          headers: body ? { "content-type": "application/json" } : undefined,
          body,
        });
        return {
          ok: response.ok,
          status: response.status,
          text: await response.text(),
        };
      },
      {
        pathName,
        method: init.method,
        body: init.body ?? null,
      },
    );
  }
}

function isTransientScopusExportStatus(status: number): boolean {
  return status === 429 || status === 502 || status === 503 || status === 504;
}


