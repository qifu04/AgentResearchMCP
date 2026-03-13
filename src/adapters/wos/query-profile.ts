import type { QueryLanguageProfile } from "../provider-contract.js";

const fieldTags = [
  ["TS", "Topic"],
  ["TI", "Title"],
  ["AB", "Abstract"],
  ["AU", "Author"],
  ["AI", "Author Identifiers"],
  ["AK", "Author Keywords"],
  ["SO", "Publication Titles"],
  ["DO", "DOI"],
  ["PY", "Year Published"],
  ["CF", "Conference"],
  ["AD", "Address"],
  ["OG", "Affiliation"],
  ["FO", "Funding Agency"],
  ["WC", "Web of Science Categories"],
  ["UT", "Accession Number"],
  ["PMID", "PubMed ID"],
  ["DOP", "Publication Date"],
  ["LD", "Index Date"],
  ["PUBL", "Publisher"],
  ["ALL", "All Fields"],
].map(([code, label]) => ({ code, label }));

export const wosQueryProfile: QueryLanguageProfile = {
  provider: "wos",
  supportsRawEditor: true,
  supportsBuilderUi: true,
  supportsUrlQueryRecovery: false,
  rawEntryLabel: "Query Preview",
  fieldTags,
  booleanOperators: ["AND", "OR", "NOT"],
  proximityOperators: ["NEAR/x", "SAME"],
  wildcards: ["*", "?", "$"],
  examples: ["TS=(deep learning)", "TI=(transformer) AND PY=(2024)"],
  constraints: [
    "All Fields queries are limited to 49 boolean or proximity operators.",
    "Quoted phrases disable lemmatization for the quoted term.",
    "In Title and Topic searches, at least 3 characters must precede right-hand wildcards.",
  ],
  recommendedPatterns: [
    "Prefer raw query entry through Query Preview for deterministic automation.",
    "Prefer explicit field tags instead of relying on assisted builder insertion.",
  ],
  antiPatterns: [
    "Do not assume All Fields behaves like Topic.",
    "Do not exceed provider export batch limits without chunking.",
  ],
};
