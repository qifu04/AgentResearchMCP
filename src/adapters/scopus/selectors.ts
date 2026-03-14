import type { AdapterSelectors } from "../base/adapter-selectors.js";

export const scopusSelectors: AdapterSelectors = {
  queryInputs: ['form#advSearchForm #searchfield[contenteditable="true"][role="textbox"]'],
  searchButtons: ["form#advSearchForm button#advSearch"],
  resultCards: [
    'table tr:has(input[aria-label^="选择结果 "])',
    'table tr:has(input[aria-label^="Select result "])',
    '.document-results-list-layout table tbody tr:has(input[type="checkbox"])',
  ],
  filterGroups: ['[role="combobox"][aria-controls]'],
  exportButtons: [
    ".export-dropdown button[aria-haspopup='menu']",
    "button[data-testid='link-download']",
  ],
};
