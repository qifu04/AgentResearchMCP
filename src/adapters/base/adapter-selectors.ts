/**
 * Standardized selector interface for all adapters.
 * Each adapter provides arrays of CSS selectors tried in order of specificity.
 */
export interface AdapterSelectors {
  /** CSS selectors for the query input element (textarea or input) */
  queryInputs: string[];
  /** CSS selectors for the search/submit button */
  searchButtons: string[];
  /** CSS selectors for result card containers on the results page */
  resultCards: string[];
  /** CSS selectors for filter group containers in the sidebar */
  filterGroups: string[];
  /** Provider-specific extra selector groups */
  [key: string]: string[];
}
