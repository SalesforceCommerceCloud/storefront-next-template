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
import { Fragment } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { storeEntryCapabilities } from '@/extensions/store-locator/lib/store-entry-capabilities';
import { expect, within, userEvent } from 'storybook/test';
import { createInstance } from 'i18next';
import { I18nextProvider } from 'react-i18next';
import { ConfigProvider } from '@salesforce/storefront-next-runtime/config';
import { mockConfig } from '@/test-utils/config';
import StoreLocatorProvider from '@/extensions/store-locator/providers/store-locator';
import CheckoutStoreSelection from '@/extensions/store-locator/components/checkout/checkout-store-selection';
import CheckoutStoreSelectionHost from '@/extensions/store-locator/components/checkout/checkout-store-selection-host';
import type { FulfillmentMode } from '@/extensions/store-locator/lib/store-entry';
import BasketProvider from '@/providers/basket';
import CheckoutProvider from '@/components/checkout/utils/checkout-context';
import CheckoutFormPage from '@/components/checkout/checkout-form-page';
import Header from '@/components/header';
import Footer from '@/components/footer';
import GoogleCloudApiProvider from '@/providers/google-cloud-api';
// @sfdc-extension-line SFDC_EXT_BOPIS
import PickupProvider from '@/extensions/bopis/context/pickup-context';
import { checkoutWithOneItem } from '@/components/__mocks__/checkout-data';
import type { ShopperBasketsV2 } from '@/scapi';
import enGB from '@/locales/en-GB';
import enUS from '@/locales/en-US';

const selected = {
    id: 'fixture-current',
    inventoryId: 'fixture-inventory',
    name: 'Market Street · City Centre',
};
const candidate = {
    id: 'fixture-candidate',
    inventoryId: 'fixture-other-inventory',
    name: 'Market Street · West End',
    countryCode: 'GB',
    postalCode: 'SW1A 1AA',
    address1: '1 High Street',
    city: 'London',
    storeHours: 'Monday–Saturday 09:00–18:00',
    distance: 1.23,
};
const translations = Object.fromEntries(
    (
        [
            ['en-GB', enGB],
            ['en-US', enUS],
        ] as const
    ).map(([locale, resource]) => {
        const instance = createInstance();
        void instance.init({
            lng: locale as string,
            resources: { [locale as string]: resource },
            defaultNS: 'extStoreLocator',
            initAsync: false,
        });
        return [locale, instance];
    })
);
const basket: ShopperBasketsV2.schemas['Basket'] = {
    ...checkoutWithOneItem.cart,
    basketId: 'checkout-selection-fixture-only',
    currency: 'GBP',
    customerInfo: { email: 'shopper@example.com' },
    paymentInstruments: [],
};
const products = Promise.resolve({});
const promotions = Promise.resolve({});
const methods = Promise.resolve({ me: checkoutWithOneItem.shippingMethods });
const shippingDefaultSet = Promise.resolve(undefined);

