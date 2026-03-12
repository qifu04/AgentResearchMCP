# Scopus Login State Analysis

- Research date: 2026-03-12
- Method: Playwright-driven inspection of the same Scopus advanced-search page before and after manual login
- Goal: identify the most reliable signals for programmatic login-state detection in a future MCP provider adapter

## Scope

This note focuses on one narrow problem:

1. capture the anonymous pre-login state
2. capture the post-login state after manual intervention
3. compare the two states and rank candidate login-state signals

## Current Status

- Pre-login capture: completed
- Post-login capture: completed
- Diff and signal ranking: completed

## Page Under Test

- URL:
  - `https://www.scopus.com/search/form.uri?display=advanced`
- Observed page-title variants:
  - pre-login: `Scopus - advanced search` in Chinese locale UI
  - post-login: same title with an added logged-in suffix in Chinese locale
- Locale observed:
  - Chinese UI

## Artifacts

### Pre-login artifacts

- Screenshot:
  - [scopus-login-pre.png](/D:/Workspaces/1.Projects/AgentRearchMCP/docs/scopus-login-pre.png)
- Accessibility snapshot:
  - [scopus-login-pre.snapshot.md](/D:/Workspaces/1.Projects/AgentRearchMCP/docs/scopus-login-pre.snapshot.md)
- Network log:
  - [scopus-login-pre.network.txt](/D:/Workspaces/1.Projects/AgentRearchMCP/docs/scopus-login-pre.network.txt)
- Console log:
  - [scopus-login-pre.console.txt](/D:/Workspaces/1.Projects/AgentRearchMCP/docs/scopus-login-pre.console.txt)

### Post-login artifacts

- Screenshot:
  - [scopus-login-post.png](/D:/Workspaces/1.Projects/AgentRearchMCP/docs/scopus-login-post.png)
- Accessibility snapshot:
  - [scopus-login-post.snapshot.md](/D:/Workspaces/1.Projects/AgentRearchMCP/docs/scopus-login-post.snapshot.md)
- Network log:
  - [scopus-login-post.network.txt](/D:/Workspaces/1.Projects/AgentRearchMCP/docs/scopus-login-post.network.txt)
- Console log:
  - [scopus-login-post.console.txt](/D:/Workspaces/1.Projects/AgentRearchMCP/docs/scopus-login-post.console.txt)

### Post-login user-menu artifacts

- Screenshot:
  - [scopus-login-post-user-menu.png](/D:/Workspaces/1.Projects/AgentRearchMCP/docs/scopus-login-post-user-menu.png)
- Accessibility snapshot:
  - [scopus-login-post-user-menu.snapshot.md](/D:/Workspaces/1.Projects/AgentRearchMCP/docs/scopus-login-post-user-menu.snapshot.md)

## Pre-Login Observations

### Header-level anonymous cues

- A visible sign-in button existed with selector:
  - `#signin_link_move`
- A visible account-creation link existed in the top-right area
- No visible user-profile menu was present in the header

### Console-level anonymous cue

- Console emitted:
  - `None logged in user: need to login for save to work.`
- This is useful for exploration, but too brittle for a production detector

### In-page JavaScript globals

- `window.isLoggedInUser === false`
- `window.isIndividuallyAuthenticated === false`
- `window.isShibUser === false`

### `window.ScopusUser` fields

- `webUserId: 1553416`
- `firstName: ""`
- `lastName: ""`
- `email: ""`
- `isIndividual: false`
- `isSubscribed: true`
- `accessTypeAA: "ae:ANON::INST:IP"`
- `usagePathInfo` contained:
  - `SSO|ANON_IP`

Interpretation:

- this session had institutional IP access
- this session did not have a personal logged-in identity
- therefore "can use Scopus" and "is personally logged in" are separate states

### Storage

- No obvious login-related `localStorage` keys were found
- No obvious login-related `sessionStorage` keys were found

## Post-Login Observations

### Header-level logged-in cues

- The visible sign-in button disappeared:
  - `#signin_link_move` count became `0`
- The visible account-creation CTA disappeared
- A visible user-menu control appeared:
  - selector: `#user-menu`
  - visible: `true`
  - text included initials: `QZ`
- A notifications entry appeared in the top-right header

### Expanded user-menu cues

When the user menu was opened, the popover contained:

- full name:
  - `Qifu Zheng`
- email:
  - `2501112664@stu.pku.edu.cn`
- a section equivalent to `My Scopus`
- a visible logout button

These are strong visual confirmations, but they require an extra click and should not be the first-choice detector.

### In-page JavaScript globals

- `window.isLoggedInUser === true`
- `window.isIndividuallyAuthenticated === true`
- `window.isShibUser === false`

### `window.ScopusUser` fields

