# CLAUDE.md

This file provides AI-specific guidance for Claude Code when working with E2E tests in the storefront-next-e2e package.

> **For user-facing documentation** (getting started, commands), see [README.md](./README.md)  
> **For technical architecture** (helpers vs services, test organization), see [ARCHITECTURE.md](./ARCHITECTURE.md)

## Project Overview

**storefront-next-e2e** is the E2E testing package for Salesforce Commerce Cloud storefront built with React Router v7. It uses CodeceptJS with Playwright engine and AI-powered features for test development and maintenance.

**Stack:** CodeceptJS 3.7.5 + Playwright 1.61.1 + TypeScript 5.6.0  
**Test Runner:** Mocha  
**Package Manager:** pnpm (monorepo setup)  
**Node Version:** 24+ (managed via Volta)

---

## Storefront Context

This is E2E testing for **Salesforce Commerce Cloud storefront** built with React Router v7.

**Key Context:**

- **Environment**: All configuration is set in `.env` in the package root (copy from `.env.sample`). BASE_URL, SITE_ID, SITE_ALIAS, LOCALE, AI credentials, etc. are read from `.env`.
- **Base URL**: Configurable via BASE_URL in `.env` (default: http://localhost:5173)
- **Site ID**: Configurable via SITE_ID in `.env` (default: RefArchGlobal)
- **Url Prefix**: SITE_ALIAS and LOCALE in `.env` control the URL prefix (`/{SITE_ALIAS}/{LOCALE}/{path}`). See the **Multi-site URL Prefixing** section below.
- **Test against actual storefront**, NOT demo workbench storefront
- **Focus on commerce-specific flows**: product search, cart, checkout, user account
- **Use Scenario-Mocha style** for test structure
- **TypeScript definitions auto-generated** (no manual `pnpm def` needed)
- **Use CodeceptJS AI features exclusively** (pause(), I.askForPageObject())
- **No external MCP or vision-based tools required**

**Commerce-Specific Elements:**

- Product tiles/cards with images, titles, prices
- Search functionality in header
- Shopping cart with item count
- Add to cart buttons
- Checkout flow
- User account/login
- SFCC cookies (cc-at*, cc-nx-g*, cc-nx*, usid*)

---

## Essential Commands Reference

> **Note:** See [README.md](./README.md) for complete command documentation and examples.

**Quick Reference:**

- `pnpm e2e` - Run all tests (definitions auto-generated)
- `pnpm e2e --ai` - Run with AI features (self-healing, page object generation)
- `pnpm def` - Generate TypeScript definitions manually (optional - auto-generated before tests)
- `pnpm report` - View Allure dashboard

**TypeScript Definitions:**

- Auto-generated before each test run (no manual step needed)
- Manual generation: `pnpm def` (optional, for IDE IntelliSense)
- Skip auto-generation: `pnpm e2e --skip-def`

---

## Quick Decision Guides

### When to Create Page Objects vs Specs vs Flows

| **I need to...**                    | **Create this**              | **Example**                        |
| ----------------------------------- | ---------------------------- | ---------------------------------- |
| Interact with a new page            | **Page Object** (`.page.ts`) | `cart.page.ts`, `checkout.page.ts` |
| Write a new test case               | **Spec** (`.spec.ts`)        | `add-to-cart.spec.ts`              |
| Reuse 3+ page workflow across tests | **Flow** (`.flow.ts`)        | `checkout.flow.ts`                 |
| Simple single-page action           | **Page Object method**       | `cartPage.removeItem()`            |

> **Note:** See [ARCHITECTURE.md](./ARCHITECTURE.md) for detailed patterns and examples.

### When to Update Helpers vs Services

| **Scenario**                               | **Update**      | **File**                        |
| ------------------------------------------ | --------------- | ------------------------------- |
| Add test execution time tracking to Allure | **Helper**      | `allure.helper.cjs`             |
| Add `--env=staging` mode                   | **Service**     | `config-provider.ts`            |
| Auto-screenshot on test failure            | **Helper**      | `allure.helper.cjs`             |
| Start mock API server before tests         | **Service**     | Create `mock-server-manager.ts` |
| New checkout page interactions             | **Page Object** | `checkout.page.ts`              |

> **Note:** See [ARCHITECTURE.md](./ARCHITECTURE.md) for helpers vs services architecture details.

---

## AI-Powered Features

### 1. Interactive Console with pause()

**Usage:**

```typescript
Scenario('Interactive test development', async () => {
    await storefrontPage.navigate();
    pause(); // Opens interactive console
    // In console: describe actions in plain English
    // AI converts to CodeceptJS commands
});
```

**Console Commands:**

- `"Search for shoes and add first result to cart"`
- `"Fill checkout form with test data"`
- `"Verify cart shows 2 items"`

### 2. DOM-Driven Page Object Generation

**Usage:**

```typescript
Scenario('Generate page object', async () => {
    I.amOnPage('/product/123');
    pause();
    // In console: I.askForPageObject("productDetail")
    // AI reads runtime DOM and generates complete page object
});
```

**Benefits:**

- Reads actual runtime DOM (not screenshots)
- Generates stable, reliable locators
- Works at any point in test execution
- No external dependencies required

### 3. Self-Healing Tests

**AI self-healing is available via the `--ai` flag:**

```bash
pnpm e2e --ai
# Debug AI decisions with:
DEBUG="codeceptjs:ai" pnpm e2e --ai
```

**Features:**

- Automatic locator healing on failures
- AI analyzes DOM and suggests alternatives
- Works in CI/CD pipelines
- Healing recipes in `helpers/self-healing/recipes.ts`
- Debug logging shows AI decision-making process

### 4. AI Environment Setup

**Setup:**

1. Copy `.env.sample` to `.env`
2. Configure AI provider credentials in `.env`:

```bash
AI_PROVIDER=anthropic                         # default, can omit
ANTHROPIC_API_KEY=sk-ant-...                  # required for AI features
AI_PROVIDER_LLM_MODEL=claude-sonnet-4-6       # optional
```

---

## Multi-site URL Prefixing

The storefront supports multi-site routing where URLs are prefixed with an optional site alias and locale: `/{siteAlias}/{locale}/{path}`. The E2E tests handle this via the `buildSitePath()` utility from `src/utils/url-utils.ts`.

**All `I.amOnPage()` calls that navigate to test-authored paths must wrap the path with `buildSitePath()`.**

```typescript
import { buildSitePath } from '../utils/url-utils';

// ✅ Correct — always use buildSitePath for hardcoded paths
I.amOnPage(buildSitePath('/checkout'));
I.amOnPage(buildSitePath(`/account/orders/${orderNo}`));
I.amOnPage(buildSitePath(categoryUrl));

// ❌ Wrong — bare path will break when SITE_ALIAS or LOCALE is set
I.amOnPage('/checkout');
```

**Exception — DOM-extracted URLs:** URLs grabbed from the rendered page (e.g. via `I.grabAttributeFrom(locator, 'href')`) already contain the url prefix because the storefront renders them that way. Do **not** apply `buildSitePath()` to these or they will be double-prefixed.

```typescript
// ✅ Correct — productUrl is from the DOM, already has the prefix
const productUrl = await productListPage.getFirstProductUrl();
I.amOnPage(productUrl);

// ❌ Wrong — double-prefixes a DOM-extracted URL
I.amOnPage(buildSitePath(productUrl));
```

**Configuration:** Set `SITE_ALIAS` and `LOCALE` in `.env` (both optional, blank by default). When neither is set, `buildSitePath()` returns the path unchanged.

---

## Writing Tests

**Developers use CLAUDE for all test authoring.** This section provides complete guidance on test structure, patterns, and best practices.

### Test Structure (Scenario-Mocha Style)

```typescript
/**
 * Copyright 2026 Salesforce, Inc.
 * ...Apache License header...
 */

Feature('Storefront Core Tests').tag('@core');

const { I, storefrontPage } = inject();
import { expect } from 'chai';

Scenario('Homepage loads and sets SFCC cookies', async () => {
    storefrontPage.navigate();
    storefrontPage.validateTitle('NextGen PWA Kit Store');
    storefrontPage.validatePageLoaded();
    await storefrontPage.validateSFCCCookies();
})
    .tag('@homepage')
    .tag('@cookies');

Scenario('Homepage displays product tiles', async () => {
    storefrontPage.navigate();
    storefrontPage.validatePageLoaded();

    const productCount = await storefrontPage.getProductCount();
    expect(productCount, 'Should have product tiles on homepage').to.be.greaterThan(0);
})
    .tag('@homepage')
    .tag('@products');

export {}; // Required at end of file
```

**Requirements:**

- Use `Scenario()` for individual test cases
- Add `.tag()` for organization and filtering
- Import page objects via `inject()`
- Import Chai `expect` for value assertions: `import { expect } from 'chai';`
- Use Chai `expect()` assertions for validating retrieved values (counts, text, URLs, etc.)
- Use CodeceptJS page object methods for UI interactions and element visibility checks
- **Never call `I.*` methods directly inside a Scenario** — all `I.*` usage must live in page objects or flows. Scenarios should only call page object / flow methods and Chai assertions.
- Add `export {};` at end of spec files

### Page Object Pattern

Page objects encapsulate UI interactions for reusable test code:

```typescript
const { I } = inject();
import { buildSitePath } from '../utils/url-utils';

class StorefrontPage {
    locators = {
        searchInput: locate('input[data-testid*="search"]').as('Search Input'),
        productTiles: locate('[data-testid*="product-tile"]').as('Product Tiles'),
        cartIcon: locate('[data-testid*="cart"]').as('Cart Icon'),
        addToCartButton: locate('[data-testid*="add-to-cart"]').as('Add to Cart Button'),
    };

    navigate(url?: string): void {
        const baseUrl = url || process.env.BASE_URL || 'http://localhost:5173';
        I.amOnPage(new URL(buildSitePath('/'), baseUrl).toString());
    }

    searchForProduct(productName: string): void {
        I.fillField(this.locators.searchInput, productName);
        I.pressKey('Enter');
    }

    async getProductCount(): Promise<number> {
        return await I.grabNumberOfVisibleElements(this.locators.productTiles);
    }

    clickFirstProduct(): void {
        I.click(this.locators.productTiles.first());
    }
}

export = new StorefrontPage(); // Singleton pattern
```

**Requirements:**

- All locators in `locators` object with semantic `.as('Name')`
- Use `data-testid` attributes when available
- Export as singleton: `export = new ClassName();` (TypeScript export assignment, required for CodeceptJS `inject()`)
- File naming: kebab-case (e.g., `storefront.page.ts`)
- No assertions in page objects (only interactions)

### Test Organization

Tests are organized by feature and device type:

```
src/specs/
├── core/                    # Core/OOTB functionality tests
│   ├── homepage.spec.ts      # Runs on BOTH desktop and mobile
│   ├── desktop/             # Desktop-only tests
│   │   └── navigation.spec.ts
│   └── mobile/              # Mobile-only tests
│       └── navigation.spec.ts
└── <feature>/               # Feature-specific tests
    ├── *.spec.ts            # Shared tests (both devices)
    ├── desktop/             # Desktop-only tests
    └── mobile/              # Mobile-only tests
```

> **Note:** See [ARCHITECTURE.md](./ARCHITECTURE.md) for detailed test organization patterns (Page Objects, Specs, Flows).

### Tag Filtering Strategies

Tests can be tagged for easy filtering and organization:

#### Test Tiers (`@smoke` vs `@core`)

Two tiers gate three pipelines. Every `@smoke` scenario also carries `@core` (via the Feature-level tag) — so `@smoke ⊂ @core`.

| Tier | Tag | What it covers | Wall clock |
|---|---|---|---|
| Smoke | `@smoke` | Critical revenue/auth paths (homepage load, PLP→PDP→cart, login, checkout place-order) | ~6 min |
| Core | `@core` | OOTB regression set | ~27 min |

**Where each tier runs:**

| Pipeline | Trigger | Grep | Behavior on failure |
|---|---|---|---|
| Pre-merge gate (`e2e-core-pr.yml`) | every PR + `merge_group` | pass 1: `@smoke`, then pass 2: `(?=.*@core)(?!.*@smoke)` on the same pool target | pass 1 fails → pass 2 skipped (fast-fail); merge blocked until both pass. Bypass with the [`skip-e2e` label](#skip-e2e-pr-label-escape-hatch). |
| Post-merge canary (`e2e-postmerge.yml`) | push to `main` / `release-*` | `@smoke` | retries once on a fresh pool target; if both attempts fail → Slack page |
| Nightly (`e2e-core-nightly.yml`) | cron | `@core` | full run on a dedicated target (no pool pressure); flake baseline + drift detector |

**Rules for tagging:**

- **Add `@smoke` sparingly.** A scenario earns `@smoke` only if it gates revenue or auth. Anything else stays in `@core`. Keep the smoke set under a ~6 min budget at `workers: 2`.
- **`@smoke` scenarios must also stay in `@core`.** All `@smoke` scenarios live inside `@core` Features and pick up `@core` from the Feature-level tag. Don't drop the Feature tag.
- **If a `@smoke` scenario flakes**, treat it as P0 — either fix it or downgrade it to `@core`. Don't ship a flaky smoke gate.

#### `skip-e2e` PR label (escape hatch)

Add the `skip-e2e` label to a PR to bypass the E2E gate entirely. The `check_skip` job in `e2e-core-pr.yml` forwards the result as `bypass: true` to `e2e-runner.yml`, which causes the inner `run_e2e_tests` job to be skipped at the job level. GitHub still reports a "Skipped" status for `call_runner / run_e2e_tests`, and branch protection treats that as success.

**Use sparingly.** Appropriate cases:

- Changelog-only or docs-only PRs that don't touch product code.
- Hot-revert PRs where the revert itself was already covered by the original PR's gate and the priority is restoring `main`.
- Infra-only PRs that demonstrably can't affect E2E behavior (e.g., editing GitHub Actions workflows that aren't on the test path).

**Inappropriate cases.** Anything that touches storefront source, SDK runtime, route loaders/actions, page objects, or test infrastructure. If you're unsure, run the gate — a 27 min run is cheaper than a broken `main` and a Slack page from the post-merge canary.

**The label only bypasses `pull_request` runs, not the merge queue.** When a PR is added to the merge queue, GitHub fires a `merge_group` event against a synthetic merge commit (your PR + current `main`), and `e2e-core-pr.yml` re-runs against that ref. PR labels aren't attached to the merge commit, so `check_skip` always evaluates to `skip=false` on `merge_group` and the full ~27 min suite runs. This is intentional — the merge queue exists to catch semantic conflicts that can't be detected at the PR level — but expect the wait when queueing a labelled PR.

#### Basic Tag Usage

```typescript
Scenario('Homepage loads correctly', async () => {
    // Test implementation
})
    .tag('@homepage')
    .tag('@core')
    .tag('@smoke');
```

#### Filtering by Tags

```bash
# Single tag
pnpm e2e --grep "@homepage"

# Multiple tags - OR logic (match ANY)
pnpm e2e --grep "@homepage|@products"
pnpm e2e --grep "(@core|@smoke)"

# Multiple tags - AND logic (match ALL)
pnpm e2e --grep "(?=.*@homepage)(?=.*@products)"
pnpm e2e --grep "(?=.*@core)(?=.*@smoke)"

# Exclude tags - NOT logic
pnpm e2e --grep "@core(?!.*@slow)"        # @core but not @slow
pnpm e2e --grep "(?!.*@flaky)@smoke"      # @smoke but not @flaky

# Complex combinations
pnpm e2e --grep "@homepage|(@products.*@core)"  # @homepage OR (@products AND @core)
```

#### Common Tag Categories

- **Feature**: `@homepage`, `@checkout`, `@search`, `@products`, `@multi-currency`
- **Test Type**: `@smoke`, `@regression`, `@integration`, `@e2e`
- **Priority**: `@critical`, `@high`, `@medium`, `@low`
- **Device**: `@desktop`, `@mobile`, `@tablet`
- **Status**: `@stable`, `@flaky`, `@slow`, `@wip`
- **Environment**: `@local`, `@staging`, `@prod`

#### Tag Best Practices

1. **Use descriptive tags**: `@user-registration` vs `@reg`
2. **Consistent naming**: Use kebab-case for multi-word tags
3. **Hierarchical tagging**: `@checkout-guest`, `@checkout-registered`
4. **Combine strategically**: Mix feature, type, and priority tags

---

## Coding Standards

### Assertion Patterns

**Use Chai `expect()` for value assertions:**

```typescript
import { expect } from 'chai';

const productCount = await storefrontPage.getProductCount();
expect(productCount, 'Should have product tiles on homepage').to.be.greaterThan(0);

const currentUrl = await I.grabCurrentUrl();
expect(currentUrl, 'Should navigate to PDP page').to.include('/product/');

const isVisible = await productPage.isProductTitleVisible();
expect(isVisible, 'Product title should be visible').to.be.true;

const quantity = await productPage.getQuantity();
expect(quantity, 'Default quantity should be 1').to.equal('1');
```

**Use CodeceptJS page object methods for UI interactions:**

```typescript
// Page objects handle UI assertions internally using CodeceptJS I methods
storefrontPage.validateTitle('NextGen PWA Kit Store'); // Uses I.seeInTitle()
storefrontPage.validatePageLoaded(); // Uses I.seeElement(), I.dontSeeElement()
await storefrontPage.validateSFCCCookies(); // Storefront-domain scoped
```

**DO NOT use manual `throw new Error()` for assertions:**

```typescript
// ❌ Don't do this
if (productCount === 0) {
    throw new Error('Expected to see product tiles');
}

// ✅ Do this instead
expect(productCount, 'Should have product tiles on homepage').to.be.greaterThan(0);
```

### Wait Strategy

**Page object methods must NEVER contain wait calls.** Playwright auto-waits before every interaction (`click`, `fillField`, `seeElement`, etc.), so explicit waits are redundant inside page objects and create racy, slow tests.

Waiting belongs in the **test/flow layer** using CodeceptJS built-ins.

**Page objects — actions only, no waits:**

```typescript
// ✅ Correct — just perform the action; Playwright handles readiness
clickSignIn(): void {
    I.click(this.locators.signInButton);
}

navigate(url: string): void {
    I.amOnPage(buildSitePath(url));
}

// ❌ Wrong — do not add waits after actions in page objects
clickSignIn(): void {
    I.click(this.locators.signInButton);
    I.waitForURL('/account', 10);   // ❌ remove
    I.wait(2);                      // ❌ remove
}
```

**Test/flow layer — assert state after actions:**

```typescript
// ✅ Correct — verify expected state via page object methods or Chai assertions
Scenario('Login succeeds', async () => {
    loginPage.fillLoginForm({ email, password });
    loginPage.clickSignIn();
    accountPage.validatePageLoaded();
});
```

> **Rule:** Scenarios must never call `I.*` methods directly. All browser interactions (`I.click`, `I.amOnPage`, `I.seeElement`, etc.) belong inside page objects or flows. Scenarios orchestrate page objects and use Chai `expect()` for value assertions.

**Optional elements (e.g. consent banners) — use `grabNumberOfVisibleElements`, not wait:**

```typescript
// ✅ Correct — check visibility without waiting
async handleTrackingConsent(accept: boolean = true): Promise<void> {
    const visible = await I.grabNumberOfVisibleElements(this.locators.trackingConsentBanner);
    if (visible === 0) return;
    I.click(accept ? this.locators.acceptButton : this.locators.declineButton);
}

// ❌ Wrong — do not use waitForElement to probe optional elements
async handleTrackingConsent(accept: boolean = true): Promise<void> {
    try {
        I.waitForElement(this.locators.trackingConsentBanner, 5); // ❌ remove
        I.click(this.locators.acceptButton);
        I.waitForInvisible(this.locators.trackingConsentBanner, 5); // ❌ remove
    } catch { /* banner didn't appear */ }
}
```

**`waitForPageLoad()` methods are forbidden** — delete them and remove all call-sites. Playwright's auto-wait makes them unnecessary.

```typescript
// ❌ Never create these
waitForPageLoad(): void {
    I.waitForElement(this.locators.productTitle, 15); // ❌
}
```

**True async polling utilities** (e.g. waiting for API-set cookies) are the only exception. Use native JS `setTimeout` rather than `I.wait()`:

```typescript
// ✅ Acceptable — polling for async side-effects, not for element readiness
await new Promise((resolve) => setTimeout(resolve, 500));
```

---

### Locator Strategy (Priority Order)

1. **data-testid attributes** (preferred)
2. **Semantic HTML attributes** (role, aria-label, etc.)
3. **CSS selectors** (stable classes, not dynamic)
4. **Text content** (for buttons, links)

**Examples:**

```typescript
// ✅ Preferred
locate('input[data-testid="search-input"]').as('Search Input');
locate('button[data-testid="add-to-cart"]').as('Add to Cart Button');

// ✅ Acceptable fallbacks
locate('input[role="searchbox"]').as('Search Input');
locate('button[aria-label="Add to cart"]').as('Add to Cart Button');
locate('button:has-text("Add to Cart")').as('Add to Cart Button');

// ❌ Avoid
locate('.css-1234567').as('Dynamic Class'); // Brittle
locate('#component-123').as('Dynamic ID'); // Brittle
```

---

## Commerce-Specific Test Patterns

### Authentication setup: API vs UI login

Two flows are available for logging in a registered shopper:

| Flow | When to use | What it does |
|---|---|---|
| `loginFlow.execute()` | Tests that **assert on login behavior** — the UI form, cookie expiry, token rotation, the storefront's auth-middleware contract | Fills the `/login` form and submits; the storefront sets cookies via `Set-Cookie` headers with their real production attributes (expiry, etc.). |
| `apiLoginFlow.execute(credentials)` | Tests where **login is just setup** — checkout, account, wishlist, profile-edit, etc. | Calls SCAPI SLAS directly and injects session cookies into the Playwright browser context. Faster (skips the form + redirect), but cookies are session-scoped (no `expires`) and the storefront's auth middleware never runs. |

**Rule of thumb:** if your scenario's assertions don't care *how* the user got logged in — just that they're logged in — use `apiLoginFlow`. If your assertions inspect cookie attributes, the auth-middleware's cookie transitions, or anything that depends on real `Set-Cookie` semantics, use `loginFlow`.

The 3 specs tagged `@login` always use `loginFlow` because they verify the UI form itself.

### SFCC Cookie Validation

**Always scope cookie assertions to the storefront domain.** The storefront may use proxies that reach external APIs; those APIs can set cookies that would cause incorrect assert results if not filtered out.

Use the page object methods, which use Playwright `context.cookies(storefrontOrigin)` to scope cookie checks:

```typescript
// ✅ Correct — uses storefront-scoped cookies (storefront.page.ts)
await storefrontPage.validateSFCCCookies();

// For custom cookie checks: use I.usePlaywrightTo with context.cookies(storefrontOrigin)
// to filter cookies by the storefront domain (from BASE_URL).

// ❌ Avoid — I.seeCookie / I.grabCookie may include cookies from proxy/external domains
I.seeCookie('cc-at_SiteId'); // Could match cookie from wrong domain
```

### Product Search Flow

```typescript
Scenario('Product search returns results', async () => {
    await storefrontPage.navigate();
    storefrontPage.searchForProduct('shoes');

    const productCount = await storefrontPage.getProductCount();
    if (productCount === 0) {
        throw new Error('Expected to see product results, but found none');
    }
})
    .tag('@search')
    .tag('@products');
```

### Add to Cart Flow

```typescript
Scenario('Add product to cart', async () => {
    await storefrontPage.navigate();
    storefrontPage.searchForProduct('shoes');
    storefrontPage.clickFirstProduct();

    await productPage.selectSize('M');
    productPage.addToCart();

    cartPage.validateItemAdded();
    cartPage.validateCartCount(1);
})
    .tag('@cart')
    .tag('@purchase-flow');
```

### Multi-Currency Checkout

Tests that validate checkout across different locales/currencies use `addToCartFlow.executeAndNavigateToCheckout()` with a `sitePrefix` option, because they intentionally switch between locale contexts within a single test run and `buildSitePath()` reads from fixed env vars.

```typescript
import { TEST_LOCALE_CURRENCIES, TEST_PAYMENT, TEST_PRODUCT_CATEGORIES, generateTestEmail } from '../../test-data/checkout.data';

for (const localeCurrency of TEST_LOCALE_CURRENCIES) {
    Scenario(`Checkout in ${localeCurrency.label}`, async () => {
        const sitePrefix = `/${localeCurrency.siteAlias}/${localeCurrency.locale}`;

        const productInfo = await addToCartFlow.executeAndNavigateToCheckout(
            TEST_PRODUCT_CATEGORIES.MENS_JACKETS, 3, { sitePrefix }
        );

        checkoutPage.validatePageLoaded();
        const summaryText = await checkoutPage.getOrderSummaryText();
        expect(summaryText).to.match(localeCurrency.currencyPattern);

        const orderNumber = await checkoutPage.completeCheckout({
            email: generateTestEmail(`multi-currency-${localeCurrency.label.toLowerCase()}`),
            shippingAddress: localeCurrency.shippingAddress,
            payment: TEST_PAYMENT,
        });
        expect(orderNumber).to.match(/^\d+$/);
    })
        .tag(`@${localeCurrency.label.toLowerCase()}`)
        .tag('@multi-currency');
}
```

**Key rules for multi-currency tests:**
- Pass `sitePrefix` to `addToCartFlow` — `buildSitePath()` reads from env vars which are fixed
- Never hardcode a single currency symbol (like `$`) — use `currencyPattern` from `TEST_LOCALE_CURRENCIES`
- Each locale entry includes a locale-appropriate shipping address
- To add a new currency, add an entry to `TEST_LOCALE_CURRENCIES` in `checkout.data.ts`

---

## Best Practices

### DO:

- ✅ TypeScript definitions auto-generated (no manual steps needed)
- ✅ Use AI features (`--ai` flag) for page object generation and interactive development
- ✅ Focus on commerce-specific test scenarios
- ✅ Use semantic locators with `.as('Name')`
- ✅ Keep tests parallelizable (no shared state)
- ✅ Use environment variables for configuration
- ✅ Tag tests for easy filtering
- ✅ Use stable locators: Prefer `data-testid` attributes, then semantic locators, then CSS selectors
- ✅ Write meaningful test names: Describe what the test validates
- ✅ Keep tests independent: Each test should be self-contained
- ✅ Use page objects: Encapsulate **all** `I.*` calls in page objects or flows — scenarios only call page object / flow methods
- ✅ Use Chai `expect()` assertions for validating retrieved values (counts, text, URLs, etc.)
- ✅ Leverage AI: Use `pause()` and `I.askForPageObject()` for faster development
- ✅ Reference README.md for commands and setup
- ✅ Reference ARCHITECTURE.md for technical details

### DON'T:

- ❌ Call `I.*` methods directly in Scenarios — wrap them in page objects or flows
- ❌ Create page objects manually (use AI generation)
- ❌ Use dynamic CSS classes or IDs as locators
- ❌ Add assertions to page objects (keep them in tests)
- ❌ Use manual `throw new Error()` for assertions (use Chai `expect()` instead)
- ❌ Test against demo/workbench storefronts
- ❌ Commit sensitive data to `.env` (it's gitignored)
- ❌ Use external MCP or vision-based tools
- ❌ Duplicate command documentation (reference README.md instead)
- ❌ Duplicate architecture details (reference ARCHITECTURE.md instead)

---

## Troubleshooting

### Common Issues

**TypeScript errors about missing page objects:**

```bash
# Solution: Run tests (auto-generates definitions) or manually generate
pnpm e2e --grep "@any-test"  # Auto-generates definitions
pnpm def                     # Manual generation
```

**Tests fail with "Element not found":**

```bash
# Solution: Enable AI self-healing
pnpm e2e --ai --grep "@your-test"
```

**Local dev server not starting:**

```bash
# Check environment variables
cat .env
# Verify storefront app path
ls ..
```

**AI features not working:**

```bash
# Check AI configuration in .env
# Ensure ANTHROPIC_API_KEY is set (see .env.sample for reference)
```

---

## References

- **User Documentation**: [README.md](./README.md) - Getting started, commands, troubleshooting
- **Architecture**: [ARCHITECTURE.md](./ARCHITECTURE.md) - Technical deep-dive, helpers vs services, test organization
- **CodeceptJS API**: https://codecept.io/
- **Playwright Helper**: https://codecept.io/helpers/Playwright/
- **Storefront Architecture**: See `../CLAUDE.md`
- **Commerce Cloud**: Salesforce Commerce Cloud documentation
- **AI Features**: Built-in CodeceptJS AI capabilities