type Props = {
    mode: FulfillmentMode;
    locale: 'en-GB' | 'en-US';
    longName: boolean;
    fullCheckout: boolean;
    enabled: boolean;
    missing: boolean;
};
function Demo({ mode, locale, fullCheckout, enabled, missing, longName }: Props) {
    let CheckoutPickupProvider: React.ComponentType<React.PropsWithChildren> = Fragment;
    // @sfdc-extension-line SFDC_EXT_BOPIS
    CheckoutPickupProvider = PickupProvider;
    const config = {
        ...mockConfig,
        features: {
            ...mockConfig.features,
            storeEntry: {
                enabled,
                fulfillmentModes: ['pickup', 'delivery'] as FulfillmentMode[],
                countries: ['GB', 'FR'],
            },
        },
    };
    const selection = missing
        ? null
        : {
              ...selected,
              fulfillmentMode: mode,
              name: longName ? 'Market Street · A very long neighbourhood and city centre store name' : selected.name,
          };
    return (
        <I18nextProvider i18n={translations[locale]}>
            <ConfigProvider config={config}>
                <StoreLocatorProvider selectedStoreInfo={selection} entryEnabled={enabled}>
                    {fullCheckout ? (
                        <BasketProvider basket={basket}>
                            <CheckoutProvider shippingDefaultSet={shippingDefaultSet}>
                                <GoogleCloudApiProvider>
                                    <CheckoutPickupProvider>
                                        <aside className="bg-muted border-b border-border p-3 text-sm">
                                            Checkout fixture · Sample basket · Selection changes return the shared
                                            basket guard
                                        </aside>
                                        <Header variant="checkout" />
                                        <main
                                            onSubmitCapture={(event) => {
                                                event.preventDefault();
                                                event.stopPropagation();
                                            }}>
                                            <CheckoutFormPage
                                                productMapPromise={products}
                                                promotionsPromise={promotions}
                                                shippingMethodsMapPromise={methods}
                                            />
                                        </main>
                                        <Footer variant="checkout" />
                                    </CheckoutPickupProvider>
                                </GoogleCloudApiProvider>
                            </CheckoutProvider>
                        </BasketProvider>
                    ) : (
                        <div className="mx-auto max-w-sm p-4">
                            <CheckoutStoreSelection />
                            <CheckoutStoreSelectionHost />
                        </div>
                    )}
                </StoreLocatorProvider>
            </ConfigProvider>
        </I18nextProvider>
    );
}
const meta = {
    title: 'Extensions/Store Locator/Checkout Store Selection',
    render: (args) => <Demo {...args} />,
    tags: ['interaction', 'a11y', 'checkout-store-selection'],
    args: { mode: 'delivery', locale: 'en-GB', fullCheckout: false, enabled: true, missing: false, longName: false },
    parameters: {
        layout: 'fullscreen',
        mockRoutes: [
            {
                path: '/resource/stores',
                loader: ({ request }: { request: Request }) => ({
                    success: true,
                    fulfillmentMode: new URL(request.url).searchParams.get('fulfillmentMode'),
                    stores: { data: [candidate], total: 1, limit: 200 },
                    eligibility: { [candidate.id]: { eligible: true } },
                }),
            },
            {
                path: '/action/set-selected-store',
                action: () => ({
                    success: false,
                    code: 'STORE_CHANGE_CONFIRMATION_REQUIRED',
                    error: 'STORE_CHANGE_CONFIRMATION_REQUIRED',
                }),
            },
        ],
        docs: {
            description: {
                component:
                    'Uses the real checkout/locator UI with explicit basket, search and rejected-selection fixtures. Does not prove live tenant switching or successful preview/consent/apply.',
            },
        },
    },
} satisfies Meta<Props>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Delivery: Story = {};
export const Collection: Story = { args: { mode: 'pickup' } };
export const LongStoreName: Story = { args: { longName: true, mode: 'pickup' } };
export const USPickup: Story = { args: { locale: 'en-US', mode: 'pickup' } };
export const MissingSelection: Story = { args: { missing: true } };
export const Disabled: Story = { args: { enabled: false } };
export const Checkout: Story = { args: { fullCheckout: true }, parameters: { snapshot: false } };
export const BasketGuard: Story = {
    args: { mode: 'pickup' },
    parameters: { snapshot: false },
    // This journey requires the canonical fulfillment-first chooser capability.
    play: storeEntryCapabilities.fulfillmentFirst
        ? async ({ canvasElement }) => {
              const page = within(canvasElement.ownerDocument.body);
              const change = await page.findByRole('button', { name: /Change shopping store/ });
              await userEvent.click(change);
              await userEvent.selectOptions(await page.findByRole('combobox', { name: 'Country' }), 'GB');
              await userEvent.type(page.getByRole('textbox', { name: 'Postcode' }), 'SW1A 1AA');
              await userEvent.click(page.getByRole('button', { name: 'Find' }));
              await userEvent.click(await page.findByRole('radio', { name: /Market Street · West End/ }));
              await expect(await page.findByRole('alert')).toHaveTextContent(
                  'Your current store and basket are unchanged.'
              );
              await expect(page.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument();
              await expect(page.getByRole('button', { name: 'Find' })).toBeEnabled();
              await expect(page.getByRole('radio', { name: /Market Street · West End/ })).toBeEnabled();
              await userEvent.keyboard('{Escape}');
              await expect(change).toHaveFocus();
              await expect(page.getByRole('region', { name: 'Shopping store' })).toHaveTextContent(selected.name);
          }
        : undefined,
};
