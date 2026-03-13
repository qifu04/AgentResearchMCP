import type { AdapterSelectors } from "../base/adapter-selectors.js";

export const ieeeSelectors: AdapterSelectors = {
  queryInputs: ['input[name="queryText"]', 'input[type="search"]', 'input[type="text"]'],
  searchButtons: ['button:has-text("Search")', 'button[type="submit"]'],
  resultCards: ['.List-results-items', '.search-results-item', 'article'],
  filterGroups: ['aside section', '.filter', '.accordion'],
};
