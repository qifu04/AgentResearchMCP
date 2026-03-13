import { normalizeWhitespace } from "../../browser/page-helpers.js";

export interface ScopusSearchSummaryInput {
  url: string;
  headingText?: string | null;
  rangeText?: string | null;
  bodyText?: string | null;
}

export interface ParsedScopusSearchSummary {
  query: string;
  totalResultsText: string | null;
  totalResults: number | null;
  currentPage: number | null;
  pageSize: number | null;
}

export function parseScopusSearchSummary(input: ScopusSearchSummaryInput): ParsedScopusSearchSummary {
  const url = new URL(input.url);
  const query = url.searchParams.get("s") ?? "";
  const headingText = normalizeWhitespace(input.headingText) ?? "";
  const rangeText = normalizeWhitespace(input.rangeText) ?? "";
  const bodyText = normalizeWhitespace(input.bodyText) ?? "";

  const totalResultsText =
    /(Found|found)\s+([\d,]+)\s+documents?/i.exec(headingText)?.[2] ??
    /找到\s+([\d,]+)\s+篇文献/.exec(headingText)?.[1] ??
    /总共\s+([\d,]+)\s+个结果/.exec(rangeText)?.[1] ??
    /(Found|found)\s+([\d,]+)\s+documents?/i.exec(bodyText)?.[2] ??
    /找到\s+([\d,]+)\s+篇文献/.exec(bodyText)?.[1] ??
    null;

  const totalResults = totalResultsText ? Number(totalResultsText.replace(/,/g, "")) : null;
  const rangeMatch =
    /(\d+)\s+(?:to|TO)\s+(\d+)/.exec(rangeText) ??
    /(\d+)\s+至\s+(\d+)/.exec(rangeText) ??
    /(\d+)\s+(?:to|TO)\s+(\d+)/.exec(bodyText) ??
    /(\d+)\s+至\s+(\d+)/.exec(bodyText);
  const start = rangeMatch?.[1] ? Number(rangeMatch[1]) : null;
  const end = rangeMatch?.[2] ? Number(rangeMatch[2]) : null;
  const pageSize = start && end ? end - start + 1 : null;
  const currentPage = start && pageSize ? Math.floor((start - 1) / pageSize) + 1 : null;

  return {
    query,
    totalResultsText,
    totalResults,
    currentPage,
    pageSize,
  };
}
