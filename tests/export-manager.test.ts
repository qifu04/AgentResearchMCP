import { describe, expect, it } from "vitest";
import { planExportChunks } from "../src/core/export-manager.js";

describe("planExportChunks", () => {
  it("splits explicit range exports by maxBatch", () => {
    const chunks = planExportChunks(
      { scope: "range", start: 1, end: 2500 },
      { nativeFormat: "ris", convertibleToRis: true, maxBatch: 1000, supportsRange: true },
    );

    expect(chunks).toEqual([
      { scope: "range", start: 1, end: 1000 },
      { scope: "range", start: 1001, end: 2000 },
      { scope: "range", start: 2001, end: 2500 },
    ]);
  });

  it("turns all-scope exports into range chunks when provider has a max batch", () => {
    const chunks = planExportChunks(
      { scope: "all" },
      { nativeFormat: "ris", convertibleToRis: true, maxBatch: 1000, supportsRange: true },
      { provider: "wos", query: "TS=(deep learning)", totalResults: 2200 },
    );

    expect(chunks).toEqual([
      { scope: "range", start: 1, end: 1000 },
      { scope: "range", start: 1001, end: 2000 },
      { scope: "range", start: 2001, end: 2200 },
    ]);
  });
});
