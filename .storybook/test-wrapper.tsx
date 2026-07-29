/**
 * Snapshot-only wrapper used by `*-snapshot.tsx` stories generated via
 * `scripts/generate-story-tests.js`. Lives outside the global decorator stack
 * because portable-stories snapshot tests render their content stand-alone —
 * without `preview.tsx`'s decorators — and need the providers/router applied
 * directly here.
 *
 * Active consumers (do NOT delete without checking these):
 *   - src/extensions/store-locator/components/store-locator/stories/*-snapshot.tsx (8+ files)
 *   - scripts/generate-story-tests.js (codegen target)
 *
 * For interactive Storybook stories use the global decorator stack in
 * `.storybook/decorators/` instead.
 */
import type { ReactElement, ReactNode } from 'react';
import { createMemoryRouter, RouterProvider, useInRouterContext } from 'react-router';
import StoreLocatorProvider from '../src/extensions/store-locator/providers/store-locator';
import CheckoutOneClickProvider from '../src/components/checkout/utils/checkout-context';
import BasketProvider from '../src/providers/basket';
import AuthProvider from '../src/providers/auth';
import { ConfigProvider } from '@salesforce/storefront-next-runtime/config';
import { SiteProvider } from '@salesforce/storefront-next-runtime/site-context';
import { mockConfig } from '../src/test-utils/config';
import { basketWithOneItem, inBasketProductDetails } from '@/components/__mocks__/basket-with-dress';

// Transform array of products into Record<productId, product> format
// expected by useMiniCartData hook
const mockProductsById = inBasketProductDetails.data.reduce(
    (acc: Record<string, (typeof inBasketProductDetails.data)[0]>, product: (typeof inBasketProductDetails.data)[0]) => {
        acc[product.id] = product;
        return acc;
    },
    {} as Record<string, (typeof inBasketProductDetails.data)[0]>
);

const mockBasketProductsData = { basket: basketWithOneItem, productsById: mockProductsById };

export function StoryTestWrapper({
    children,
    initialEntries,
}: {
    children: ReactNode;
    /**
     * Seed the memory router with a non-root URL so components that read
     * `useLocation()` / `useSearchParams()` see the correct path/search on
     * first paint. Avoids the `useEffect`-driven URL-setter pattern that
     * produces empty-wrapper snapshots because the effect hasn't fired by
     * the time `toMatchSnapshot()` is called.
     */
    initialEntries?: string[];
}): ReactElement {
    const inRouter = useInRouterContext();

    // Wrap with providers in the correct order (matching root.tsx)
    // CheckoutProvider needs BasketProvider, which needs AuthProvider
    const site = mockConfig.commerce.sites[0];
    const siteWithAlias = { ...site, alias: mockConfig.siteAliasMap?.[site.id] };
    const locale = site.supportedLocales.find((l) => l.id === site.defaultLocale) ?? site.supportedLocales[0];

    const content = (
        <ConfigProvider config={mockConfig}>
            <SiteProvider site={siteWithAlias} locale={locale} language={site.defaultLocale} currency={site.defaultCurrency}>
                <AuthProvider value={{ userType: 'guest', customerId: undefined }}>
                    <BasketProvider basket={undefined}>
                        <StoreLocatorProvider>
                            <CheckoutOneClickProvider customerProfile={undefined} shippingDefaultSet={Promise.resolve(undefined)}>
                                {children}
                            </CheckoutOneClickProvider>
                        </StoreLocatorProvider>
                    </BasketProvider>
                </AuthProvider>
            </SiteProvider>
        </ConfigProvider>
    );

    // Only create router if one doesn't already exist (to avoid nested router errors)
    // Stories with decorators that create routers will handle it themselves
    if (inRouter) {
        return <>{content}</>;
    }

    // Create a memory router for components that need React Router context
    // Includes resource routes needed by hooks like useMiniCartData
    const router = createMemoryRouter(
        [
            {
                path: '/resource/basket-products',
                loader: () => mockBasketProductsData,
            },
            {
                path: '*',
                element: content,
            },
        ],
        {
            initialEntries: initialEntries ?? ['/'],
        }
    );

    return <RouterProvider router={router} />;
}

