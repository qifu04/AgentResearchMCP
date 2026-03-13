import type { QueryLanguageProfile } from "../provider-contract.js";

export const pubmedQueryProfile: QueryLanguageProfile = {
  provider: "pubmed",
  supportsRawEditor: true,
  supportsBuilderUi: true,
  supportsUrlQueryRecovery: true,
  rawEntryLabel: "Query box",
  fieldTags: [
    { code: "Title", label: "Title" },
    { code: "Title/Abstract", label: "Title/Abstract" },
    { code: "Author", label: "Author" },
    { code: "MeSH Terms", label: "MeSH Terms" },
    { code: "Journal", label: "Journal" },
    { code: "Publication Date", label: "Publication Date" },
  ],
  booleanOperators: ["AND", "OR", "NOT"],
  examples: ["deep learning", "\"deep learning\" AND review[pt]"],
  constraints: [
    "Advanced Search supports both structured builder terms and free-text query entry.",
    "Result state is recoverable from URL parameters such as term and sort.",
  ],
  recommendedPatterns: [
    "Prefer raw query entry when the agent has already formulated a full PubMed query.",
    "Use URL term recovery when the page is already on search results.",
  ],
  antiPatterns: [
    "Do not assume native RIS export exists; PubMed exports NBIB for citation manager flow.",
  ],
};
