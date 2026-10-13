---
name: generate-storefront-e2e-test
description: Generate E2E tests for Salesforce Commerce Cloud storefront using CodeceptJS with AI-powered features. Specializes in commerce-specific test patterns, page objects, and interactive development workflows.
---

# Generate Storefront E2E Test

Systematically create end-to-end tests for Salesforce Commerce Cloud storefront using CodeceptJS Framework with AI-powered features. This skill focuses on commerce-specific test patterns and leverages DOM-driven AI capabilities.

## Prerequisites

Before starting, ensure you understand the storefront context:

```bash
view CLAUDE.md # in current package directory
```

## Workflow

### 1. Define Test Requirements

**Understand the commerce scenario**:

- Identify storefront functionality to test (search, cart, checkout, etc.)
- List specific test cases for commerce flows
- **IMPORTANT**: Always ask clarifying questions about the test scope
- **IMPORTANT**: Focus on actual storefront, NOT demo/workbench environments

**Example questions**:
- "Should this test cover both desktop and mobile views?"
- "Do you want to test guest checkout or authenticated user flow?"
- "Should we validate SFCC cookies and session management?"
- "Which product categories or search terms should we use?"

### 1.5. Audit Existing Unit Tests and Storybook Stories

**Review existing tests before writing E2E scenarios** to understand what's already covered and ensure E2E tests focus on integration value.

**Key principle**: E2E tests should validate flows that require real authentication, routing, cross-component interactions, or live API data — not duplicate component-isolated unit tests or Storybook `play` functions.

### 2. Verify Storefront Context

**Check storefront implementation** to understand:

**Environment Configuration**:
- Verify `.env` exists (gitignored, maintained by developers/CI)
- If `.env` doesn't exist, copy from `.env.sample`
- Confirm BASE_URL points to actual storefront (not demo)
- Check SITE_ID configuration for cookie validation

**Existing Page Objects**:
```bash
view src/pages/**/*.page.ts
```
- Look for reusable page objects (storefrontPage, cartPage, etc.)
- Identify if new page objects are needed

**Existing Tests**:
```bash
view src/specs/**/*.spec.ts
```
- Review existing test patterns and tags
- Ensure no duplication of test scenarios

### 3. Get User Approval

**Present test plan** to user:
- List specific test scenarios you'll create
- Explain commerce flows to be covered
- Confirm AI features to be demonstrated (pause(), I.askForPageObject())
- Specify tags and organization strategy

**Wait for approval** before proceeding to implementation.

### 4. Implement Tests with AI Features

**Create tests using Scenario-Mocha style**:

```typescript
Feature('Storefront Commerce Tests').tag('@commerce');

const { I, storefrontPage, cartPage } = inject();
import { expect } from 'chai';

Scenario('Search and add product to cart', async () => {
    storefrontPage.navigate();
    storefrontPage.searchForProduct('shoes');
    storefrontPage.clickFirstProduct();
    
    // Example of interactive AI development
    // pause(); // Uncomment to try: "Add product to cart and verify"
    
    cartPage.addToCart();
    cartPage.validateItemAdded();
}).tag('@search').tag('@cart');

export {};
```

**Key Requirements**:
- Use `Feature()` and `Scenario()` structure
- Add meaningful tags for filtering
- Include `export {};` at end
- Import page objects via `inject()`
- Import Chai `expect` for value assertions: `import { expect } from 'chai';`
- Use Chai `expect()` assertions for validating retrieved values (counts, text, URLs, etc.)
- Use CodeceptJS page object methods for UI interactions
- Focus on commerce-specific flows
- **CRITICAL**: Never call `I.*` methods directly inside a Scenario — all `I.*` usage (`I.click`, `I.amOnPage`, `I.seeElement`, etc.) must live in page objects or flows. Scenarios only call page object / flow methods and Chai assertions.
- **CRITICAL**: Each scenario must be independent — create necessary test data within the scenario, never depend on other scenarios running first or in specific order
- **CRITICAL**: Wrap all test-authored paths in `buildSitePath()` before passing to `I.amOnPage()` — import from `../utils/url-utils` (or `../../utils/url-utils` from specs). Do NOT apply `buildSitePath()` to URLs extracted from the page DOM (they already contain the url prefix).

### 5. Generate Page Objects with AI

**Use AI-powered page object generation**:

```typescript
import { buildSitePath } from '../../utils/url-utils';

Scenario('Generate product page object', async () => {
    I.amOnPage(buildSitePath('/p/sample-product'));
    pause(); 
    // In console: I.askForPageObject("productDetail")
    // AI reads runtime DOM and generates complete page object
}).tag('@page-object-generation');
```

