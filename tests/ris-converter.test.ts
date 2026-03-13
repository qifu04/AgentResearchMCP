import { describe, expect, it } from "vitest";
import { convertNbibToRis } from "../src/core/ris-converter.js";

describe("convertNbibToRis", () => {
  it("converts a simple NBIB record to RIS", () => {
    const nbib = [
      "PMID- 12345678",
      "TI  - Deep learning in medicine",
      "AU  - Smith J",
      "AU  - Doe A",
      "JT  - Journal of Testing",
      "DP  - 2024 Jan",
      "AB  - Abstract text.",
      "VI  - 10",
      "IP  - 2",
      "PG  - 101-110",
      "LID - 10.1000/test [doi]",
      "",
    ].join("\n");

    const ris = convertNbibToRis(nbib);
    expect(ris).toContain("TY  - JOUR");
    expect(ris).toContain("TI  - Deep learning in medicine");
    expect(ris).toContain("AU  - Smith J");
    expect(ris).toContain("AU  - Doe A");
    expect(ris).toContain("PY  - 2024");
    expect(ris).toContain("DO  - 10.1000/test");
    expect(ris).toContain("ER  - ");
  });
});
