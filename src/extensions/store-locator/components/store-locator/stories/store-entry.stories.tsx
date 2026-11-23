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
import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { storeEntryCapabilities } from '@/extensions/store-locator/lib/store-entry-capabilities';
import { expect, within, userEvent, waitFor } from 'storybook/test';
import { createInstance } from 'i18next';
import { I18nextProvider } from 'react-i18next';
import { ConfigProvider } from '@salesforce/storefront-next-runtime/config';
import { Button } from '@/components/ui/button';
import { mockConfig } from '@/test-utils/config';
import StoreLocatorProvider from '@/extensions/store-locator/providers/store-locator';
import StoreLocatorSheetHost from '@/extensions/store-locator/components/header/store-locator-sheet-host';
import StoreLocatorBadge from '@/extensions/store-locator/components/header/store-locator-badge';
import StoreEntryGate from '@/extensions/store-locator/components/store-entry-gate';
import { useStoreEntryAdd } from '@/extensions/store-locator/hooks/use-store-entry-add';
import type { FulfillmentMode } from '@/extensions/store-locator/lib/store-entry';
import enGB from '@/extensions/store-locator/locales/en-GB/translations.json';
import enUS from '@/extensions/store-locator/locales/en-US/translations.json';

const store = {
    id: 'fixture-store',
    inventoryId: 'fixture-inventory',
    name: 'Le grand marché du quartier Saint-Germain-des-Prés et des environs',
    address1: '12 rue du Marché',
    city: 'Paris',
    countryCode: 'FR',
    postalCode: '75006',
    storeHours: 'Lundi–samedi : 09:00–19:30',
    distance: 1.23,
};
const translations = Object.fromEntries(
    [
        ['en-GB', enGB],
        ['en-US', enUS],
    ].map(([locale, resource]) => {
        const instance = createInstance();
        void instance.init({
            lng: locale as string,
            resources: { [locale as string]: { extStoreLocator: resource } },
            defaultNS: 'extStoreLocator',
            initAsync: false,
        });
        return [locale, instance];
    })
);
const routes = [
    {
        path: '/resource/stores',
        loader: ({ request }: { request: Request }) => ({
            success: true,
            fulfillmentMode: new URL(request.url).searchParams.get('fulfillmentMode'),
            stores: { data: [store], limit: 200, total: 1 },
            eligibility: {
                [store.id]: {
                    eligible: true,
                    status: 'Retrait disponible',
                    services: ['Retrait', 'Parking'],
                },
            },
        }),
    },
    {
        path: '/action/set-selected-store',
        action: async ({ request }: { request: Request }) => {
            const body = await request.formData();
            const candidate = { fulfillmentMode: body.get('fulfillmentMode') as FulfillmentMode };
            return {
                success: true,
                selectedStoreInfo: {
                    id: store.id,
                    name: store.name,
                    inventoryId: store.inventoryId,
                    fulfillmentMode: candidate.fulfillmentMode,
                },
                shoppingContext: null,
            };
        },
    },
];
function Product() {
    const [quantity, setQuantity] = useState(0);
    const add = useStoreEntryAdd();
    return (
        <div className="space-y-4 p-4">
            <StoreLocatorBadge />
            <StoreLocatorSheetHost />
            <Button
                onClick={() => {
                    if (
                        !add.intercept(
                            {
                                productId: 'fixture-variant',
                                quantity: 2,
                                optionItems: [{ optionId: 'wrap', optionValueId: 'yes' }],
                            },
                            () => setQuantity((value) => value + 2)
                        )
                    )
                        setQuantity((value) => value + 2);
                }}>
                Add to basket
            </Button>
            <p>
                Basket quantity:
                <span data-testid="basket-quantity">{quantity}</span>
            </p>
        </div>
    );
}
type Props = { locale: 'en-GB' | 'en-US'; modes: FulfillmentMode[]; policy: 'soft' | 'required' };
function Demo({ locale, modes, policy }: Props) {
    const config = {
        ...mockConfig,
        features: {
            ...mockConfig.features,
            storeEntry: {
                enabled: true,
                policy,
                fulfillmentModes: modes,
                countries: ['GB', 'FR'],
                distanceUnit: 'km' as const,
            },
        },
    };
    return (
        <I18nextProvider i18n={translations[locale]}>
            <ConfigProvider config={config}>
                <StoreLocatorProvider entryEnabled>
                    {policy === 'required' ? (
                        <main id="main-content" tabIndex={-1}>
                            <StoreEntryGate>
                                <Product />
                            </StoreEntryGate>
                        </main>
                    ) : (
                        <Product />
                    )}
                </StoreLocatorProvider>
            </ConfigProvider>
        </I18nextProvider>
    );
}
const meta = {
    title: 'Extensions/Store Locator/Store Entry',
    // Replacement boutique choosers do not implement this fulfillment-first journey.
    render: (args) =>
        storeEntryCapabilities.fulfillmentFirst ? (
            <Demo {...args} />
        ) : (
            <p>This chooser does not implement fulfillment-first store entry.</p>
        ),
    tags: ['interaction', 'a11y', 'store-entry'],
    parameters: {
        layout: 'fullscreen',
        mockRoutes: routes,
        snapshot: false,
        docs: {
            description: {
                component:
                    'Explicit search/action fixtures. Does not establish city geocoding or native switching integration. Delivery uses ordinary ship-to-address; store-to-address coverage is deferred.',
            },
        },
    },
    args: { locale: 'en-GB', modes: ['pickup', 'delivery'], policy: 'soft' },
} satisfies Meta<Props>;
export default meta;
type Story = StoryObj<typeof meta>;
export const ModeFirst: Story = {
    play: storeEntryCapabilities.fulfillmentFirst
        ? async ({ canvasElement }) => {
              const page = within(canvasElement.ownerDocument.body);
              await userEvent.click(page.getByRole('button', { name: 'Add to basket' }));
              const collection = await page.findByRole('radio', { name: 'Collection' });
              await expect(page.queryByRole('textbox')).not.toBeInTheDocument();
              collection.focus();
              await userEvent.keyboard(' ');
              await userEvent.selectOptions(page.getByRole('combobox', { name: 'Country' }), 'GB');
              await userEvent.type(page.getByRole('textbox', { name: 'Postcode' }), 'SW1A 1AA');
              await userEvent.click(page.getByRole('button', { name: 'Find' }));
              const choice = await page.findByRole('radio', { name: /Le grand marché/ });
              await userEvent.click(choice);
              // The coordinator resumes the captured add in an effect after selection commits.
              await waitFor(() => expect(page.getByTestId('basket-quantity')).toHaveTextContent('2'));
          }
        : undefined,
};
export const CollectionOnly: Story = {
    args: { modes: ['pickup'] },
    play: storeEntryCapabilities.fulfillmentFirst
        ? async ({ canvasElement }) => {
              const page = within(canvasElement.ownerDocument.body);
              await userEvent.click(page.getByRole('button', { name: 'Add to basket' }));
              await expect(await page.findByRole('textbox', { name: 'Postcode' })).toBeVisible();
              await expect(page.queryByRole('radio', { name: 'Collection' })).not.toBeInTheDocument();
              await userEvent.keyboard('{Escape}');
              await expect(await page.findByTestId('basket-quantity')).toHaveTextContent('0');
          }
        : undefined,
};
export const USNoMap: Story = {
    args: { locale: 'en-US', modes: ['pickup'] },
    play: storeEntryCapabilities.fulfillmentFirst
        ? async ({ canvasElement }) => {
              const page = within(canvasElement.ownerDocument.body);
              await userEvent.click(page.getByRole('button', { name: 'Add to basket' }));
              await page.findByRole('textbox', { name: 'Postal Code' });
              await userEvent.selectOptions(page.getByRole('combobox', { name: 'Country' }), 'FR');
              await userEvent.type(page.getByRole('textbox', { name: 'Postal Code' }), '75006');
              await userEvent.click(page.getByRole('button', { name: 'Find' }));
              await expect(await page.findByRole('radio', { name: /Le grand marché/ })).toBeVisible();
              await expect(page.getByText('1.23 km away')).toBeVisible();
          }
        : undefined,
};

