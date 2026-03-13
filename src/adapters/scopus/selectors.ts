import type { AdapterSelectors } from "../base/adapter-selectors.js";

export const scopusSelectors: AdapterSelectors = {
  queryInputs: ['textarea', 'input[type="text"]'],
  searchButtons: ['button:has-text("Search")', '[role="button"]:has-text("Search")'],
  resultCards: ['[data-testid="results-row"]', 'tr', 'article'],
  filterGroups: ['aside section', 'fieldset', '.filter-panel', '.accordion'],
};
