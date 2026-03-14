import type {
  ExportCapability,
  ExportRequest,
  ExportResult,
  FilterApplyRequest,
  FilterGroup,
  LoginState,
  ProviderContext,
  ResultItem,
  SearchSummary,
} from "../provider-contract.js";
import { BaseSearchProviderAdapter } from "../base/base-adapter.js";
import { templateDescriptor } from "./descriptor.js";
import { templateQueryProfile } from "./query-profile.js";
import { templateSelectors } from "./selectors.js";

/**
 * Adapter for [YOUR_PROVIDER_NAME].
 *
 * ## Implementation Guide
 *
 * This adapter extends `BaseSearchProviderAdapter` which provides default
 * implementations for many methods. You MUST implement the 5 abstract methods
 * marked below. You MAY override any default method if the provider needs
 * custom behavior.
 *
 * ## Recommended implementation order
 *
 * 1. Fill in `descriptor.ts`, `query-profile.ts`, and `selectors.ts` first.
 * 2. Implement `detectLoginState` — simplest, lets you test session creation.
 * 3. Implement `readSearchSummary` and `readResultCards` — lets you test search.
 * 4. Implement `detectExportCapability` and `exportNative` — lets you test export.
 * 5. Override optional methods only if the defaults don't work.
 *
 * ## Playwright patterns used in this codebase
 *
 * - `context.page` is a Playwright `Page` object.
 * - `context.page.evaluate(() => { ... })` for DOM queries.
 * - `context.page.locator("selector")` for element interactions.
 * - `this.findFirstVisible(context, selectorArray)` tries multiple selectors,
 *   returns the first visible match.
 * - `runWithPageLoad(page, action)` wraps actions that trigger navigation.
 * - `fillAndVerify(locator, value)` fills input and verifies the value took.
 * - `clickIfVisible(locator)` safe click if element is visible.
 *
 * ## Registration
 *
 * After implementing, register in `src/adapters/registry.ts`:
 * ```typescript
 * import { YourAdapter } from "./your-provider/adapter.js";
 * // Add to builtins array: new YourAdapter(),
 * ```
 *
 * ## Reference adapters
 * - PubMed (`pubmed/adapter.ts`): Simplest. No login. Good starting point.
 * - IEEE (`ieee/adapter.ts`): Medium complexity. Has login detection.
 * - Scopus (`scopus/adapter.ts`): Complex export flow (async bulk API).
 * - WOS (`wos/adapter.ts`): Most complex. Custom button targeting, overlays.
 */
export class TemplateAdapter extends BaseSearchProviderAdapter {
  readonly descriptor = templateDescriptor;
  readonly queryProfile = templateQueryProfile;
  readonly selectors = templateSelectors;

  /**
   * URL search parameter that holds the query string on the results page.
   *
   * ## How to determine
   * 1. Perform a search manually on the provider's website.
   * 2. Look at the URL on the results page.
   * 3. Find the query parameter:
   *    - PubMed: `?term=...` → `"term"`
   *    - IEEE: `?queryText=...` → `"queryText"`
   *    - Scopus: `?s=...` → `"s"`
   *    - WOS: query is in localStorage, not URL → `null`
   * 4. Set this to the parameter name, or `null` if not in the URL.
   *
   * Used by the base class `readCurrentQuery()` to recover the query from the URL.
   */
  readonly queryParamName: string | null = null; // TODO

  /**
   * RegExp pattern that the results page URL matches after search submission.
   *
   * ## How to determine
   * 1. Perform a search manually.
   * 2. Note the URL pattern of the results page.
   * 3. Create a RegExp that matches it:
   *    - PubMed: `/term=/`
   *    - WOS: `/\/summary\//`
   *    - Scopus: `/results\.uri/`
   *    - IEEE: `/searchresult\.jsp/`
   *
   * Used by the base class `submitSearch()` to wait for navigation.
   */
  readonly submitUrlPattern: RegExp = /TODO/; // TODO

  // ═══════════════════════════════════════════════════════════════════
  //  REQUIRED: Abstract methods you MUST implement
  // ═══════════════════════════════════════════════════════════════════

