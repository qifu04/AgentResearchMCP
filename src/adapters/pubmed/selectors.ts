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
    '#static-filters .choice-group-wrapper[role="group"][aria-label="Filters"] > .choice-group',
    '#additional_filters.choice-group-wrapper[role="group"][aria-label="Additional filters"] > .choice-group',
    "#static-filters .timeline-filter",
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
