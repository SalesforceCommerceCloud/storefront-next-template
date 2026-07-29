/**
 * Copyright 2026 Salesforce, Inc.
 *
 * AI configuration for CodeceptJS AI features
 * Provides AI request function and prompts for:
 * - Interactive console (I.askForPageObject, I.askFor)
 * - Self-healing plugin
 * - Other AI-powered features
 *
 * Provider selection is controlled by the AI_PROVIDER environment variable
 * (default: "anthropic"). Each provider is a separate module under ./providers/.
 *
 * Environment variables:
 * - AI_PROVIDER - Provider to use (default: "anthropic")
 * - AI_PROVIDER_LLM_MODEL - Model name override (optional; providers have sensible defaults)
 * - See ./providers/<name>.cjs for provider-specific required variables
 */

/**
 * Get AI configuration.
 * Returns empty object if AI is not enabled.
 * Only loads and validates the provider when AI is explicitly enabled via --ai flag or CODECEPT_AI env var.
 *
 * Note: We check process.argv for --ai because CodeceptJS itself checks process.argv
 * to enable AI features, and our config needs to align with that behavior.
 */
function getAIConfig() {
  const isAIEnabled = process.argv.includes('--ai') || process.env.CODECEPT_AI === 'true';

  if (!isAIEnabled) {
    return {};
  }

  const providerName = process.env.AI_PROVIDER || 'anthropic';
  let provider;
  try {
    provider = require(`./providers/${providerName}.cjs`);
  } catch {
    throw new Error(
      `Unknown AI provider: "${providerName}". ` +
        `Set AI_PROVIDER to a supported value (e.g. anthropic).`
    );
  }

  const missingVars = provider.requiredVars.filter((v) => !process.env[v]);
  if (missingVars.length) {
    console.error('Missing required AI environment variables:');
    missingVars.forEach((v) => console.error(`  - ${v}`));
    console.error('\nSee .env.sample for configuration instructions.');
    throw new Error('AI environment variables not configured.');
  }

  return {
    request: provider.request.bind(provider),

    prompts: {
      healStep: (html, context) => [
        {
          role: 'user',
          content: `As a test automation engineer I am testing a Salesforce Commerce Cloud storefront using CodeceptJS.
                    I want to heal a test that fails. Here is the list of executed steps: ${context.prevSteps
                      .map((s) => s.toString())
                      .join(', ')}
                    Propose how to adjust ${context.step.toCode()} step to fix the test.

                    Context: This is an e-commerce storefront with typical commerce elements like product tiles, search inputs, cart buttons, checkout forms.

                    Use locators in order of preference:
                    1. data-testid attributes (preferred for storefront)
                    2. semantic locators by text
                    3. CSS selectors (stable classes)
                    4. XPath (last resort)

                    Use codeblocks marked with \`\`\`
                    Here is the error message: ${context.error.message}
                    Here is HTML code of a page where the failure has happened: \n\n${html}
                    ${context.customMessage ? `\n\n${context.customMessage}` : ''}`,
        },
      ],

      generatePageObject: (html, extraPrompt = '', rootLocator = null) => [
        {
          role: 'user',
          content: `Read the existing HTML code of a Salesforce Commerce Cloud storefront page and generate a page object for the current page.

                    The html code is: ${html}. ${extraPrompt}.

                    Page Object must be named as "pagename.page.ts" and must be in typescript. You must compile to see there are not errors.
                    You must create Async methods only if Await is needed in function.

                    Context: This is a commerce storefront with elements like product tiles, search inputs, cart buttons, checkout forms, navigation menus.

                    Page Object must follow this pattern:

const { I } = inject();

class StorefrontPage {
    locators = {
        searchInput: locate('input[data-testid*="search"]').as('Search Input'),
        productTiles: locate('[data-testid*="product-tile"]').as('Product Tiles'),
        cartIcon: locate('[data-testid*="cart"]').as('Cart Icon'),
        addToCartButton: locate('[data-testid*="add-to-cart"]').as('Add to Cart Button'),
        priceDisplay: locate('[data-testid*="price"]').as('Price Display'),
    };

    async navigate(url?: string): Promise<void> {
        const targetUrl = url || process.env.BASE_URL;
        I.amOnPage(targetUrl);
        I.waitForElement('body', 30);
        I.wait(2); // Allow time for API calls and cookies
    }

    searchForProduct(productName: string): void {
        I.fillField(this.locators.searchInput, productName);
        I.pressKey('Enter');
        I.waitForElement(this.locators.productTiles, 15);
    }

    async getProductCount(): Promise<number> {
        I.waitForElement(this.locators.productTiles, 15);
        return await I.grabNumberOfVisibleElements(this.locators.productTiles);
    }

    clickFirstProduct(): void {
        I.click(this.locators.productTiles.first());
    }
}

export = new StorefrontPage();`,
        },
      ],
    },
  };
}

module.exports = {
  getAIConfig,
};
