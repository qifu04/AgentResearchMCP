import type { QueryLanguageProfile } from "../provider-contract.js";

export const ieeeQueryProfile: QueryLanguageProfile = {
  provider: "ieee",
  supportsRawEditor: true,
  supportsBuilderUi: true,
  supportsUrlQueryRecovery: true,
  rawEntryLabel: "Search query",
  fieldTags: [
    { code: "queryText", label: "Top search query" },
    { code: "Author", label: "Author" },
    { code: "Affiliation", label: "Affiliation" },
    { code: "Publication Title", label: "Publication Title" },
    { code: "Year", label: "Year" },
  ],
  booleanOperators: ["AND", "OR", "NOT"],
  examples: ["deep learning", "\"deep learning\" AND transformer"],
  constraints: [
    "Export behavior differs between Results and Citations tabs.",
    "Citation RIS export was verified for selected results only.",
  ],
  recommendedPatterns: [
    "Prefer result-page sampling and inline abstract expansion before exporting.",
  ],
  antiPatterns: [
    "Do not assume results CSV export is the same as citation RIS export.",
  ],
};
