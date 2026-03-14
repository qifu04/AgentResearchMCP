import { describe, expect, it } from "vitest";
import { parseScopusSearchSummary } from "../src/adapters/scopus/search-parsing.js";

describe("parseScopusSearchSummary", () => {
  it("parses Chinese result headings and range text", () => {
    const parsed = parseScopusSearchSummary({
      url: 'https://www.scopus.com/results/results.uri?s=TITLE-ABS-KEY(%22ultrasound%22)&sessionSearchId=abc123&limit=10',
      headingText: '找到 98 篇文献',
      rangeText: '结果列表显示总共 98 个结果中的 1 至 10 个结果。',
      bodyText: '',
    });

    expect(parsed.query).toContain('TITLE-ABS-KEY');
    expect(parsed.totalResults).toBe(98);
    expect(parsed.currentPage).toBe(1);
    expect(parsed.pageSize).toBe(10);
  });
});