> **Multi-site note:** All `I.amOnPage()` calls with test-authored paths must use `buildSitePath()` to prepend the optional `/{siteAlias}/{locale}` prefix. See `CLAUDE.md` "Multi-site URL Prefixing" for details.

**Locator Strategy**:

Playwright's recommended priority is user-facing attributes first, `data-testid` last:

1. `getByRole` / `[role]` + accessible name — closest to how users and screen readers perceive the page
2. `getByLabel` / associated `<label>` — preferred for form fields
3. `getByText` / `.withText()` — visible text content
4. `getByPlaceholder`, `getByAltText`, `getByTitle` — other user-facing attributes
5. `data-testid` — last resort; resilient but not user-facing

**Rule of thumb:** if `locate('[role="button"]').withText('Add to Cart')` uniquely identifies the element, prefer it. If there are multiple matches, reach for `data-testid`.

**No good locator? Add one.** If no semantic attribute or `data-testid` exists on the element, add `data-testid` directly to the source component in the template. Don't settle for a brittle CSS class or positional selector — a two-minute source edit produces a stable, self-documenting locator.

```tsx
// ✅ Add data-testid to the source component
<button data-testid="add-to-cart-button" onClick={handleAddToCart}>
    Add to Cart
</button>

// Then reference it in the page object
addToCartButton: locate('[data-testid="add-to-cart-button"]').as('Add to Cart Button'),
```

**⚠️ Avoid UI-Only Classes:**

**NEVER** use styling classes (Tailwind utilities like `text-muted-foreground`, `text-destructive`, `bg-*`, `flex`, etc.) as locators — they're non-semantic and match multiple elements.

```typescript
// ❌ Bad: UI-only classes
locate('p.text-muted-foreground').as('Subtitle')
locate('.text-destructive').as('Error')

// ✅ Better: Add semantic context or use data attributes
locate('[data-slot="card"] p.text-muted-foreground').first().as('Subtitle')
locate('[role="dialog"] .text-destructive').as('Form Error')
locate('[role="alert"]').as('Error Message')
```

**Page Object Pattern**:
```typescript
const { I } = inject();
import { buildSitePath } from '../utils/url-utils';

class ProductDetailPage {
    locators = {
        productTitle: locate('[data-testid*="product-title"]').as('Product Title'),
        addToCartButton: locate('[data-testid*="add-to-cart"]').as('Add to Cart'),
        priceDisplay: locate('[data-testid*="price"]').as('Price'),
        sizeSelector: locate('[data-testid*="size"]').as('Size Selector'),
    };

    navigate(productSlug: string): void {
        I.amOnPage(buildSitePath(`/p/${productSlug}`));
    }

    async selectSize(size: string): Promise<void> {
        I.click(this.locators.sizeSelector);
        I.click(`option:has-text("${size}")`);
    }

    addToCart(): void {
        I.click(this.locators.addToCartButton);
        I.waitForText('Added to cart', 10);
    }
}

module.exports = new ProductDetailPage();
```

**After creating page object**:
1. **Register in `src/pages/index.ts`** → Add entry to `pageObjects` object (or `src/flows/index.ts` for flows)
2. **Update `helpers/self-healing/recipes.ts`** → Add healing recipes for each locator (see step 7.5)

See **step 6** below for full registration details and examples.

### 6. Register Page Objects and Flows

**IMPORTANT**: All page objects and flows must be registered in their respective index files to be available via `inject()`.

#### Registry System Architecture

The project uses a centralized registry system to keep `codecept.conf.cjs` clean and maintainable:

**Page Objects Registry** (`src/pages/index.ts`):
```typescript
export const pageObjects = {
    storefrontPage: './src/pages/storefront.page.ts',
    cartPage: './src/pages/cart.page.ts',
    megaMenuPage: './src/pages/mega-menu.page.ts',
    productListPage: './src/pages/product-list.page.ts',
    productDetailPage: './src/pages/product-detail.page.ts',
};
```

**Flows Registry** (`src/flows/index.ts`):
```typescript
export const flows = {
    addToCartFlow: './src/flows/add-to-cart.flow.ts',
    checkoutFlow: './src/flows/checkout.flow.ts',
};
```

**How it works**:
- `codecept.conf.cjs` imports both registries: `const { pageObjects } = require('./src/pages/index.ts');`
- Config spreads them into `include`: `include: { ...pageObjects, ...flows }`
- All registered objects are available via `inject()` in tests
- **No need to modify** `codecept.conf.cjs` when adding new page objects/flows

