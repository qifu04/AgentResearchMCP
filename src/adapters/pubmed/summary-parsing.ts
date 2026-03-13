export interface PubMedSummarySnapshot {
  bodyText?: string | null;
  metaResultCount?: string | null;
  resultsAmountText?: string | null;
  chunkResultsAmount?: string | null;
  chunkPagesAmount?: string | null;
  chunkPageNumber?: string | null;
  chunkIdsCount?: number | null;
}

export interface ParsedPubMedSummary {
  totalResults: number | null;
  currentPage: number;
  totalPages: number | null;
  pageSize: number | null;
}

export function parsePubMedSearchSummary(snapshot: PubMedSummarySnapshot): ParsedPubMedSummary {
  const totalResults =
    parseInteger(snapshot.metaResultCount) ??
    parseInteger(snapshot.resultsAmountText) ??
    parseInteger(snapshot.chunkResultsAmount) ??
    parseSpecificResultsText(snapshot.bodyText) ??
    null;

  const currentPage = parseInteger(snapshot.chunkPageNumber) ?? parseCurrentPage(snapshot.bodyText) ?? 1;
  const totalPages = parseInteger(snapshot.chunkPagesAmount) ?? parseTotalPages(snapshot.bodyText) ?? null;
  const pageSize =
    normalizePositiveInteger(snapshot.chunkIdsCount) ??
    parsePageSize(snapshot.bodyText) ??
    null;

  return {
    totalResults,
    currentPage,
    totalPages,
    pageSize,
  };
}

function parseInteger(value: string | null | undefined): number | null {
  if (!value) {
    return null;
  }

  const match = value.match(/\d{1,3}(?:,\d{3})+|\d+/);
  if (!match) {
    return null;
  }

  return Number(match[0].replace(/,/g, ""));
}

function parseSpecificResultsText(value: string | null | undefined): number | null {
  if (!value) {
    return null;
  }

  const match = value.match(/(?:^|\n)\s*(\d{1,3}(?:,\d{3})+|\d+)\s+results\b/i);
  if (!match) {
    return null;
  }

  return Number(match[1].replace(/,/g, ""));
}

function parseCurrentPage(value: string | null | undefined): number | null {
  if (!value) {
    return null;
  }

  const match = value.match(/\bPage\s+(\d+)\b/i);
  return match ? Number(match[1]) : null;
}

function parseTotalPages(value: string | null | undefined): number | null {
  if (!value) {
    return null;
  }

  const match = value.match(/\bPage\s+\d+\s+of\s+(\d{1,3}(?:,\d{3})+|\d+)\b/i);
  return match ? Number(match[1].replace(/,/g, "")) : null;
}

function parsePageSize(value: string | null | undefined): number | null {
  if (!value) {
    return null;
  }

  const match = value.match(/\b(10|20|50|100|200)\b/);
  return match ? Number(match[1]) : null;
}

function normalizePositiveInteger(value: number | null | undefined): number | null {
  if (!value || value <= 0) {
    return null;
  }
  return value;
}
