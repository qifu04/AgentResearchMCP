import type { AdapterSelectors } from "../base/adapter-selectors.js";

/**
 * CSS selectors for [YOUR_PROVIDER_NAME] page elements.
 *
 * ## How to fill this in
 *
 * 1. Open the provider's advanced search page in a browser.
 * 2. Use browser DevTools (F12 → Elements tab) to inspect each element.
 * 3. For each selector array, provide multiple selectors ordered from
 *    MOST SPECIFIC to LEAST SPECIFIC. The adapter tries them in order
 *    and uses the first one that matches a visible element.
 *
 * ## Tips for finding selectors
 *
 * - Right-click an element → Inspect → look for unique IDs, aria-labels,
 *   data-testid attributes, or distinctive class names.
 * - Prefer semantic selectors: `[aria-label="..."]`, `[data-testid="..."]`,
 *   `#unique-id` over fragile class-based selectors.
 * - Test selectors in DevTools console: `document.querySelector('your-selector')`
 * - Playwright text selectors work too: `button:has-text("Search")`
 *
 * ## Playwright inspection snippets
 *
 * Run these in your adapter or in a test to discover selectors:
 * ```typescript
 * // Find all inputs on the page:
 * const inputs = await page.locator("textarea, input[type='search'], input[type='text']").all();
 * for (const input of inputs) {
 *   console.log(await input.evaluate(el => ({ tag: el.tagName, id: el.id, name: el.getAttribute('name'), aria: el.getAttribute('aria-label') })));
 * }
 *
 * // Find all buttons with "search" text:
 * const buttons = await page.locator("button, [role='button']").all();
 * for (const btn of buttons) {
 *   const text = await btn.textContent();
 *   if (/search/i.test(text ?? "")) console.log(text, await btn.evaluate(el => el.outerHTML.slice(0, 200)));
 * }
 *
 * // Find result cards after a search:
 * const cards = await page.locator("article, [data-testid*='result'], .result-item, tr").all();
 * console.log(`Found ${cards.length} potential result cards`);
 * ```
 *
 * ## Important
 * Selectors WILL break when the provider updates their site.
 * Provide 2-4 fallback selectors per category for resilience.
 *
 * ## Reference
 * See `pubmed/selectors.ts` (simple) and `wos/selectors.ts` (complex).
 */
export const templateSelectors: AdapterSelectors = {
  /**
   * Query input element on the advanced search page.
   * Look for: textarea, input[type="search"], input[type="text"],
   * or contenteditable divs.
   */
  queryInputs: [
    // TODO: e.g., 'textarea#search-input', 'input[name="query"]',
    //       'input[aria-label="Search Term"]'
  ],

  /**
   * Search/submit button on the advanced search page.
   * Look for: button[type="submit"], button with "Search" text.
   */
  searchButtons: [
    // TODO: e.g., 'button:has-text("Search")', 'button[type="submit"]',
    //       '#search-submit-btn'
  ],

  /**
   * Result card containers on the results page.
   * Each matched element should contain ONE search result with its
   * title, authors, source, and optionally abstract.
   */
  resultCards: [
    // TODO: e.g., "article.search-result", ".result-item",
    //       "[data-testid='result-card']", "tr.result-row"
  ],

  /** Sidebar filter groups. Usually not needed — prefer query-based filtering. */
  filterGroups: [],

  // ─── Provider-specific selector groups ───────────────────────────
  // Add extra selector arrays below as needed for your provider.
  // Examples from existing adapters:
  //
  // PubMed uses:
  //   sendToButtons: ["#more-actions-trigger", ...]
  //
  // WOS uses:
  //   queryBuilderTab: ["button[data-ta='query-builder-tab']", ...]
  //   exportButton: ["button[data-ta='export-menu-trigger']", ...]
  //
  // Scopus uses:
  //   exportButtons: [".export-dropdown button[aria-haspopup='menu']", ...]
  //
  // IEEE uses:
  //   exportButton: ["button.stats-SearchResults_Export", ...]
};
