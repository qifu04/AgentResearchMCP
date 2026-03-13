import type { AdapterSelectors } from "../base/adapter-selectors.js";

export const wosSelectors: AdapterSelectors = {
  queryInputs: [
    "textarea#advancedSearchInputArea",
    "textarea.search-criteria-input",
    'textarea[placeholder*="Enter or edit your query here"]',
    'textarea[aria-label*="Query Preview"]',
    'textarea[placeholder*="Query Preview"]',
    "textarea",
  ],
  searchButtons: [
    ".search-preview-left-holder .button-row.adv button.search",
    ".upper-search-preview-holder .button-row.adv button.search",
    "app-advanced-search-form .button-row.adv button.search",
    "app-advanced-search-form button.search",
  ],
  resultCards: [
    'app-summary-record',
    '[data-ta="summary-record"]',
    "app-record",
    "article",
  ],
  filterGroups: [
    '[role="group"]',
    'mat-accordion mat-expansion-panel',
    "aside section",
  ],
  queryBuilderTab: [
    'text="QUERY BUILDER"',
    'text="Query Builder"',
  ],
  exportButton: [
    "button.mat-mdc-menu-trigger.new-wos-btn-style",
    "button.mat-mdc-menu-trigger",
    "button[aria-haspopup='menu']",
  ],
  summaryLinks: [
    'a[href*="/full-record/"]',
    'a[href*="/summary/"]',
  ],
};

export const wosFilterKeyToLabel: Record<string, string> = {
  PY: "Publication Years",
  DT: "Document Types",
  OA: "Open Access",
  WC: "Web of Science Categories",
  SU: "Research Areas",
};