  /**
   * Detect the current login and access state of the provider session.
   *
   * ## What this does
   * Inspects the current page to determine whether the user has
   * institutional access, personal login, or is anonymous.
   *
   * ## Page state expected
   * The browser is on the provider's search page (after `openAdvancedSearch`).
   *
   * ## Implementation steps
   * 1. Use `context.page.evaluate()` to extract signals from the DOM:
   *    - Institution name text (e.g., "Access provided by: ...")
   *    - Logged-in user indicators (avatar, username, "Sign out" link)
   *    - localStorage/sessionStorage session tokens
   *    - "Sign in" or "Login" buttons (indicates NOT logged in)
   * 2. Based on signals, determine:
   *    - `kind`: "anonymous" | "institutional" | "personal" | "unknown"
   *    - `canSearch`: Can the user perform searches?
   *    - `canExport`: Can the user export results?
   * 3. Return a `LoginState` object.
   *
   * ## Playwright inspection
   * ```typescript
   * const state = await context.page.evaluate(() => ({
   *   bodyText: document.body.innerText.slice(0, 2000),
   *   hasSignIn: !!document.querySelector('a[href*="login"], button:has-text("Sign in")'),
   *   institution: document.querySelector('.institution-name')?.textContent,
   *   hasUserMenu: !!document.querySelector('[class*="user-menu"], [class*="profile"]'),
   * }));
   * ```
   *
   * ## Reference
   * - PubMed: Always returns `{ kind: "anonymous", canSearch: true, canExport: true }`
   * - IEEE: Checks body text for "Access provided by:" institution name
   * - Scopus: Checks `window.isLoggedInUser`, `window.ScopusUser.accessTypeAA`
   */
  async detectLoginState(context: ProviderContext): Promise<LoginState> {
    throw new Error("TODO: implement detectLoginState");
  }

  /**
   * Read the search summary from the current results page.
   *
   * ## What this does
   * Extracts total result count, current page, pagination info, and
   * the active query from the results page.
   *
   * ## Page state expected
   * The browser is on the search results page (after `run_search`).
   *
   * ## Implementation steps
   * 1. Use `context.page.evaluate()` to scrape:
   *    - Total results count (look for "1,234 results" or "Showing 1-10 of 5,678")
   *    - Current page number
   *    - Total pages
   *    - The active query string (from URL params, heading, or breadcrumb)
   * 2. Parse numbers from text (handle commas: "1,234" → 1234).
   * 3. Return a `SearchSummary` object.
   *
   * ## Tips
   * - Many providers put result count in a heading or meta tag.
   * - Consider creating a separate `search-parsing.ts` file for parsing logic
   *   (see `pubmed/summary-parsing.ts`, `wos/search-parsing.ts`).
   *
   * ## Playwright inspection
   * ```typescript
   * const info = await context.page.evaluate(() => ({
   *   headings: Array.from(document.querySelectorAll('h1,h2,h3'))
   *     .map(h => h.textContent?.trim()),
   *   url: location.href,
   *   title: document.title,
   * }));
   * ```
   */
  async readSearchSummary(context: ProviderContext): Promise<SearchSummary> {
    throw new Error("TODO: implement readSearchSummary");
  }

  /**
   * Read individual result cards from the search results page.
   *
   * ## What this does
   * Scrapes the first `limit` result items, extracting title, authors,
   * source, year, and optionally abstract.
   *
   * ## Page state expected
   * The browser is on the search results page with results visible.
   *
   * ## Implementation steps
   * 1. Select all result card containers using `this.selectors.resultCards`.
   * 2. For each card (up to `limit`), extract:
   *    - `title`: The article/paper title (usually a link)
   *    - `href`: URL to the full record
   *    - `authorsText`: Author names as a single string
   *    - `sourceText`: Journal/conference name, volume, pages
   *    - `yearText`: Publication year (regex: `/\b(19|20)\d{2}\b/`)
   *    - `abstractPreview`: First ~200 chars of abstract (only if `includeAbstract`)
   *    - `selectable`: Whether the card has a checkbox for selection
   * 3. Return `ResultItem[]` with `provider` set to your provider ID.
   *
   * ## Important
   * This method is `protected` — it's called by the base class
   * `readResultItems()` and `readResultAbstracts()` methods.
   *
   * ## Playwright inspection
   * ```typescript
   * const cards = await context.page.locator("YOUR_RESULT_CARD_SELECTOR").all();
   * for (const card of cards.slice(0, 3)) {
   *   console.log(await card.evaluate(el => ({
   *     text: el.innerText.slice(0, 500),
   *     links: Array.from(el.querySelectorAll('a')).map(a => ({
   *       text: a.textContent, href: a.href
   *     })),
   *   })));
   * }
   * ```
   *
   * ## Reference
   * See `pubmed/adapter.ts` `readResultCards` for a clean example.
   */
  protected async readResultCards(
    context: ProviderContext,
    limit: number,
    includeAbstract: boolean,
  ): Promise<ResultItem[]> {
    throw new Error("TODO: implement readResultCards");
  }

