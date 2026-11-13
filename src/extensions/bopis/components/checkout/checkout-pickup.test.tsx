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
import { describe, test, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { ShopperBasketsV2 } from '@/scapi';
import type { ReactNode } from 'react';
import userEvent from '@testing-library/user-event';
import CheckoutPickup from './checkout-pickup';
import { ConfigProvider } from '@salesforce/storefront-next-runtime/config';
import { SiteProvider } from '@salesforce/storefront-next-runtime/site-context';
import { mockConfig, mockAltSiteObject } from '@/test-utils/config';

const defaultMockSite = mockAltSiteObject;
const defaultMockLocale =
    defaultMockSite.supportedLocales.find((l) => l.id === defaultMockSite.defaultLocale) ??
    defaultMockSite.supportedLocales[0];

const wrapper = ({ children }: { children: ReactNode }) => (
    <ConfigProvider config={mockConfig}>
        <SiteProvider
            site={defaultMockSite}
            locale={defaultMockLocale}
            language={mockAltSiteObject.defaultLocale}
            currency={mockAltSiteObject.defaultCurrency}>
            {children}
        </SiteProvider>
    </ConfigProvider>
);

vi.mock('@/components/address-display', () => ({
    __esModule: true,
    default: ({ address }: any) => (
        <div data-testid="address-display">
            {address?.firstName} {address?.lastName} {address?.address1}
        </div>
    ),
}));
vi.mock('react-i18next', () => ({
    useTranslation: (_namespace?: string | string[]) => {
        // Return the key as-is for testing (matching the actual behavior)
        return {
            t: (key: string) => key,
            i18n: {
                language: mockAltSiteObject.defaultLocale,
            },
        };
    },
}));
const defaultStore = {
    id: 'store-123',
    name: 'Test Store',
    address1: '123 Main St',
    address2: 'Apt B',
    city: 'Springfield',
    stateCode: 'MA',
    postalCode: '01101',
    countryCode: 'US',
    phone: '555-1111',
    email: 'help@store.com',
};
const otherStore = {
    id: 'store-456',
    name: 'New Pickup Store',
    address1: '456 Oak Ave',
    city: 'Boston',
    stateCode: 'MA',
    postalCode: '02101',
    countryCode: 'US',
    phone: '555-2222',
    email: 'boston@store.com',
};
const defaultProduct = {
    id: 'item-1',
    itemId: 'item-1',
    productId: 'PID1',
    name: 'Black Hat',
    productName: 'Black Hat',
    image: '/assets/black-hat.png',
    attributes: [
        { label: 'Color', value: 'Black' },
        { label: 'Size', value: 'L' },
    ],
    variationAttributes: [
        { id: 'color', name: 'Color' },
        { id: 'size', name: 'Size' },
    ],
    variationValues: { color: 'Black', size: 'L' },
    quantity: 2,
    price: 29.95,
};
const productsByItemId = { 'item-1': defaultProduct };
const baseCart = {
    shipments: [{ shipmentId: 'ship1', c_fromStoreId: 'store-123' }],
    productItems: [{ ...defaultProduct, shipmentId: 'ship1' }],
};
const pickupContext = { pickupStores: new Map([['store-123', defaultStore]]) };
vi.mock('@/extensions/bopis/context/pickup-context', () => ({ usePickup: () => pickupContext }));

const mockOpenStoreLocator = vi.fn();
const mockSetSelectedStoreInfoRaw = vi.fn();
const mockChangeStore = vi.fn();
vi.mock('@/extensions/store-locator/providers/store-locator', () => ({
    useStoreLocator: vi.fn((selector: (s: unknown) => unknown) => {
        const state = {
            open: mockOpenStoreLocator,
            setSelectedStoreInfo: mockSetSelectedStoreInfoRaw,
            selectedStoreInfo: null,
            isOpen: false,
        };
        return selector(state);
    }),
}));
vi.mock('@/extensions/bopis/hooks/use-change-pickup-store', () => ({
    useChangePickupStore: () => ({ changeStore: mockChangeStore }),
}));

describe('CheckoutPickup', () => {
    beforeEach(() => {
        mockOpenStoreLocator.mockClear();
        mockSetSelectedStoreInfoRaw.mockClear();
        mockChangeStore.mockClear();
    });
    test('renders store and address in summary mode', () => {
        render(
            <CheckoutPickup
                cart={baseCart as any}
                productsByItemId={productsByItemId}
                isEditing={false}
                onEdit={() => {}}
                onContinue={() => {}}
                continueButtonLabel="Continue"
            />,
            { wrapper }
        );
        expect(screen.getByText('checkout.pickUp.title')).toBeInTheDocument();
        expect(screen.getByTestId('address-display')).toHaveTextContent('Test Store');
        expect(screen.getByText(/edit/i)).toBeInTheDocument();
    });
    test('renders pickup products and their details in edit mode', () => {
        render(
            <CheckoutPickup
                cart={baseCart as any}
                productsByItemId={productsByItemId}
                isEditing={true}
                onEdit={() => {}}
                onContinue={() => {}}
                continueButtonLabel="Continue"
            />,
            { wrapper }
        );
        expect(screen.getByTestId('address-display')).toBeInTheDocument();
        expect(screen.getByText(defaultProduct.name)).toBeInTheDocument();
        expect(screen.queryByText(/edit/i)).not.toBeInTheDocument();
    });
    test('edit button calls onEdit', async () => {
        const onEdit = vi.fn();
        render(
            <CheckoutPickup
                cart={baseCart as any}
                productsByItemId={productsByItemId}
                isEditing={false}
                onEdit={onEdit}
                onContinue={() => {}}
                continueButtonLabel="Continue"
            />,
            { wrapper }
        );
        const editBtn = screen.getByText(/edit/i);
        await userEvent.click(editBtn);
        expect(onEdit).toHaveBeenCalled();
    });

    test('renders Change Pickup Location link in edit mode', () => {
        render(
            <CheckoutPickup
                cart={baseCart as any}
                productsByItemId={productsByItemId}
                isEditing={true}
                onEdit={() => {}}
                onContinue={() => {}}
                continueButtonLabel="Continue"
            />,
            { wrapper }
        );
        expect(screen.getByText('storePickup.changePickupLocation')).toBeInTheDocument();
    });

    test('disables native pickup-store switching while keeping checkout editing available', () => {
        const config = {
            ...mockConfig,
            features: { ...mockConfig.features, shopperContext: { enabled: true, storeSelectionEnabled: true } },
        };
        render(
            <ConfigProvider config={config}>
                <CheckoutPickup
                    cart={baseCart as any}
                    productsByItemId={productsByItemId}
                    isEditing
                    onEdit={() => {}}
                    onContinue={() => {}}
                    continueButtonLabel="Continue"
                />
            </ConfigProvider>,
            { wrapper }
        );
        expect(screen.getByRole('button', { name: 'storePickup.changePickupLocation' })).toBeDisabled();
        expect(screen.getByRole('button', { name: 'Continue' })).toBeEnabled();
    });

    test('does not render Change Pickup Location link in summary mode', () => {
        render(
            <CheckoutPickup
                cart={baseCart as any}
                productsByItemId={productsByItemId}
                isEditing={false}
                onEdit={() => {}}
                onContinue={() => {}}
                continueButtonLabel="Continue"
            />,
            { wrapper }
        );
        expect(screen.queryByText('storePickup.changePickupLocation')).not.toBeInTheDocument();
    });

    test('clicking Change Pickup Location opens store locator and sets current store', async () => {
        render(
            <CheckoutPickup
                cart={baseCart as any}
                productsByItemId={productsByItemId}
                isEditing={true}
                onEdit={() => {}}
                onContinue={() => {}}
                continueButtonLabel="Continue"
            />,
            { wrapper }
        );
        const changeLink = screen.getByText('storePickup.changePickupLocation');
        await userEvent.click(changeLink);
        expect(mockSetSelectedStoreInfoRaw).toHaveBeenCalledWith(defaultStore);
        expect(mockOpenStoreLocator).toHaveBeenCalled();
    });

    test('displays new store name and address after pickup location is changed', () => {
        pickupContext.pickupStores.set(otherStore.id, otherStore as any);
        const cartWithNewStore: ShopperBasketsV2.schemas['Basket'] = {
            ...baseCart,
            shipments: [{ shipmentId: 'ship1', c_fromStoreId: otherStore.id }],
        } as ShopperBasketsV2.schemas['Basket'];

        const { rerender } = render(
            <CheckoutPickup
                cart={baseCart as any}
                productsByItemId={productsByItemId}
                isEditing={true}
                onEdit={() => {}}
                onContinue={() => {}}
                continueButtonLabel="Continue"
            />,
            { wrapper }
        );
        expect(screen.getByTestId('address-display')).toHaveTextContent(defaultStore.name);
        expect(screen.getByTestId('address-display')).toHaveTextContent(defaultStore.address1);

        rerender(
            <ConfigProvider config={mockConfig}>
                <SiteProvider
                    site={defaultMockSite}
                    locale={defaultMockLocale}
                    language={mockAltSiteObject.defaultLocale}
                    currency={mockAltSiteObject.defaultCurrency}>
                    <CheckoutPickup
                        cart={cartWithNewStore}
                        productsByItemId={productsByItemId}
                        isEditing={true}
                        onEdit={() => {}}
                        onContinue={() => {}}
                        continueButtonLabel="Continue"
                    />
                </SiteProvider>
            </ConfigProvider>
        );
        expect(screen.getByTestId('address-display')).toHaveTextContent(otherStore.name);
        expect(screen.getByTestId('address-display')).toHaveTextContent(otherStore.address1);
    });

    test('renders multiple products if present', () => {
        const multiProductCart = {
            ...baseCart,
            productItems: [
                { ...defaultProduct, itemId: 'item-1', shipmentId: 'ship1' },
                {
                    ...defaultProduct,
                    itemId: 'item-2',
                    name: 'Red Shirt',
                    productName: 'Red Shirt',
                    shipmentId: 'ship1',
                    attributes: [{ label: 'Color', value: 'Red' }],
                    variationValues: { color: 'Red', size: 'M' },
                    quantity: 1,
                    price: 49.99,
                    image: '/assets/red-shirt.png',
                },
            ],
        };
        const productsMap = {
            'item-1': defaultProduct,
            'item-2': {
                ...defaultProduct,
                name: 'Red Shirt',
                productName: 'Red Shirt',
                image: '/assets/red-shirt.png',
            },
        };
        render(
            <CheckoutPickup
                cart={multiProductCart as any}
                productsByItemId={productsMap}
                isEditing={true}
                onEdit={() => {}}
                onContinue={() => {}}
                continueButtonLabel="Continue"
            />,
            { wrapper }
        );
        expect(screen.getByText('Black Hat')).toBeInTheDocument();
        expect(screen.getByText('Red Shirt')).toBeInTheDocument();
    });
});
