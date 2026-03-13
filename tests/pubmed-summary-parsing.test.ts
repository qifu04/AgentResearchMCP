import { describe, expect, it } from "vitest";
import { parsePubMedSearchSummary } from "../src/adapters/pubmed/summary-parsing.js";

describe("parsePubMedSearchSummary", () => {
  it("prefers dedicated DOM/meta counts over autocomplete accessibility text", () => {
    const parsed = parsePubMedSearchSummary({
      bodyText: "5 results are available, use up and down arrow keys to navigate.\n128,840 results\nPage 1 of 12,884",
      metaResultCount: "128840",
      resultsAmountText: "128,840",
      chunkResultsAmount: "128,840",
      chunkPagesAmount: "12,884",
      chunkPageNumber: "1",
      chunkIdsCount: 10,
    });

    expect(parsed.totalResults).toBe(128840);
    expect(parsed.currentPage).toBe(1);
    expect(parsed.totalPages).toBe(12884);
    expect(parsed.pageSize).toBe(10);
  });
});