export const RequiredEntry: Story = {
    args: { policy: 'required' },
    parameters: { routeLoaderData: { 'routes/_app.p.$': {} } },
    play: storeEntryCapabilities.fulfillmentFirst
        ? async ({ canvasElement }) => {
              const page = within(canvasElement.ownerDocument.body);
              await page.findByRole('dialog');
              await userEvent.keyboard('{Escape}');
              await expect(page.getByRole('heading', { name: 'Choose a store to continue' })).toBeVisible();
              await expect(page.queryByRole('button', { name: 'Add to basket' })).not.toBeInTheDocument();
              const reopen = page.getByRole('button', { name: 'Choose store' });
              await expect(reopen).toHaveFocus();
              await userEvent.click(reopen);
              await userEvent.click(await page.findByRole('radio', { name: 'Collection' }));
              await userEvent.selectOptions(page.getByRole('combobox', { name: 'Country' }), 'GB');
              await userEvent.type(page.getByRole('textbox', { name: 'Postcode' }), 'SW1A 1AA');
              await userEvent.click(page.getByRole('button', { name: 'Find' }));
              await userEvent.click(await page.findByRole('radio', { name: /Le grand marché/ }));
              await expect(await page.findByTestId('basket-quantity')).toHaveTextContent('0');
              await userEvent.click(await page.findByRole('button', { name: 'Add to basket' }));
              await waitFor(() => expect(page.getByTestId('basket-quantity')).toHaveTextContent('2'));
          }
        : undefined,
};

export const USRequiredEntry: Story = {
    args: { locale: 'en-US', policy: 'required', modes: ['pickup'] },
    parameters: { routeLoaderData: { 'routes/_app.p.$': {} } },
    play: storeEntryCapabilities.fulfillmentFirst
        ? async ({ canvasElement }) => {
              const page = within(canvasElement.ownerDocument.body);
              await page.findByRole('dialog');
              await userEvent.keyboard('{Escape}');
              await expect(page.getByRole('heading', { name: 'Choose a store to continue' })).toBeVisible();
              await expect(page.getByRole('button', { name: 'Choose store' })).toHaveFocus();
              await expect(page.queryByRole('button', { name: 'Add to basket' })).not.toBeInTheDocument();
          }
        : undefined,
};

export const RequiredCancellation: Story = {
    args: { policy: 'required', modes: ['pickup'] },
    parameters: { routeLoaderData: { 'routes/_app.p.$': {} } },
    play: storeEntryCapabilities.fulfillmentFirst
        ? async ({ canvasElement }) => {
              const page = within(canvasElement.ownerDocument.body);
              await page.findByRole('dialog');
              await userEvent.keyboard('{Escape}');
              await expect(page.getByRole('heading', { name: 'Choose a store to continue' })).toBeVisible();
              await expect(page.getByRole('button', { name: 'Choose store' })).toHaveFocus();
              await expect(page.queryByRole('button', { name: 'Add to basket' })).not.toBeInTheDocument();
          }
        : undefined,
};
