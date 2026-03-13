import type { AdapterSelectors } from "../base/adapter-selectors.js";

export const scopusSelectors: AdapterSelectors = {
  queryInputs: ['form#advSearchForm #searchfield[contenteditable="true"][role="textbox"]'],
  searchButtons: ["form#advSearchForm button#advSearch"],
  resultCards: [
    'table tr:has(input[aria-label^="选择结果 "])',
    'table tr:has(input[aria-label^="Select result "])',
  ],
  filterGroups: ['main [role="combobox"][aria-expanded]'],
};
