import type { ProviderDescriptor } from "../provider-contract.js";

/**
 * Provider descriptor for [YOUR_PROVIDER_NAME].
 *
 * ## How to fill this in
 *
 * 1. **id**: A short, lowercase identifier (e.g., "arxiv", "dimensions", "embase").
 *    This is used in `create_session({ provider: "your_id" })` and throughout the system.
 *
 * 2. **displayName**: Human-readable name shown in `list_providers` output.
 *
 * 3. **entryUrl**: The advanced/expert search page URL of the provider.
 *    - Navigate to the provider's website manually.
 *    - Find the advanced search page (not the simple search bar).
 *    - Copy that full URL.
 *
 * 4. **supportsManualLoginWait**: Set to `true` if the provider requires
 *    institutional or personal login for search/export (most academic databases do).
 *    Set to `false` only if the provider is fully open access (like PubMed).
 *
 * 5. **capabilities**: Check the provider's website for each feature:
 *    - `rawQuery`: Can users type a raw boolean query string? (usually true)
 *    - `builderUi`: Does the site have a visual query builder? (usually true)
 *    - `filters`: Does the results page have sidebar facet filters AND does
 *      your adapter implement `applyFilters()`? Set false if not implemented.
 *    - `inlineAbstracts`: Are abstracts visible/expandable on the results page?
 *    - `selection`: Can individual results be selected via checkboxes?
 *    - `export`: Does the site support exporting results to a file?
 *
 * ## Reference
 * - PubMed: No login, all capabilities true except filters
 * - WOS: Institutional login, all capabilities true
 * - IEEE: Institutional login, filters false (not implemented)
 * - Scopus: Personal/institutional login, filters false (not implemented)
 */
export const templateDescriptor: ProviderDescriptor = {
  id: "template", // TODO: change to your provider ID
  displayName: "TODO: Provider Display Name",
  entryUrl: "TODO: https://example.com/advanced-search",
  supportsManualLoginWait: true,
  capabilities: {
    rawQuery: true,
    builderUi: false,
    filters: false,
    inlineAbstracts: false,
    selection: false,
    export: true,
  },
};
