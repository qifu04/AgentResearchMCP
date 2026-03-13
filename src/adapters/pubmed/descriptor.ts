import type { ProviderDescriptor } from "../provider-contract.js";

export const pubmedDescriptor: ProviderDescriptor = {
  id: "pubmed",
  displayName: "PubMed",
  entryUrl: "https://pubmed.ncbi.nlm.nih.gov/advanced/",
  supportsManualLoginWait: false,
  capabilities: {
    rawQuery: true,
    builderUi: true,
    filters: true,
    inlineAbstracts: true,
    selection: true,
    export: true,
  },
};
