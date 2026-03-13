import { describe, expect, it } from "vitest";
import { chooseWosPrimarySearchButtonCandidate, type WosSearchButtonCandidate } from "../src/adapters/wos/search-button-targeting.js";

function createCandidate(input: Partial<WosSearchButtonCandidate> & Pick<WosSearchButtonCandidate, "id" | "text">): WosSearchButtonCandidate {
  return {
    ariaLabel: null,
    className: "",
    disabled: false,
    withinQueryBuilderForm: false,
    withinQueryPreviewSection: false,
    withinQueryPreviewButtonRow: false,
    ...input,
  };
}

describe("chooseWosPrimarySearchButtonCandidate", () => {
  it("prefers the exact Search button inside the query preview area over search-history actions", () => {
    const result = chooseWosPrimarySearchButtonCandidate([
      createCandidate({
        id: "history",
        text: "View your search history",
        className: "mat-mdc-tooltip-trigger left-side-nav-link",
      }),
      createCandidate({
        id: "saved",
        text: "Saved Searches and Alerts",
        className: "mat-mdc-tooltip-trigger left-side-nav-link",
      }),
      createCandidate({
        id: "search",
        text: "Search",
        className: "search mdc-button mat-mdc-unelevated-button",
        withinQueryBuilderForm: true,
        withinQueryPreviewSection: true,
        withinQueryPreviewButtonRow: true,
      }),
    ]);

    expect(result).toBe("search");
  });

  it("rejects disabled query-builder actions such as Add to query", () => {
    const result = chooseWosPrimarySearchButtonCandidate([
      createCandidate({
        id: "add",
        text: "Add to query",
        className: "search mdc-button mat-mdc-button-disabled",
        disabled: true,
        withinQueryBuilderForm: true,
      }),
      createCandidate({
        id: "search",
        text: "Search",
        className: "search mdc-button",
        withinQueryBuilderForm: true,
        withinQueryPreviewSection: true,
        withinQueryPreviewButtonRow: true,
      }),
    ]);

    expect(result).toBe("search");
  });

  it("returns null when no plausible primary Search button exists", () => {
    const result = chooseWosPrimarySearchButtonCandidate([
      createCandidate({
        id: "history",
        text: "View your search history",
      }),
      createCandidate({
        id: "saved",
        text: "Saved Searches and Alerts",
      }),
    ]);

    expect(result).toBeNull();
  });
});