  /**
   * Detect the export capabilities and limitations of the current session.
   *
   * ## What this does
   * Returns whether export is available, maximum batch size, and any
   * blocking reasons.
   *
   * ## Page state expected
   * The browser is on the search results page (after a search).
   *
   * ## Implementation steps
   * 1. Check if the user has export access (may depend on login state).
   * 2. Look for export buttons/menus on the results page.
   * 3. Determine:
   *    - `requiresInteractiveLogin`: Does export need login?
   *    - `maxBatch`: Maximum records per export (e.g., WOS=1000, Scopus=2000)
   *    - `blockingReason`: Why export might be unavailable
   *
   * ## Reference
   * - PubMed: `{ requiresInteractiveLogin: false, maxBatch: null }` (unlimited)
   * - WOS: Checks login state, returns `maxBatch: 1000`
   * - IEEE: `{ maxBatch: null }` with CSV format info
   */
  async detectExportCapability(context: ProviderContext): Promise<ExportCapability> {
    throw new Error("TODO: implement detectExportCapability");
  }

  /**
   * Perform the native export flow and save the result file.
   *
   * ## What this does
   * Automates the provider's export UI to download results as RIS (or
   * converts to RIS automatically). This is the most complex method.
   *
   * ## Page state expected
   * The browser is on the search results page with results loaded.
   * The user has export access (check `detectExportCapability` first).
   *
   * ## Implementation steps
   * 1. Find and click the export/download button on the results page.
   * 2. Navigate the export dialog/menu:
   *    - Select export format (prefer RIS, then BibTeX, then CSV)
   *    - Select scope (all results)
   *    - Select content fields (full record, with abstracts)
   * 3. Trigger the download. Two common patterns:
   *
   *    **Pattern A: Browser download event** (most common)
   *    ```typescript
   *    const [download] = await Promise.all([
   *      context.page.waitForEvent("download", { timeout: 60_000 }),
   *      exportButton.click(),
   *    ]);
   *    const targetPath = path.join(context.downloadsDir, download.suggestedFilename());
   *    await download.saveAs(targetPath);
   *    ```
   *
   *    **Pattern B: API response interception** (WOS pattern)
   *    ```typescript
   *    const [response] = await Promise.all([
   *      context.page.waitForResponse(r => r.url().includes("/export"), { timeout: 30_000 }),
   *      exportButton.click(),
   *    ]);
   *    const content = await response.text();
   *    fs.writeFileSync(targetPath, content, "utf-8");
   *    ```
   *
   *    **Pattern C: Async bulk export** (Scopus pattern)
   *    ```typescript
   *    // Click submit, then wait up to 180s for the download event
   *    const [download] = await Promise.all([
   *      context.page.waitForEvent("download", { timeout: 180_000 }),
   *      submitButton.click(),
   *    ]);
   *    ```
   *
   * 4. If the native format is not RIS, convert it:
   *    - NBIB → RIS: `convertNbibToRis()` from `core/ris-converter.ts`
   *    - CSV → RIS: `convertCsvToRis()` from `core/ris-converter.ts`
   * 5. If `request.outputDir` is set, copy the file there.
   * 6. Return `ExportResult` with the final file path.
   *
   * ## Playwright inspection (find export buttons)
   * ```typescript
   * const buttons = await context.page.locator("button, [role='button'], a").all();
   * for (const btn of buttons) {
   *   const text = await btn.textContent();
   *   if (/export|download|save|cite|send to/i.test(text ?? "")) {
   *     console.log(text?.trim(), await btn.evaluate(el => el.outerHTML.slice(0, 300)));
   *   }
   * }
   * ```
   *
   * ## Reference
   * - PubMed: "Send to" → "Citation manager" → download .nbib → convert to RIS
   * - WOS: "Export" → "RIS" menu item → intercept API response → save .ris
   * - IEEE: Click export → download CSV → convert to RIS
   * - Scopus: Export dropdown → RIS → config page → submit → wait for bulk download
   */
  async exportNative(context: ProviderContext, request: ExportRequest): Promise<ExportResult> {
    throw new Error("TODO: implement exportNative");
  }

