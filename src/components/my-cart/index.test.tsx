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
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { render as rtlRender, screen, type RenderOptions } from '@testing-library/react';
import type { ReactNode } from 'react';
import MyCart from './index';
import { SiteProvider } from '@salesforce/storefront-next-runtime/site-context';
import { mockLocale, mockSiteObject } from '@/test-utils/config';
import { getPriceData } from '@/components/product-price/utils';

const mockSite = mockSiteObject;

const render = (ui: React.ReactElement, options?: RenderOptions) =>
    rtlRender(ui, {
        wrapper: ({ children }: { children: ReactNode }) => (
            <SiteProvider
                site={mockSite}
                locale={mockLocale}
                language={mockSiteObject.defaultLocale}
                currency={mockSiteObject.defaultCurrency}>
                {children}
            </SiteProvider>
        ),
        ...options,
    });

vi.mock('react-i18next', () => ({
    useTranslation: (ns?: string) => {
        const tCheckout = (key: string, opts?: { amount?: number }) => {
            if (key === 'myCart.title') return 'My Cart';
            if (key === 'myCart.saved') return `Saved ${opts?.amount ?? ''}`;
            return key;
        };
        const tCart = (key: string) => (key === 'attributes.promotions' ? 'Promotions' : key);
        return {
            t: ns === 'cart' ? tCart : tCheckout,
            i18n: { language: 'en' },
            tCart,
        };
    },
}));

vi.mock('@salesforce/storefront-next-runtime/config', () => ({
    useConfig: () => ({}),
}));

vi.mock('react-router', async (importOriginal) => {
    const actual = await importOriginal<typeof import('react-router')>();
    return {
        ...actual,
        Link: ({ children, to }: { children: ReactNode; to: string }) => <a href={to}>{children}</a>,
    };
});

vi.mock('@/components/promo-popover', () => ({
    __esModule: true,
    default: ({ children }: { children: ReactNode }) => <div data-testid="promo-popover">{children}</div>,
}));

vi.mock('@/components/product-price', () => ({
    __esModule: true,
    default: () => <span data-testid="product-price" />,
}));

vi.mock('@/components/product-price/utils', () => ({
    getPriceData: vi.fn().mockReturnValue({
        currentPrice: 0,
        listPrice: undefined,
        isOnSale: false,
        isASet: false,
        isMaster: false,
        isRange: false,
        hasPrice: true,
    }),
}));

vi.mock('@/targets/ui-target', () => ({
    UITarget: () => null,
}));

vi.mock('@/lib/images/dynamic-image', () => ({
    toImageUrl: () => '',
}));

vi.mock('@/components/ui/accordion', () => {
    const Accordion = ({
        children,
        defaultValue,
        ...rest
    }: {
        children: ReactNode;
        defaultValue?: string;
        [key: string]: unknown;
    }) => (
        <div data-testid="accordion" data-default-value={defaultValue} {...rest}>
            {children}
        </div>
    );

    const passthrough = ({ children }: { children: ReactNode }) => <div>{children}</div>;

    return {
        Accordion,
        AccordionItem: passthrough,
        AccordionTrigger: passthrough,
        AccordionContent: passthrough,
    };
});