- `webUserId: 445288118`
- `firstName: "Qifu"`
- `lastName: "Zheng"`
- `email: "2501112664@stu.pku.edu.cn"`
- `isIndividual: true`
- `isSubscribed: true`
- `accessTypeAA: "ae:REG:SHIBBOLETH:INST:SHIBBOLETH"`
- `usagePathInfo` contained:
  - `SSO|REG_SHIBBOLETH`
- `idToken` was populated

Interpretation:

- the page now carries a personal authenticated identity
- the session remains institution-associated, but is no longer anonymous

### Storage

- No obvious login-related `localStorage` keys were found
- No obvious login-related `sessionStorage` keys were found

## Direct Diff

### Strongest field-level changes

- `window.isLoggedInUser`
  - pre-login: `false`
  - post-login: `true`
- `window.isIndividuallyAuthenticated`
  - pre-login: `false`
  - post-login: `true`
- `window.ScopusUser.isIndividual`
  - pre-login: `false`
  - post-login: `true`
- `window.ScopusUser.email`
  - pre-login: empty string
  - post-login: populated
- `window.ScopusUser.accessTypeAA`
  - pre-login: `ae:ANON::INST:IP`
  - post-login: `ae:REG:SHIBBOLETH:INST:SHIBBOLETH`
- `window.ScopusUser.usagePathInfo`
  - pre-login contained `ANON_IP`
  - post-login contained `REG_SHIBBOLETH`

### Strongest DOM-level changes

- visible `#signin_link_move`
  - pre-login: present
  - post-login: absent
- visible `#user-menu`
  - pre-login: absent
  - post-login: present

### Important caveat

Login-related popup DOM still exists after login in hidden or inactive form. That means:

- do not detect login state by searching all page text for `login`, `create account`, or similar strings
- do not assume hidden dialog content implies anonymous state
- prefer explicit globals or visible-selector checks

## Recommended Signal Ranking

Ranked from best to weakest for production use:

1. `window.isLoggedInUser`
2. `window.isIndividuallyAuthenticated`
3. `window.ScopusUser.isIndividual`
4. `window.ScopusUser.accessTypeAA`
5. visible `#user-menu`
6. absence of visible `#signin_link_move`
7. page-title logged-in suffix
8. console message patterns

## Recommended Detection Logic

### Primary detector

Use page-evaluated globals first:

```ts
async function detectScopusLoginState(page) {
  return await page.evaluate(() => {
    const user = (window as any).ScopusUser ?? null;
    return {
      isLoggedInUser: (window as any).isLoggedInUser,
      isIndividuallyAuthenticated: (window as any).isIndividuallyAuthenticated,
      isIndividual: user?.isIndividual ?? null,
      accessTypeAA: user?.accessTypeAA ?? null,
      usagePathInfo: user?.usagePathInfo ?? null,
      emailPresent: Boolean(user?.email),
      firstNamePresent: Boolean(user?.firstName),
    };
  });
}
```

Suggested interpretation:

- if `isLoggedInUser === true`, treat as logged in
- else if `isIndividuallyAuthenticated === true`, treat as logged in
- else if `ScopusUser.isIndividual === true`, treat as logged in
- else if `accessTypeAA` contains `ANON`, treat as anonymous
- else treat as unknown and fall back to DOM heuristics

### DOM fallback detector

If page globals are unavailable:

1. check whether `#user-menu` is visible
2. check whether `#signin_link_move` is visible
3. if needed, open `#user-menu` and look for a logout action

Example fallback:

```ts
async function detectScopusLoginStateFromDom(page) {
  const hasUserMenu = await page.locator('#user-menu').first().isVisible().catch(() => false);
  const hasSigninButton = await page.locator('#signin_link_move').first().isVisible().catch(() => false);

  if (hasUserMenu) return { loggedIn: true, source: 'dom-user-menu' };
  if (hasSigninButton) return { loggedIn: false, source: 'dom-signin-button' };
  return { loggedIn: null, source: 'dom-unknown' };
}
```

## Adapter Design Implications

The future provider adapter should distinguish at least three states:

1. `anonymous_no_access`
2. `anonymous_institutional_access`
3. `logged_in_personal_account`

Observed states in this session:

- pre-login:
  - `anonymous_institutional_access`
- post-login:
  - `logged_in_personal_account`

This distinction matters because some Scopus capabilities can work with institutional access alone, while account-bound actions remain gated until personal login succeeds.

## Final Conclusion

The single best unique login-state indicator observed on Scopus was:

- `window.isLoggedInUser`

The best practical backup was:

- `window.isIndividuallyAuthenticated`

The best DOM-only backup was:

- visible `#user-menu` together with absent `#signin_link_move`

The most important anti-pattern discovered was:

- do not use raw page-text search for login words, because login-related dialog content may still exist in the DOM after login.
