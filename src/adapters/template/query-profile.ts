import type { QueryLanguageProfile } from "../provider-contract.js";

/**
 * Query language profile for [YOUR_PROVIDER_NAME].
 *
 * ## How to fill this in
 *
 * 1. Navigate to the provider's advanced search page in a browser.
 * 2. Look for documentation links like "Search Tips", "Query Syntax",
 *    "Help", or "Search Guide" near the search input.
 * 3. Identify the following from the documentation:
 *
 * ### fieldTags
 * What field codes does the provider support?
 * Examples:
 * - PubMed: `[Title]`, `[Author]`, `[MeSH Terms]`
 * - WOS: `TS=` (Topic), `AU=` (Author), `SO=` (Source)
 * - IEEE: `"All Metadata":`, `"Author":`
 * - Scopus: `TITLE-ABS-KEY()`, `AUTHOR-NAME()`, `SRCTITLE()`
 *
 * ### booleanOperators
 * Usually AND, OR, NOT. Some providers use lowercase or AND NOT.
 *
 * ### proximityOperators
 * e.g., NEAR/5, W/3, PRE/0. Omit if not supported.
 *
 * ### wildcards
 * e.g., * (truncation), ? (single char), $ (zero or one char).
 *
 * ### examples
 * Provide 2-3 realistic query examples using the provider's syntax.
 * These help AI agents construct valid queries.
 *
 * ### constraints
 * Important limitations: max query length, nesting depth, field restrictions.
 * Also note if search and export permissions differ.
 *
 * ### recommendedPatterns
 * Best practices for this provider's search.
 *
 * ### antiPatterns
 * Common mistakes to avoid.
 *
 * ## Reference
 * See `pubmed/query-profile.ts` (simple) and `wos/query-profile.ts` (complex).
 */
export const templateQueryProfile: QueryLanguageProfile = {
  provider: "template", // TODO: match your descriptor.id
  supportsRawEditor: true,
  supportsBuilderUi: false,
  supportsUrlQueryRecovery: false,
  rawEntryLabel: null,
  fieldTags: [
    // TODO: Add field tags from the provider's search documentation.
    // Example:
    // { code: "TI", label: "Title", description: "Search in article titles" },
    // { code: "AU", label: "Author", description: "Search by author name" },
    // { code: "AB", label: "Abstract", description: "Search in abstracts" },
  ],
  booleanOperators: ["AND", "OR", "NOT"],
  proximityOperators: [],
  wildcards: [],
  examples: [
    // TODO: Add 2-3 realistic query examples using the provider's syntax.
    // Example: '"deep learning" AND "medical imaging"',
  ],
  constraints: [
    // TODO: Add provider-specific constraints.
    // Example: "Maximum 50 boolean operators per query",
    // Example: "Search and export permissions are not identical",
  ],
  recommendedPatterns: [
    // TODO: Best practices for this provider.
    // Example: "Use raw advanced query entry as the canonical input path.",
  ],
  antiPatterns: [
    // TODO: Common mistakes to avoid.
    // Example: "Do not infer export permission from search permission.",
  ],
};