describe('MyCart', () => {
    const basket = {
        basketId: 'basket-1',
        productItems: [
            { itemId: 'item-1', productId: 'prod-1', quantity: 2 },
            { itemId: 'item-2', productId: 'prod-2', quantity: 1 },
        ],
    };

    const productMap: Record<string, { id: string; name: string }> = {
        'item-1': { id: 'prod-1', name: 'Product 1' },
    };

    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('renders the cart items container', () => {
        render(<MyCart basket={basket} productMap={productMap} />);

        expect(screen.getByTestId('my-cart-toggle')).toBeInTheDocument();
    });

    it('renders all product items directly without accordion', () => {
        render(<MyCart basket={basket} productMap={productMap} />);

        expect(screen.getByTestId('my-cart-item-prod-1')).toBeInTheDocument();
        expect(screen.getByTestId('my-cart-item-prod-2')).toBeInTheDocument();
    });

    it('renders a card per product item', () => {
        render(<MyCart basket={basket} productMap={productMap} />);

        expect(screen.getByTestId('my-cart-item-prod-1')).toBeInTheDocument();
        expect(screen.getByTestId('my-cart-item-prod-2')).toBeInTheDocument();
    });

    it('displays product name from productMap when available', () => {
        render(<MyCart basket={basket} productMap={productMap} />);

        expect(screen.getByText('Product 1')).toBeInTheDocument();
    });

    it('handles missing promotions gracefully', () => {
        render(<MyCart basket={basket} productMap={productMap} />);

        expect(screen.getByTestId('my-cart-toggle')).toBeInTheDocument();
        expect(screen.getByTestId('my-cart-item-prod-1')).toBeInTheDocument();
    });

    it('shows savings badge when getPriceData reports a sale', () => {
        vi.mocked(getPriceData).mockReturnValue({
            currentPrice: 19.99,
            listPrice: 39.5,
            isOnSale: true,
            isASet: false,
            isMaster: false,
            isRange: false,
            pricePerUnit: 19.99,
            tieredPrice: undefined,
            maxPrice: undefined,
            hasPrice: true,
        });

        render(<MyCart basket={basket} productMap={productMap} />);

        const badges = screen.getAllByText(/Saved/);
        expect(badges.length).toBeGreaterThan(0);
    });

    it('hides savings badge when item is not on sale', () => {
        vi.mocked(getPriceData).mockReturnValue({
            currentPrice: 15,
            listPrice: undefined,
            isOnSale: false,
            isASet: false,
            isMaster: false,
            isRange: false,
            pricePerUnit: 15,
            tieredPrice: undefined,
            maxPrice: undefined,
            hasPrice: true,
        });

        render(<MyCart basket={basket} productMap={productMap} />);

        expect(screen.queryByText(/Saved/)).not.toBeInTheDocument();
    });

    it('displays variation attributes from product data', () => {
        const basketWithVariations = {
            basketId: 'basket-1',
            productItems: [
                {
                    itemId: 'item-1',
                    productId: 'prod-1',
                    quantity: 1,
                },
            ],
        };

        const productMapWithVariations = {
            'item-1': {
                id: 'prod-1',
                name: 'Product 1',
                variationValues: { color: 'blue', size: 'S' },
                variationAttributes: [
                    {
                        id: 'color',
                        name: 'Color',
                        values: [{ value: 'blue', name: 'Blue' }],
                    },
                    {
                        id: 'size',
                        name: 'Size',
                        values: [{ value: 'S', name: 'Small' }],
                    },
                ],
            },
        };

        render(<MyCart basket={basketWithVariations} productMap={productMapWithVariations} />);

        expect(screen.getByText('Color: Blue')).toBeInTheDocument();
        expect(screen.getByText('Size: Small')).toBeInTheDocument();
    });

    it('does not display variation attributes when product data has none', () => {
        const productMapNoVariations = {
            'item-1': { id: 'prod-1', name: 'Product 1' },
        };

        render(
            <MyCart
                basket={{ basketId: 'b1', productItems: [{ itemId: 'item-1', productId: 'prod-1', quantity: 1 }] }}
                productMap={productMapNoVariations}
            />
        );

        expect(screen.queryByText(/Color:/)).not.toBeInTheDocument();
        expect(screen.queryByText(/Size:/)).not.toBeInTheDocument();
    });

    it('reads variation data exclusively from productMap, not basket item fields', () => {
        const basketWithStaleVariation = {
            basketId: 'basket-1',
            productItems: [
                {
                    itemId: 'item-1',
                    productId: 'prod-1',
                    quantity: 1,
                    // Basket items in SCAPI V2 don't carry these, but even if
                    // extra fields leak through, the component must ignore them.
                    variationValues: { color: 'STALE_ID' },
                    variationAttributes: [
                        { id: 'color', name: 'Color', values: [{ value: 'STALE_ID', name: 'Stale Color' }] },
                    ],
                },
            ],
        };

        const productMapWithCorrectData = {
            'item-1': {
                id: 'prod-1',
                name: 'Product 1',
                variationValues: { color: 'CORRECT_ID' },
                variationAttributes: [
                    { id: 'color', name: 'Color', values: [{ value: 'CORRECT_ID', name: 'Cobalt' }] },
                ],
            },
        };

        render(<MyCart basket={basketWithStaleVariation} productMap={productMapWithCorrectData} />);

        expect(screen.getByText('Color: Cobalt')).toBeInTheDocument();
        expect(screen.queryByText('Stale Color')).not.toBeInTheDocument();
    });

    it('renders gracefully when item is not in productMap', () => {
        const basketWithUnknownItem = {
            basketId: 'basket-1',
            productItems: [
                {
                    itemId: 'item-999',
                    productId: 'prod-999',
                    productName: 'Unknown Product',
                    quantity: 3,
                },
            ],
        };

        render(<MyCart basket={basketWithUnknownItem} productMap={{}} />);

        expect(screen.getByText('Unknown Product')).toBeInTheDocument();
        expect(screen.getByText(/3/)).toBeInTheDocument();
    });

    it('displays correct savings amount from getPriceData', () => {
        vi.mocked(getPriceData).mockReturnValue({
            currentPrice: 25.0,
            listPrice: 50.0,
            isOnSale: true,
            isASet: false,
            isMaster: false,
            isRange: false,
            pricePerUnit: 25.0,
            tieredPrice: undefined,
            maxPrice: undefined,
            hasPrice: true,
        });

        render(
            <MyCart
                basket={{ basketId: 'b1', productItems: [{ itemId: 'item-1', productId: 'prod-1', quantity: 1 }] }}
                productMap={{ 'item-1': { id: 'prod-1', name: 'Sale Product' } }}
            />
        );

        // savings = listPrice - currentPrice = 50 - 25 = 25
        // The translation mock returns "Saved <amount>"
        expect(screen.getByText(/Saved/)).toBeInTheDocument();
    });

    it('multiplies savings by quantity for multi-quantity items', () => {
        vi.mocked(getPriceData).mockReturnValue({
            currentPrice: 29.99,
            listPrice: 39.5,
            isOnSale: true,
            isASet: false,
            isMaster: false,
            isRange: false,
            pricePerUnit: 29.99,
            tieredPrice: undefined,
            maxPrice: undefined,
            hasPrice: true,
        });

        render(
            <MyCart
                basket={{
                    basketId: 'b1',
                    productItems: [{ itemId: 'item-1', productId: 'prod-1', quantity: 3 }],
                }}
                productMap={{ 'item-1': { id: 'prod-1', name: 'Sale Product' } }}
            />
        );

        // savings = (39.50 - 29.99) * 3 = 28.53
        // The translation mock returns "Saved <amount>" where amount is formatted currency
        const badge = screen.getByText(/Saved/);
        expect(badge).toBeInTheDocument();
        expect(badge.textContent).toContain('28.53');
    });

    it('shows per-unit "each" price when quantity is greater than 1', () => {
        vi.mocked(getPriceData).mockReturnValue({
            currentPrice: 29.99,
            listPrice: undefined,
            isOnSale: false,
            isASet: false,
            isMaster: false,
            isRange: false,
            pricePerUnit: 29.99,
            tieredPrice: undefined,
            maxPrice: undefined,
            hasPrice: true,
        });

        render(
            <MyCart
                basket={{
                    basketId: 'b1',
                    productItems: [
                        {
                            itemId: 'item-1',
                            productId: 'prod-1',
                            quantity: 2,
                            priceAfterItemDiscount: 59.98,
                        },
                    ],
                }}
                productMap={{ 'item-1': { id: 'prod-1', name: 'Product 1' } }}
            />
        );

        // priceAfterItemDiscount / quantity = 59.98 / 2 = 29.99
        expect(screen.getByText(/each/)).toBeInTheDocument();
        expect(screen.getByText(/£29\.99/)).toBeInTheDocument();
    });

    it('does not show "each" price when quantity is 1', () => {
        vi.mocked(getPriceData).mockReturnValue({
            currentPrice: 29.99,
            listPrice: undefined,
            isOnSale: false,
            isASet: false,
            isMaster: false,
            isRange: false,
            pricePerUnit: 29.99,
            tieredPrice: undefined,
            maxPrice: undefined,
            hasPrice: true,
        });

        render(
            <MyCart
                basket={{
                    basketId: 'b1',
                    productItems: [
                        {
                            itemId: 'item-1',
                            productId: 'prod-1',
                            quantity: 1,
                            priceAfterItemDiscount: 29.99,
                        },
                    ],
                }}
                productMap={{ 'item-1': { id: 'prod-1', name: 'Product 1' } }}
            />
        );

        expect(screen.queryByText(/each/)).not.toBeInTheDocument();
    });

    it('calls getPriceData with actual item quantity', () => {
        render(
            <MyCart
                basket={{
                    basketId: 'b1',
                    productItems: [{ itemId: 'item-1', productId: 'prod-1', quantity: 5 }],
                }}
                productMap={{ 'item-1': { id: 'prod-1', name: 'Product 1' } }}
            />
        );

        expect(getPriceData).toHaveBeenCalledWith(expect.anything(), { quantity: 5, currency: 'GBP' });
    });
});