**When to register**:
- ✅ **Always** register page objects in `src/pages/index.ts`
- ✅ **Always** register flows in `src/flows/index.ts`
- ❌ **Never** add them directly to `codecept.conf.cjs`

**Benefits**:
- Clean separation of concerns
- Easy to find and manage all page objects/flows
- No mixed imports in config file
- Scales well as project grows

### 7. Register TypeScript Definitions

**AUTOMATIC**: TypeScript definitions are now auto-generated before each test run.

```bash
# Definitions auto-generated when running tests
pnpm e2e --grep "@your-test"

# Manual generation (optional)
pnpm def
```

The `steps.d.ts` file is automatically updated with new page object registrations.

### 7.5. Update Self-Healing Recipes

**REQUIRED**: When creating page objects, adding new locators, or modifying existing locator selectors, always update `helpers/self-healing/recipes.ts` to keep healing recipes in sync.

**Purpose**: Healing recipes provide fallback selectors for AI self-healing when primary locators break. They help the AI understand context and suggest alternative selectors.

**Process**:
1. **Extract locators** from the new/updated page object
2. **Create a `HealingRecipe`** for each important locator:
   ```typescript
   export const newLocatorRecipe: HealingRecipe = {
       name: 'locatorName', // Match the page object locator name
       description: 'Human-readable description of the element',
       selectors: [
           'primary-selector', // From page object locators
           'semantic-selector', // Semantic HTML fallback
           '[aria-label*="text" i]', // Accessibility fallback
           'location-based-selector', // Context-aware selector
       ],
       context: 'Where the element appears and its purpose',
       fallbackStrategy: 'What to look for if primary selector fails',
   };
   ```
3. **Add to `healingRecipes` array**:
   ```typescript
   export const healingRecipes: HealingRecipe[] = [
       // ... existing recipes
       newLocatorRecipe,
   ];
   ```

**Recipe Pattern**:
- **Primary selector**: Exact selector from page object (highest priority)
- **Semantic selectors**: HTML element types, ARIA roles, semantic attributes
- **Context selectors**: Location-based (e.g., `header input`, `footer a`)
- **Accessibility selectors**: `aria-label`, `role`, `placeholder` attributes
- **Fallback strategy**: Human-readable guidance for AI when all selectors fail

**Example** (from `storefront.page.ts`):
```typescript
// Page object locator:
searchInput: locate('input[data-testid*="search"]').as('Search Input'),

// Corresponding recipe:
export const searchInputRecipe: HealingRecipe = {
    name: 'searchInput',
    description: 'Search input field in storefront header',
    selectors: [
        'input[data-testid*="search"]', // Primary from page object
        'input[type="search"]', // Semantic HTML
        'input[placeholder*="search" i]', // Placeholder text
        'input[aria-label*="search" i]', // Accessibility label
        'header input[type="text"]', // Location + type
        '[role="searchbox"]', // ARIA role
    ],
    context: 'Located in storefront header, used for product search',
    fallbackStrategy: 'Look for input field in header navigation area',
};
```

**When to update**:
- ✅ Creating a new page object → Add recipes for all locators
- ✅ Adding new locators to existing page object → Add recipes for new locators
- ✅ **Modifying existing locator selectors → Update corresponding recipe immediately**
- ❌ Don't create recipes for temporary/test-specific locators

**File location**: `helpers/self-healing/recipes.ts`

### 8. Assertion Patterns

**CRITICAL**: Always use Chai `expect()` assertions for value validation, NOT manual `throw new Error()`.

**Import Chai in all test files**:
```typescript
import { expect } from 'chai';
const { I, storefrontPage } = inject();
```

**Use Chai `expect()` for retrieved values**:
```typescript
// ✅ Correct: Use Chai expect for counts, text, URLs
const productCount = await storefrontPage.getProductCount();
expect(productCount, 'Should have product tiles on homepage').to.be.greaterThan(0);

const currentUrl = await I.grabCurrentUrl();
expect(currentUrl, 'Should navigate to PDP page').to.include('/p/');

const isVisible = await productPage.isProductTitleVisible();
expect(isVisible, 'Product title should be visible').to.be.true;

const quantity = await productPage.getQuantity();
expect(quantity, 'Default quantity should be 1').to.equal('1');
```