  // ═══════════════════════════════════════════════════════════════════
  //  OPTIONAL: Override these base class methods if needed
  // ═══════════════════════════════════════════════════════════════════
  //
  // Uncomment and implement any of these if the default behavior
  // doesn't work for your provider. The base class defaults are
  // described in comments.

  // /**
  //  * Override if the provider needs custom navigation or post-navigation
  //  * setup after opening the advanced search page.
  //  *
  //  * Default: navigates to `descriptor.entryUrl` and calls `clearInterferingUi`.
  //  *
  //  * Override when:
  //  * - The provider needs to click a tab to show the query input (WOS)
  //  * - The page requires accepting terms before search is available
  //  * - The URL needs dynamic parameters
  //  */
  // override async openAdvancedSearch(context: ProviderContext): Promise<void> {
  //   await super.openAdvancedSearch(context);
  //   // TODO: Add provider-specific post-navigation setup
  // }

  // /**
  //  * Override if the provider has specific cookie banners, modals, or
  //  * overlays that need dismissing.
  //  *
  //  * Default: tries common dismiss buttons (cookie consent, GDPR banners).
  //  *
  //  * Override when:
  //  * - The provider uses a non-standard cookie consent (e.g., Osano on IEEE)
  //  * - There are welcome modals or tutorial overlays
  //  */
  // override async clearInterferingUi(context: ProviderContext): Promise<void> {
  //   await super.clearInterferingUi(context);
  //   // TODO: Dismiss provider-specific overlays
  // }

  // /**
  //  * Override if the query input needs special handling.
  //  *
  //  * Default: finds input via `selectors.queryInputs` and uses `fillAndVerify`.
  //  *
  //  * Override when:
  //  * - The input is a contenteditable div or CodeMirror editor
  //  * - The input requires clearing before filling
  //  * - Multiple input fields need to be filled (query builder mode)
  //  */
  // override async setCurrentQuery(context: ProviderContext, query: string): Promise<void> {
  //   // TODO: Custom query input handling
  // }

  // /**
  //  * Override if the search submission flow is non-standard.
  //  *
  //  * Default: finds button via `selectors.searchButtons`, clicks it,
  //  * waits for URL to match `submitUrlPattern`.
  //  *
  //  * Override when:
  //  * - The search button is dynamically generated or hard to find
  //  * - Submission triggers a SPA navigation (no URL change)
  //  * - The provider needs a delay or intermediate step before results load
  //  */
  // override async submitSearch(context: ProviderContext): Promise<SearchSummary> {
  //   // TODO: Custom search submission
  // }

  // /**
  //  * Override if the provider has sidebar facet filters you want to support.
  //  *
  //  * Default: generic filter extraction from DOM (may not work for all providers).
  //  *
  //  * Override when:
  //  * - The filter UI uses non-standard elements
  //  * - Filters are loaded asynchronously
  //  * - You want to expose provider-specific filter types
  //  *
  //  * IMPORTANT: If you implement this, also set `capabilities.filters: true`
  //  * in descriptor.ts.
  //  */
  // override async listFilters(context: ProviderContext): Promise<FilterGroup[]> {
  //   // TODO: Custom filter extraction
  // }

  // /**
  //  * Override to implement filter application.
  //  *
  //  * Default: throws "not implemented".
  //  *
  //  * IMPORTANT: Only implement if you also implement `listFilters` and set
  //  * `capabilities.filters: true` in descriptor.ts.
  //  */
  // override async applyFilters(context: ProviderContext, input: FilterApplyRequest[]): Promise<SearchSummary> {
  //   // TODO: Click filter checkboxes, wait for results to reload
  // }

  // /**
  //  * Override to implement result selection by checkbox.
  //  *
  //  * Default: throws "not implemented".
  //  *
  //  * IMPORTANT: Only implement if the provider has result checkboxes and
  //  * you set `capabilities.selection: true` in descriptor.ts.
  //  */
  // override async selectResultsByIndex(context: ProviderContext, indices: number[]): Promise<void> {
  //   // TODO: Click checkboxes for the specified 1-based result indices
  // }

  // /**
  //  * Override to implement clearing all selected results.
  //  *
  //  * Default: no-op.
  //  *
  //  * IMPORTANT: When unchecking checkboxes in a loop, always re-query the
  //  * `:checked` locator and target `.first()` to avoid index drift.
  //  * See ieee/adapter.ts clearSelection for the correct pattern.
  //  */
  // override async clearSelection(context: ProviderContext): Promise<void> {
  //   // TODO: Uncheck all selected result checkboxes
  // }
}
