import type { QueryLanguageProfile } from "../provider-contract.js";

export const scopusQueryProfile: QueryLanguageProfile = {
  provider: "scopus",
  supportsRawEditor: true,
  supportsBuilderUi: true,
  supportsUrlQueryRecovery: true,
  rawEntryLabel: "Advanced query",
  fieldTags: [
    { code: "TITLE-ABS-KEY", label: "Title/Abstract/Keywords" },
    { code: "AUTHOR-NAME", label: "Author Name" },
    { code: "SRCTITLE", label: "Source Title" },
    { code: "PUBYEAR", label: "Publication Year" },
    { code: "AFFIL", label: "Affiliation" },
  ],
  booleanOperators: ["AND", "OR", "AND NOT"],
  proximityOperators: ["PRE/", "W/"],
  examples: ['TITLE-ABS-KEY("deep learning")', 'TITLE-ABS-KEY("deep learning") AND PUBYEAR > 2020'],
  constraints: [
    "Search and export permissions are not identical in Scopus.",
    "Anonymous institutional sessions may search but still be blocked on export.",
  ],
  recommendedPatterns: [
    "Use raw advanced query entry as the canonical Scopus input path.",
  ],
  antiPatterns: [
    "Do not infer export permission from search permission.",
  ],
};
