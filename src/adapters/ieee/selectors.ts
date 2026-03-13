import type { AdapterSelectors } from "../base/adapter-selectors.js";

export const ieeeSelectors: AdapterSelectors = {
  queryInputs: ['form[name="adv-search-form"] input[aria-label="Search Term"]'],
  searchButtons: ['form[name="adv-search-form"] button.stats-Adv_search'],
  resultCards: ["xpl-results-item"],
  filterGroups: ["xpl-facets li.refinement-section"],
  exportButtons: ["xpl-export-search-results > button.xpl-btn-primary"],
};
