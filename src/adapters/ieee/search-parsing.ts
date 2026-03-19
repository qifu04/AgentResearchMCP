import { normalizeWhitespace } from "../../browser/page-helpers.js";

export interface IeeeSearchSummaryInput {
  url: string;
  summaryText?: string | null;
}

export interface ParsedIeeeSearchSummary {
  query: string;
  totalResultsText: string | null;
  totalResults: number | null;
  currentPage: number | null;
  pageSize: number | null;
}

export function parseIeeeSearchSummary(input: IeeeSearchSummaryInput): ParsedIeeeSearchSummary {
  const url = new URL(input.url);
  const query = url.searchParams.get("queryText") ?? "";
  const summaryText = normalizeWhitespace(input.summaryText) ?? "";
  const rangeMatch = /Showing\s+(\d+)\s*-\s*(\d+)\s+of\s+([\d,]+)\s+results/i.exec(summaryText);
  const singleMatch = /Showing\s+(\d+)\s+of\s+([\d,]+)\s+result\b/i.exec(summaryText);
  const start = rangeMatch?.[1] ? Number(rangeMatch[1]) : singleMatch?.[1] ? Number(singleMatch[1]) : null;
  const end = rangeMatch?.[2] ? Number(rangeMatch[2]) : singleMatch?.[1] ? Number(singleMatch[1]) : null;
  const totalResultsText = rangeMatch?.[3] ?? singleMatch?.[2] ?? null;
  const totalResults = totalResultsText ? Number(totalResultsText.replace(/,/g, "")) : null;
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
