import { describe, expect, it } from "vitest";
import { parseIeeeSearchSummary } from "../src/adapters/ieee/search-parsing.js";

describe("parseIeeeSearchSummary", () => {
  it("reads query and result counts from the structured heading", () => {
    const parsed = parseIeeeSearchSummary({
      url: 'https://ieeexplore.ieee.org/search/searchresult.jsp?action=search&queryText=(%22All%20Metadata%22:ultrasound)%20AND%20(%22All%20Metadata%22:brain-computer%20interface)',
      summaryText: 'Showing 1-25 of 35 results for ("All Metadata":ultrasound) AND ("All Metadata":brain-computer interface)',
    });

    expect(parsed.query).toContain('ultrasound');
    expect(parsed.totalResults).toBe(35);
    expect(parsed.currentPage).toBe(1);
    expect(parsed.pageSize).toBe(25);
  });

  it("handles the single-result heading format", () => {
    const parsed = parseIeeeSearchSummary({
      url: "https://ieeexplore.ieee.org/search/searchresult.jsp?action=search&queryText=(%22All%20Metadata%22:10.1109%2F5.771073)",
      summaryText: 'Showing 1 of 1 result for ("All Metadata":10.1109/5.771073)',
    });

    expect(parsed.query).toContain("10.1109/5.771073");
    expect(parsed.totalResults).toBe(1);
    expect(parsed.currentPage).toBe(1);
    expect(parsed.pageSize).toBe(1);
  });
});
