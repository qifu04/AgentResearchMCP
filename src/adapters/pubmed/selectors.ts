import type { AdapterSelectors } from "../base/adapter-selectors.js";

export const pubmedSelectors: AdapterSelectors = {
  queryInputs: [
    'textarea[aria-label*="Query"]',
    'input[name="term"]',
    'textarea[name="term"]',
    'input[type="search"]',
    'textarea',
  ],
  searchButtons: [
    'button:has-text("Search")',
    'button[type="submit"]',
  ],
  resultCards: [
    "article.full-docsum",
    "article",
  ],
  filterGroups: [
    "aside section",
    "fieldset",
    ".search-settings",
    ".facet-filter-set",
  ],
  sendToButtons: [
    "#more-actions-trigger",
    "#results-container-more-actions-trigger",
    "#page-label-more-actions-trigger",
    'button[aria-label="Send to"]',
    'button:has-text("Send to")',
    '[role="button"]:has-text("Send to")',
  ],
};
