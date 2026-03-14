import { describe, expect, it } from "vitest";
import { parseWosSearchSummary, parseWosStoredQuery } from "../src/adapters/wos/search-parsing.js";

describe("parseWosSearchSummary", () => {
  it("prefers the title count over unrelated export overlay text", () => {
    const parsed = parseWosSearchSummary({
      url: 'https://webofscience.clarivate.cn/wos/woscc/summary/abc123/relevance/1',
      title: 'TS=(deep learning) – 549,235 – Web of Science Core Collection',
      paginationText: 'Page 1 of 2000',
      currentQuery: 'TS=(deep learning)',
      matchedRecordsText: '1000 records at a time can be exported',
    });

    expect(parsed.query).toBe('TS=(deep learning)');
    expect(parsed.totalResults).toBe(549235);
    expect(parsed.currentPage).toBe(1);
    expect(parsed.totalPages).toBe(2000);
  });

  it("parses real heading and footer summary text from the results page", () => {
    const parsed = parseWosSearchSummary({
      url: 'https://webofscience.clarivate.cn/wos/woscc/summary/abc123/relevance/1',
      title: 'Web of Science',
      resultsHeadingText: '41 results from Web of Science Core Collection for:',
      matchedRecordsText: '41 records matched your query of the 90,667,839 in the data limits you selected.',
      visibleQueryText: 'TS=(ultrasound AND "brain-computer interface")',
      paginationText: 'Page 1 of 1',
    });

    expect(parsed.query).toBe('TS=(ultrasound AND "brain-computer interface")');
    expect(parsed.totalResults).toBe(41);
    expect(parsed.currentPage).toBe(1);
    expect(parsed.totalPages).toBe(1);
  });

  it("restores stored query text from local storage payloads", () => {
    const query = parseWosStoredQuery(JSON.stringify({
      query: [{ rowText: 'TS=(deep learning)' }],
    }));

    expect(query).toBe('TS=(deep learning)');
  });
});
