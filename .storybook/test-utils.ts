import { waitFor } from 'storybook/test';
import { mockConfig } from '../src/test-utils/config';

/**
 * Waits for the Storybook loading placeholder to disappear, ensuring the component is fully mounted
 * before interaction tests run. This prevents test failures due to components unmounting during initialization.
 *
 * @param canvasElement - The canvas element from the Storybook play function
 * @param timeout - Optional timeout in milliseconds (default: 5000)
 * @returns Promise that resolves when the component is ready
 *
 * @example
 * ```ts
 * play: async ({ canvasElement }) => {
 *   await waitForStorybookReady(canvasElement);
 *   // Your test code here
 * }
 * ```
 */
export async function waitForStorybookReady(canvasElement: HTMLElement, timeout = 5000): Promise<void> {
    await waitFor(
        () => {
            const loadingPlaceholder = canvasElement.querySelector('[data-storybook-loading="true"]');
            if (loadingPlaceholder) {
                throw new Error('Component still loading');
            }
        },
        { timeout }
    );
}

/**
 * The default URL prefix applied by the site context SiteProvider in Storybook.
 * Derived from the mock config's first site and its default locale.
 *
 * Use this in play-function assertions to build expected prefixed URLs:
 * Do not do any fancy logic in here. This is to DRY the prefix hard-code string for tests
 * @example
 * ```ts
 * await expect(link).toHaveAttribute('href', `${SITE_PREFIX}/category/featured`);
 * ```
 */
const defaultSite = mockConfig.commerce.sites[0];
export const SITE_PREFIX = `/${defaultSite.id}/${defaultSite.defaultLocale}`;

/**
 * Re-export StoryTestWrapper for use in snapshot tests. Provides RouterProvider + SiteProvider + context providers.
 */
export { StoryTestWrapper } from './test-wrapper';
