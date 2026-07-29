/**
 * Copyright 2026 Salesforce, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import type { ReactNode } from 'react';
import { ConfigProvider } from '@salesforce/storefront-next-runtime/config';
import { SiteProvider } from '@salesforce/storefront-next-runtime/site-context';
import type { AppConfig } from '@/types/config';
import { mockBuildConfig, mockConfig, mockSiteObject } from './config';
import { UITargetProviders } from '@/targets/ui-target-providers';
// @sfdc-extension-line SFDC_EXT_STORE_LOCATOR
import StoreLocatorProvider from '@/extensions/store-locator/providers/store-locator';

const defaultSiteId = mockBuildConfig.app.defaultSiteId;

const defaultMockSite = {
    ...mockSiteObject,
    alias: mockBuildConfig.app.siteAliasMap?.[defaultSiteId] ?? undefined,
};

const defaultMockLocale =
    defaultMockSite.supportedLocales.find((l) => l.id === defaultMockSite.defaultLocale) ??
    defaultMockSite.supportedLocales[0];

/**
 * React Testing Library wrapper component that provides ConfigProvider context
 */
export function ConfigWrapper({ children }: { children: ReactNode }) {
    return <ConfigProvider config={mockConfig}>{children}</ConfigProvider>;
}

/**
 * React Testing Library wrapper component that provides all providers context
 *
 * @param props - Component props
 * @param props.children - React children to wrap
 * @param props.config - Optional custom config. Defaults to mockConfig if not provided
 * @param props.currency - Optional currency. Defaults to 'USD' if not provided
 *
 * @example
 * ```typescript
 * // Use default config and currency
 * <AllProvidersWrapper>
 *   <MyComponent />
 * </AllProvidersWrapper>
 *
 * // Use custom config
 * const customConfig = { ...mockBuildConfig.app, ...overrides };
 * <AllProvidersWrapper config={customConfig}>
 *   <MyComponent />
 * </AllProvidersWrapper>
 *
 * // Use custom currency
 * <AllProvidersWrapper currency="EUR">
 *   <MyComponent />
 * </AllProvidersWrapper>
 * ```
 */
export function AllProvidersWrapper({
    children,
    config = mockConfig,
    currency = 'USD',
}: {
    children: ReactNode;
    config?: AppConfig;
    currency?: string;
}) {
    return (
        <ConfigProvider config={config}>
            <SiteProvider
                site={defaultMockSite}
                locale={defaultMockLocale}
                language={mockSiteObject.defaultLocale}
                currency={currency}>
                {/* @sfdc-extension-line SFDC_EXT_STORE_LOCATOR */}
                <StoreLocatorProvider>
                    {/* The wishlist store is a module-level singleton (no provider). Components that
                        consume it (WishlistButton in PDP / tiles) render without any wrapper; tests
                        that assert wishlist state reset it via resetWishlistStore (@/test-utils/wishlist). */}
                    <UITargetProviders>{children}</UITargetProviders>
                    {/* @sfdc-extension-line SFDC_EXT_STORE_LOCATOR */}
                </StoreLocatorProvider>
            </SiteProvider>
        </ConfigProvider>
    );
}
