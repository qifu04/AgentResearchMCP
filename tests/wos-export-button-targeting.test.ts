import { describe, expect, it } from "vitest";
import { chooseWosPrimaryExportButtonCandidate } from "../src/adapters/wos/export-button-targeting.js";

describe("chooseWosPrimaryExportButtonCandidate", () => {
  it("prefers the main export menu trigger over Export Refine", () => {
    const candidateId = chooseWosPrimaryExportButtonCandidate([
      {
        id: "refine",
        text: "Export Refine",
        ariaLabel: null,
        className: "mdc-button",
        disabled: false,
        withinRefinePanel: true,
        withinSummaryToolbar: false,
        isMenuTrigger: false,
        hasPrimaryExportClass: false,
      },
      {
        id: "main",
        text: "Export expand_more",
        ariaLabel: null,
        className: "mat-mdc-menu-trigger new-wos-btn-style",
        disabled: false,
        withinRefinePanel: false,
        withinSummaryToolbar: true,
        isMenuTrigger: true,
        hasPrimaryExportClass: true,
      },
    ]);

    expect(candidateId).toBe("main");
  });
});
