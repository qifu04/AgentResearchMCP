import type { AdapterSelectors } from "../base/adapter-selectors.js";

export const ieeeSelectors: AdapterSelectors = {
  queryInputs: [
    'textarea#cmdTextArea[name="queryText"][aria-label="Enter Search Text"]',
    "textarea#cmdTextArea",
  ],
  searchButtons: [
    "button.xpl-btn-primary.stats-Adv_Command_search",
    "main button.stats-Adv_Command_search",
  ],
  resultCards: ["xpl-results-item"],
  filterGroups: ["xpl-facets li.refinement-section"],
  exportButtons: ["xpl-export-search-results > button.xpl-btn-primary"],
};