**Use CodeceptJS page object methods for UI interactions**:
```typescript
// ✅ Correct: Page objects handle UI assertions internally
storefrontPage.validateTitle('NextGen PWA Kit Store');  // Uses I.seeInTitle()
storefrontPage.validatePageLoaded();                     // Uses I.seeElement()
await storefrontPage.validateSFCCCookies();               // Storefront-domain scoped
```

**DO NOT use manual error throwing**:
```typescript
// ❌ WRONG: Don't use manual throw new Error()
if (productCount === 0) {
    throw new Error('Expected to see product tiles');
}

// ✅ CORRECT: Use Chai expect instead
expect(productCount, 'Should have product tiles on homepage').to.be.greaterThan(0);
```

### 9. Commerce-Specific Test Patterns

**SFCC Cookie Validation**:
```typescript
Scenario('Validate SFCC session cookies', async () => {
    storefrontPage.navigate();
    await storefrontPage.validateSFCCCookies();
}).tag('@cookies').tag('@session');
```

**Product Search Flow**:
```typescript
Scenario('Product search returns relevant results', async () => {
    storefrontPage.navigate();
    storefrontPage.searchForProduct('running shoes');
    
    const productCount = await storefrontPage.getProductCount();
    expect(productCount, 'Should have search results for "running shoes"').to.be.greaterThan(0);
}).tag('@search').tag('@products');
```

**Shopping Cart Operations**:
```typescript
Scenario('Add multiple products to cart', async () => {
    storefrontPage.navigate();
    
    // Add first product
    storefrontPage.searchForProduct('shirt');
    storefrontPage.clickFirstProduct();
    await productPage.selectSize('M');
    productPage.addToCart();
    
    // Navigate back and add second product
    storefrontPage.goBackToResults();
    storefrontPage.clickProductAtIndex(1);
    await productPage.selectSize('L');
    productPage.addToCart();
    
    // Verify cart
    cartPage.goToCart();
    const cartCount = await cartPage.getCartCount();
    expect(cartCount, 'Cart should contain 2 items').to.equal(2);
}).tag('@cart').tag('@multi-product');
```

> **Rule:** Scenarios must never call `I.*` methods directly. All browser interactions belong inside page objects or flows. If you need an action that doesn't exist on a page object, add a method to the appropriate page object rather than calling `I.*` inline.

### 10. Interactive Development Examples

**Include examples of AI-powered development**:

```typescript
Scenario('Interactive test development demo', async () => {
    storefrontPage.navigate();
    
    // Uncomment to try interactive AI features:
    // pause();
    
    // Try these in the pause console:
    // > "Search for winter jackets and filter by size Large"
    // > "Add the first product to cart and continue to checkout"
    // > I.askForPageObject("checkout")
    
    storefrontPage.validatePageLoaded();
}).tag('@interactive').tag('@demo');
```

### 11. Test Organization and Tags

**Use commerce-specific tags**:
- `@core` - Essential storefront functionality
- `@search` - Product search and filtering
- `@cart` - Shopping cart operations
- `@checkout` - Checkout flow
- `@products` - Product detail pages
- `@user-account` - User registration/login
- `@mobile` - Mobile-specific tests
- `@cookies` - Session and cookie validation
- `@multi-currency` - Multi-currency/locale checkout tests
- `@usd`, `@gbp`, `@eur` - Currency-specific tests

**Example test execution**:
```bash
pnpm e2e --grep "@search"              # Run search tests
pnpm e2e --ai --grep "@search"         # Run with AI self-healing
pnpm e2e --grep "(?=.*@cart)(?!.*@mobile)" # Desktop cart tests
```

### 12. Update Self-Healing Recipes

**CRITICAL**: When creating page objects, adding new locators, or modifying existing locator selectors, always update `helpers/self-healing/recipes.ts`.

**For each new or modified locator in page objects**:
1. Create a `HealingRecipe` with:
   - `name`: Matches the locator name from page object
   - `description`: Human-readable description
   - `selectors`: Array starting with primary selector, then fallbacks (semantic HTML, ARIA, context-based)
   - `context`: Where element appears and its purpose
   - `fallbackStrategy`: Guidance for AI when all selectors fail
2. Add recipe to `healingRecipes` array export

**Example**:
```typescript
// Page object: cartIcon: locate('[data-testid*="cart"]').as('Cart Icon')
export const cartIconRecipe: HealingRecipe = {
    name: 'cartIcon',
    description: 'Shopping cart icon in header navigation',
    selectors: [
        '[data-testid*="cart"]', // Primary
        'a[href*="/cart"]', // Semantic fallback
        'button[aria-label*="cart" i]', // Accessibility
        'header [class*="cart"]', // Context-based
    ],
    context: 'Located in header, shows cart item count badge',
    fallbackStrategy: 'Look for clickable element in header with cart-related attributes',
};
```

