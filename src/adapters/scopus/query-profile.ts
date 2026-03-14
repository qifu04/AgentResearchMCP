import type { QueryLanguageProfile } from "../provider-contract.js";

export const scopusQueryProfile: QueryLanguageProfile = {
  provider: "scopus",
  supportsRawEditor: true,
  supportsBuilderUi: true,
  supportsUrlQueryRecovery: true,
  rawEntryLabel: "Advanced query",
  fieldTags: [
    // Combined search
    { code: "ALL",            label: "All Fields",              description: "Searches ~25 sub-fields including title, abstract, keywords, authors, etc." },
    { code: "TITLE-ABS-KEY",  label: "Title/Abstract/Keywords", description: "Combined title, abstract, and keyword search" },
    { code: "TITLE-ABS",      label: "Title/Abstract",          description: "Title and abstract only" },
    // Title & Abstract
    { code: "TITLE",          label: "Title",                   description: "Article title" },
    { code: "ABS",            label: "Abstract",                description: "Abstract text" },
    // Keywords
    { code: "KEY",            label: "Keywords",                description: "Combined: author keywords + index terms + trade names" },
    { code: "AUTHKEY",        label: "Author Keywords",         description: "Author-assigned keywords only" },
    { code: "INDEXTERMS",     label: "Index Terms",             description: "Controlled vocabulary terms" },
    // Author
    { code: "AUTH",           label: "Author",                  description: "Author name (combined last + first)" },
    { code: "AUTHOR-NAME",    label: "Author Name",             description: "Author name with variant matching. AUTHOR-NAME(john AND smith) = same author" },
    { code: "AU-ID",          label: "Author ID",               description: "Scopus author identifier number" },
    { code: "FIRSTAUTH",      label: "First Author",            description: "First listed author" },
    { code: "ORCID",          label: "ORCID",                   description: "Author ORCID, with or without hyphens" },
    // Affiliation
    { code: "AFFIL",          label: "Affiliation",             description: "Combined: city + country + organization. AFFIL(x AND y) = same affiliation" },
    { code: "AF-ID",          label: "Affiliation ID",          description: "Scopus affiliation identifier" },
    { code: "AFFILCOUNTRY",   label: "Affiliation Country",     description: "Country of author affiliation" },
    { code: "AFFILORG",       label: "Affiliation Org",         description: "Organization name" },
    // Source
    { code: "SRCTITLE",       label: "Source Title",            description: "Journal/conference name (partial match)" },
    { code: "EXACTSRCTITLE",  label: "Exact Source Title",      description: "Exact journal name match" },
    { code: "ISSN",           label: "ISSN",                    description: "Journal ISSN (searches print + electronic)" },
    { code: "ISBN",           label: "ISBN",                    description: "Book ISBN" },
    // Document attributes (filtering)
    { code: "DOCTYPE",        label: "Document Type",           description: "ar=Article, re=Review, cp=Conference Paper, ch=Book Chapter, bk=Book, le=Letter, ed=Editorial, no=Note, sh=Short Survey, cr=Conference Review, ip=Article in Press" },
    { code: "SRCTYPE",        label: "Source Type",             description: "j=Journal, b=Book, k=Book Series, p=Conference Proceeding, r=Report, d=Trade Publication" },
    { code: "LANGUAGE",       label: "Language",                description: "Full language name: english, chinese, french, german, japanese, spanish" },
    { code: "SUBJAREA",       label: "Subject Area",            description: "27 codes: MEDI, COMP, ENGI, BIOC, MATH, PHYS, CHEM, NEUR, AGRI, ARTS, BUSI, CENG, DECI, DENT, EART, ECON, ENER, ENVI, HEAL, IMMU, MATE, NURS, PHAR, PSYC, SOCI, VETE, MULT" },
    { code: "PUBYEAR",        label: "Publication Year",        description: "Year with operators: PUBYEAR AFT 2019, PUBYEAR BEF 2025, PUBYEAR IS 2024. Also supports > < =" },
    // Identifiers
    { code: "DOI",            label: "DOI",                     description: "Digital Object Identifier" },
    { code: "PMID",           label: "PubMed ID",               description: "PubMed identifier" },
    { code: "EID",            label: "Scopus EID",              description: "Scopus unique document identifier" },
    // Funding
    { code: "FUND-SPONSOR",   label: "Funding Sponsor",         description: "Funding agency name" },
    { code: "FUND-ACR",       label: "Funding Acronym",         description: "Funding sponsor acronym" },
    { code: "FUND-NO",        label: "Grant Number",            description: "Grant/funding number" },
    { code: "FUND-ALL",       label: "All Funding",             description: "Combined: sponsor + acronym + grant number + acknowledgement text" },
    // Conference
    { code: "CONF",           label: "Conference",              description: "Combined conference info: name + sponsors + location" },
    { code: "CONFNAME",       label: "Conference Name",         description: "Conference name" },
    // References
    { code: "REF",            label: "References",              description: "Search within article references. REF(x AND y) = same reference" },
  ],
  booleanOperators: ["AND", "OR", "AND NOT"],
  proximityOperators: ["W/", "PRE/"],
  wildcards: ["*", "?"],
  examples: [
    "TITLE-ABS-KEY(\"deep learning\") AND DOCTYPE(re) AND PUBYEAR AFT 2019",
    "TITLE-ABS-KEY(\"cancer\") AND LANGUAGE(english) AND SUBJAREA(MEDI)",
    "TITLE-ABS-KEY(\"CRISPR\") AND DOCTYPE(ar) AND FUND-SPONSOR(\"National\")",
    "TITLE-ABS-KEY(\"Tidal Energy\" OR ocean W/3 energy) AND PUBYEAR AFT 2019",
  ],
  constraints: [
    "Boolean precedence: OR > AND > AND NOT (different from most databases!). Always use parentheses.",
    "Wildcards: ? (single char), * (zero or more). No double-sided truncation (*term*).",
    "Proximity: W/n (within n words, any order), PRE/n (first precedes second by n words). Cannot mix W/ and PRE/ in same expression.",
    "Loose phrase: \"heart attack\" — ignores punctuation. Exact phrase: {heart attack} — literal match including punctuation.",
    "PUBYEAR uses AFT/BEF/IS operators: PUBYEAR AFT 2019, PUBYEAR BEF 2025. Also supports > < =.",
    "AUTHOR-NAME(john AND smith) requires both in same author; AUTHOR-NAME(john) AND AUTHOR-NAME(smith) allows different authors.",
    "REF(darwin 1859) requires both in same reference; REF(darwin) AND REF(1859) allows different references.",
    "Search and export permissions are not identical. Anonymous institutional sessions may search but be blocked on export.",
  ],
  recommendedPatterns: [
    "Use raw advanced query entry as the canonical Scopus input path.",
    "Use TITLE-ABS-KEY for broad topic search; narrow with TITLE or KEY for precision.",
    "Combine DOCTYPE, LANGUAGE, PUBYEAR in query to avoid sidebar filter dependency.",
  ],
  antiPatterns: [
    "Do not infer export permission from search permission.",
    "Do not use single quotes for phrases — only double quotes or curly braces.",
    "Do not mix W/n and PRE/n in the same proximity expression.",
  ],
};
