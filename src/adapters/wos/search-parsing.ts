import { normalizeWhitespace } from "../../browser/page-helpers.js";

export interface WosSearchSummaryInput {
  url: string;
  title?: string | null;
  paginationText?: string | null;
  currentQuery?: string | null;
  resultsHeadingText?: string | null;
  matchedRecordsText?: string | null;
  visibleQueryText?: string | null;
}

export interface ParsedWosSearchSummary {
  query: string | null;
  totalResultsText: string | null;
  totalResults: number | null;
  currentPage: number | null;
  totalPages: number | null;
}

export function extractWosQueryId(url: string): string | null {
  return /\/summary\/([^/]+)/.exec(url)?.[1] ?? null;
}

export function parseWosStoredQuery(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  try {
    const parsed = JSON.parse(value) as { query?: Array<{ rowText?: string | null }> };
    const rows = parsed.query
      ?.map((item) => normalizeWhitespace(item.rowText))
      .filter((item): item is string => Boolean(item));
    return rows && rows.length > 0 ? rows.join(" ") : null;
  } catch {
    return null;
  }
}

export function parseWosSearchSummary(input: WosSearchSummaryInput): ParsedWosSearchSummary {
  const title = normalizeWhitespace(input.title) ?? "";
  const resultsHeadingText = normalizeWhitespace(input.resultsHeadingText) ?? "";
  const matchedRecordsText = normalizeWhitespace(input.matchedRecordsText) ?? "";
  const paginationText = normalizeWhitespace(input.paginationText) ?? "";
  const titleMatch = /^(.*?)\s+[-–—]\s+([\d,]+)\s+[-–—]\s+Web of Science/i.exec(title);
  const totalResultsText =
    extractLeadingCount(resultsHeadingText, /\bresults?\s+from\s+Web of Science\b/i) ??
    extractLeadingCount(matchedRecordsText, /\brecords?\s+matched your query\b/i) ??
    titleMatch?.[2] ??
    null;
  const totalResults = totalResultsText ? Number(totalResultsText.replace(/,/g, "")) : null;
  const query =
    normalizeWhitespace(input.visibleQueryText) ??
    titleMatch?.[1] ??
    normalizeWhitespace(input.currentQuery) ??
    null;
  const currentPage = /\/summary\/[^/]+\/[^/]+\/(\d+)/.exec(input.url)?.[1];
  const totalPages = /\bof\s+([\d,]+)\b/i.exec(paginationText)?.[1] ?? null;

  return {
    query,
    totalResultsText,
    totalResults,
    currentPage: currentPage ? Number(currentPage) : null,
    totalPages: totalPages ? Number(totalPages.replace(/,/g, "")) : null,
  };
}

function extractLeadingCount(value: string, suffixPattern: RegExp): string | null {
  if (!value) {
    return null;
  }

  const match = new RegExp(`^(\\d{1,3}(?:,\\d{3})+|\\d+)\\s+${suffixPattern.source}`, "i").exec(value);
  return match?.[1] ?? null;
}