**Reference**: See existing recipes in `helpers/self-healing/recipes.ts` for patterns.

### 13. Final Checklist

Before completing, verify:

- [ ] Existing unit tests and Storybook stories audited — E2E tests add integration value beyond component-level coverage
- [ ] Tests follow Scenario-Mocha structure
- [ ] **Each scenario is independent** — can run individually, in any order, or in parallel without depending on other scenarios
- [ ] **No `I.*` calls in Scenarios** — all browser interactions are in page objects or flows
- [ ] Chai `expect()` assertions used for value validation (counts, text, URLs)
- [ ] CodeceptJS page object methods used for UI interactions
- [ ] All page objects use semantic locators with `.as('Name')` — prefer user-facing attributes (`role`, `label`, `text`) over `data-testid` where the element is unambiguous
- [ ] **All `I.amOnPage()` calls with test-authored paths use `buildSitePath()`** (DOM-extracted URLs excluded)
- [ ] **Page objects registered in `src/pages/index.ts`** (or flows in `src/flows/index.ts`)
- [ ] **Self-healing recipes updated** for all new or modified page object locators
- [ ] Commerce-specific flows are covered (search, cart, checkout, multi-currency)
- [ ] Currency assertions use locale-aware patterns (`TEST_LOCALE_CURRENCIES.currencyPattern`), never hardcoded `$`
- [ ] SFCC cookie validation is included where relevant
- [ ] Tests are tagged appropriately for filtering
- [ ] TypeScript definitions auto-generated successfully
- [ ] Interactive AI examples are included
- [ ] Tests focus on actual storefront (not demo)
- [ ] Environment variables are properly used
- [ ] `export {};` is added to spec files

### 14. Remind User to Run Tests Manually

**After generating tests, remind the user to run them manually in the terminal to verify the behaviors with their own eyes.** This is the key advantage E2E tests have over unit tests — users can watch the actual interactions happen in the browser.

**Suggested command to provide**:
```bash
pnpm e2e --grep "@your-test-tag"
```

## Commerce Test Scenarios

### Essential Storefront Tests

1. **Homepage Loading**
   - Page loads successfully
   - SFCC cookies are set
   - Product tiles are displayed

2. **Product Search**
   - Search returns relevant results
   - Filters work correctly
   - No results handling

3. **Product Detail**
   - Product information displays
   - Size/color selection works
   - Add to cart functionality

4. **Shopping Cart**
   - Items are added correctly
   - Quantity updates work
   - Remove items functionality

5. **Checkout Flow**
   - Guest checkout works
   - Form validation
   - Payment integration (if applicable)

6. **User Account**
   - Registration process
   - Login/logout
   - Account management

### Advanced Commerce Scenarios

1. **Multi-Product Workflows**
   - Add multiple items to cart
   - Cross-selling/upselling
   - Wishlist functionality

2. **Multi-Currency Checkout**
   - Place order in different currencies (USD, GBP, EUR, etc.)
   - Verify currency symbols in order summary and confirmation
   - Data-driven tests via `TEST_LOCALE_CURRENCIES` in `checkout.data.ts`
   - Use direct locale-prefixed URLs (`/{siteAlias}/{locale}/path`) instead of `buildSitePath()`

3. **Mobile Commerce**
   - Touch interactions
   - Mobile-specific UI elements
   - Responsive behavior

4. **Performance Scenarios**
   - Page load times
   - Search response times
   - Cart update performance

## AI Feature Integration

### Interactive Console Usage

```typescript
// In any test, add pause() to open interactive console
pause();

// Try these commands in the console:
// > "Navigate to the product page for running shoes"
// > "Add the product to cart and verify the cart count increases"
// > "Fill out the checkout form with test customer data"
```

### Page Object Generation

```typescript
import { buildSitePath } from '../../utils/url-utils';

// Navigate to any page and generate page object
I.amOnPage(buildSitePath('/checkout'));
pause();
// > I.askForPageObject("checkout")
// AI analyzes DOM and creates complete page object
```

### Self-Healing Tests

```bash
# Enable AI self-healing with --ai flag
pnpm e2e --ai --grep "@your-test"
# AI automatically fixes broken locators during test execution
```

This skill ensures comprehensive storefront E2E test coverage while leveraging CodeceptJS AI capabilities for efficient test development and maintenance.
