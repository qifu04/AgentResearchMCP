import type { ProviderDescriptor } from "../provider-contract.js";

export const scopusDescriptor: ProviderDescriptor = {
  id: "scopus",
  displayName: "Scopus",
  entryUrl: "https://www.scopus.com/search/form.uri?display=advanced",
  supportsManualLoginWait: true,
  capabilities: {
    rawQuery: true,
    builderUi: true,
    filters: true,
    inlineAbstracts: true,
    selection: true,
    export: true,
  },
};
