/**
 * Storybook Provider Wrappers
 *
 * This file provides wrapper components that use the REAL provider components
 * from the application with mock data injected. This ensures Storybook always
 * stays in sync with the actual provider implementations.
 *
 * When a provider's interface changes, you'll get a TypeScript error here,
 * making it clear what needs to be updated.
 *
 * @see {@link ../../.storybook/README.md} for documentation on maintaining these providers.
 */

import type { PropsWithChildren } from 'react';
import AuthProvider from '../src/providers/auth';
import BasketProvider from '../src/providers/basket';
import CheckoutOneClickProvider from '../src/components/checkout/utils/checkout-context';
import ProductViewProvider from '../src/providers/product-view';
import StoreLocatorProvider from '../src/extensions/store-locator/providers/store-locator';
import { ConfigProvider } from '@salesforce/storefront-next-runtime/config';
import { SiteProvider } from '@salesforce/storefront-next-runtime/site-context';
import { mockConfig } from '../src/test-utils/config';
import type { SessionData } from '../src/lib/api/types';
import type { ShopperBasketsV2, ShopperProducts } from '@salesforce/storefront-next-runtime/scapi';
import { I18nextProvider } from 'react-i18next';
import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';
import resources from '../src/locales';

/**
 * Initialize the global i18next instance
 * This ensures translations work properly in the Storybook UI
 */
void i18next.use(initReactI18next).init({
    lng: 'en-GB',
    fallbackLng: 'en-GB',
    resources,
    interpolation: {
        escapeValue: false,
        format: (value, format) => {
            if (format === 'number' && typeof value === 'number') {
                return value.toLocaleString('en-GB');
            }
            return value;
        },
    },
});

/**
 * Mock session data for Storybook
 * Update this when SessionData type changes
 */
const mockSessionData: SessionData = {
    userType: 'guest',
    customerId: undefined,
};

/**
 * Mock basket data for Storybook
 * Update this when ShopperBasketsV2.schemas['Basket'] type changes
 */
const mockBasket: ShopperBasketsV2.schemas['Basket'] | undefined = undefined;

/**
 * Mock product data for Storybook (used when ProductViewProvider is needed)
 * Update this when ShopperProducts.schemas['Product'] type changes
 */
const mockProduct: ShopperProducts.schemas['Product'] = {
    id: 'storybook-product',
    name: 'Storybook Product',
    inventory: {
        ats: 10,
    },
} as ShopperProducts.schemas['Product'];

/**
 * Storybook ConfigProvider wrapper with mock config
 */
export const StorybookConfigProvider = ({ children }: PropsWithChildren) => (
    <ConfigProvider config={mockConfig}>{children}</ConfigProvider>
);

/**
 * Storybook SiteProvider wrapper with mock site data from the first configured site
 */
const storybookSite = mockConfig.commerce.sites[0];
const storybookLocale =
    storybookSite.supportedLocales.find((l) => l.id === storybookSite.defaultLocale) ?? storybookSite.supportedLocales[0];

export const StorybookSiteProvider = ({ children }: PropsWithChildren) => (
    <SiteProvider
        site={storybookSite}
        locale={storybookLocale}
        language={storybookSite.defaultLocale}
        currency={storybookSite.defaultCurrency}>
        {children}
    </SiteProvider>
);

/**
 * Storybook I18nextProvider wrapper with initialized i18next instance
 */
export const StorybookI18nextProvider = ({ children }: PropsWithChildren) => (
    <I18nextProvider i18n={i18next}>{children}</I18nextProvider>
);

/**
 * Storybook AuthProvider wrapper with mock session data
 */
export const StorybookAuthProvider = ({ children }: PropsWithChildren) => (
    <AuthProvider value={mockSessionData}>{children}</AuthProvider>
);

/**
 * Storybook BasketProvider wrapper with mock basket data
 */
export const StorybookBasketProvider = ({ children }: PropsWithChildren) => (
    <BasketProvider basket={mockBasket}>{children}</BasketProvider>
);

/**
 * Storybook StoreLocatorProvider wrapper
 * StoreLocatorProvider doesn't require any props - it initializes its own store from cookies
 */
export const StorybookStoreLocatorProvider = ({ children }: PropsWithChildren) => (
    <StoreLocatorProvider>{children}</StoreLocatorProvider>
);

/**
 * Storybook CheckoutProvider wrapper with mock customer profile
 */
export const StorybookCheckoutProvider = ({ children }: PropsWithChildren) => (
    <CheckoutOneClickProvider customerProfile={undefined} shippingDefaultSet={Promise.resolve(undefined)}>
        {children}
    </CheckoutOneClickProvider>
);

/**
 * Storybook ProductViewProvider wrapper with mock product data
 * Only use this when testing components that specifically need ProductViewProvider
 */
export const StorybookProductViewProvider = ({ children }: PropsWithChildren) => (
    <ProductViewProvider product={mockProduct} mode="add">
        {children}
    </ProductViewProvider>
);

/**
 * Array of Storybook provider wrappers in the correct order
 * This order matches the application's provider hierarchy in root.tsx
 *
 * To add a new provider:
 * 1. Create a Storybook*Provider wrapper above
 * 2. Add it to this array in the correct position
 * 3. Update the documentation in README.md
 */
export const storybookProviders = [
    StorybookConfigProvider,
    StorybookI18nextProvider,
    StorybookSiteProvider,
    StorybookAuthProvider,
    StorybookBasketProvider,
    StorybookStoreLocatorProvider,
    StorybookCheckoutProvider,
] as const;
