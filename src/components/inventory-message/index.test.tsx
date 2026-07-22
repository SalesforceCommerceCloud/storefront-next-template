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

import { render, screen } from '@testing-library/react';
import type { ShopperProducts } from '@/scapi';
import { vi } from 'vitest';
import InventoryMessage from './index';

describe('InventoryMessage', () => {
    const baseProduct: ShopperProducts.schemas['Product'] = {
        id: 'test-product',
        name: 'Test Product',
        price: 99.99,
        inventory: {
            id: 'test-inventory',
            ats: 10,
            orderable: true,
            backorderable: false,
            preorderable: false,
        },
    };

    it('renders bucketed in-stock message when product has stock', () => {
        render(<InventoryMessage product={baseProduct} />);

        expect(screen.getByText('In stock')).toBeInTheDocument();
        expect(screen.queryByText(/units/)).not.toBeInTheDocument();
    });

    it('renders bucketed in-stock message for perpetual inventory (ats=999999) without surfacing the count', () => {
        const perpetualProduct = {
            ...baseProduct,
            inventory: {
                id: 'test-inventory',
                ats: 999999,
                orderable: true,
                backorderable: false,
                preorderable: false,
            },
        };

        render(<InventoryMessage product={perpetualProduct} />);

        expect(screen.getByText('In stock')).toBeInTheDocument();
        expect(screen.queryByText(/999999/)).not.toBeInTheDocument();
        expect(screen.queryByText(/units/)).not.toBeInTheDocument();
    });

    it('renders generic in stock when status is in-stock but ATS is zero (no "0 units" copy)', () => {
        const productAtsZero = {
            ...baseProduct,
            inventory: {
                id: 'test-inventory',
                ats: 0,
                orderable: true,
                backorderable: false,
                preorderable: false,
            },
        };

        render(<InventoryMessage product={productAtsZero} getInventoryStatus={() => 'in-stock'} />);

        expect(screen.getByText('In stock')).toBeInTheDocument();
        expect(screen.queryByText(/0 units/)).not.toBeInTheDocument();
    });

    it('renders in-stock message without count when ats is undefined', () => {
        const productNoAts = {
            ...baseProduct,
            inventory: {
                id: 'test-inventory',
                orderable: true,
                backorderable: false,
                preorderable: false,
            },
        };

        // ats is undefined so custom status is needed (default logic requires ats > 0 for in-stock)
        render(<InventoryMessage product={productNoAts} getInventoryStatus={() => 'in-stock'} />);

        expect(screen.getByText('In stock')).toBeInTheDocument();
    });

    it('renders pre-order message when product is preorderable', () => {
        const preOrderProduct = {
            ...baseProduct,
            inventory: {
                id: 'test-inventory',
                ...baseProduct.inventory,
                preorderable: true,
                ats: 0,
            },
        };

        render(<InventoryMessage product={preOrderProduct} />);

        expect(screen.getByText('Available for pre-order')).toBeInTheDocument();
    });

    it('renders back-order message when product is backorderable', () => {
        const backOrderProduct = {
            ...baseProduct,
            inventory: {
                id: 'test-inventory',
                ...baseProduct.inventory,
                backorderable: true,
                ats: 0,
            },
        };

        render(<InventoryMessage product={backOrderProduct} />);

        expect(screen.getByText('Available for back order')).toBeInTheDocument();
    });

    it('renders out-of-stock message when product is not orderable', () => {
        const outOfStockProduct = {
            ...baseProduct,
            inventory: {
                id: 'test-inventory',
                ...baseProduct.inventory,
                orderable: false,
                ats: 0,
            },
        };

        render(<InventoryMessage product={outOfStockProduct} />);

        expect(screen.getByText('Out of stock')).toBeInTheDocument();
    });

    it('hides out-of-stock when product has variants but no variant is selected yet', () => {
        const masterShowsOosWithVariants = {
            ...baseProduct,
            inventory: {
                id: 'test-inventory',
                orderable: false,
                ats: 0,
                backorderable: false,
                preorderable: false,
            },
            variants: [
                {
                    productId: 'variant-a',
                    variationValues: { color: 'RED' },
                },
                {
                    productId: 'variant-b',
                    variationValues: { color: 'BLUE' },
                },
            ],
        } as ShopperProducts.schemas['Product'];

        render(<InventoryMessage product={masterShowsOosWithVariants} />);

        // The live region persists in the a11y tree (so the first stock message after a variant
        // is selected is announced) but renders empty while the status is unknown/hidden.
        const region = screen.getByRole('status');
        expect(region).not.toHaveAttribute('aria-hidden');
        expect(region).toBeEmptyDOMElement();
        expect(screen.queryByText('Inventory unavailable')).not.toBeInTheDocument();
    });

    it('shows out-of-stock for a variant product once currentVariant is resolved', () => {
        const masterShowsOosWithVariants = {
            ...baseProduct,
            inventory: {
                id: 'test-inventory',
                orderable: false,
                ats: 0,
                backorderable: false,
                preorderable: false,
            },
            variants: [
                {
                    productId: 'variant-a',
                    variationValues: { color: 'RED' },
                },
            ],
        } as ShopperProducts.schemas['Product'];

        const variant = {
            productId: 'variant-a',
            variationValues: { color: 'RED' },
            inventory: {
                id: 'variant-inv',
                orderable: false,
                ats: 0,
                backorderable: false,
                preorderable: false,
            },
        } as unknown as ShopperProducts.schemas['Variant'];

        render(<InventoryMessage product={masterShowsOosWithVariants} currentVariant={variant} />);

        expect(screen.getByText('Out of stock')).toBeInTheDocument();
    });

    it('does not use master inventory for OOS when variant is selected but inventory payload is not present yet', () => {
        const masterOos = {
            ...baseProduct,
            inventory: {
                id: 'master-inv',
                orderable: false,
                ats: 0,
                backorderable: false,
                preorderable: false,
            },
            variants: [
                {
                    productId: 'variant-in-stock',
                    orderable: true,
                    variationValues: { color: 'RED' },
                },
            ],
        } as ShopperProducts.schemas['Product'];

        const variant = {
            productId: 'variant-in-stock',
            orderable: true,
            variationValues: { color: 'RED' },
        } as ShopperProducts.schemas['Variant'];

        render(<InventoryMessage product={masterOos} currentVariant={variant} />);

        expect(screen.getByText('In stock')).toBeInTheDocument();
    });

    it('falls back to in-stock when variant has no inventory but master is orderable with ATS', () => {
        const master = {
            ...baseProduct,
            inventory: {
                id: 'master-inv',
                orderable: true,
                ats: 24,
                backorderable: false,
                preorderable: false,
            },
            variants: [
                {
                    productId: 'variant-sku',
                    orderable: true,
                    variationValues: { color: 'RED' },
                },
            ],
        } as ShopperProducts.schemas['Product'];

        const variant = {
            productId: 'variant-sku',
            orderable: true,
            variationValues: { color: 'RED' },
        } as ShopperProducts.schemas['Variant'];

        render(<InventoryMessage product={master} currentVariant={variant} />);

        expect(screen.getByText('In stock')).toBeInTheDocument();
    });

    it('shows out-of-stock when variant is orderable false and has no inventory object', () => {
        const master = {
            ...baseProduct,
            inventory: {
                id: 'master-inv',
                ats: 100,
                orderable: true,
                backorderable: false,
                preorderable: false,
            },
            variants: [
                {
                    productId: 'variant-oos',
                    orderable: false,
                    variationValues: { color: 'RED' },
                },
            ],
        } as ShopperProducts.schemas['Product'];

        const variant = {
            productId: 'variant-oos',
            orderable: false,
            variationValues: { color: 'RED' },
        } as ShopperProducts.schemas['Variant'];

        render(<InventoryMessage product={master} currentVariant={variant} />);

        expect(screen.getByText('Out of stock')).toBeInTheDocument();
    });

    it('renders out-of-stock message when product has no stock and is not backorderable', () => {
        const outOfStockProduct = {
            ...baseProduct,
            inventory: {
                id: 'test-inventory',
                ...baseProduct.inventory,
                ats: 0,
                backorderable: false,
            },
        };

        render(<InventoryMessage product={outOfStockProduct} />);

        expect(screen.getByText('Out of stock')).toBeInTheDocument();
    });

    it('uses variant inventory when currentVariant is provided', () => {
        const variant = {
            productId: 'test-product',
            variationValues: {},
            inventory: {
                id: 'variant-inventory',
                ats: 0,
                orderable: true,
                backorderable: true,
                preorderable: false,
            },
        } as unknown as ShopperProducts.schemas['Variant'];

        render(<InventoryMessage product={baseProduct} currentVariant={variant} />);

        expect(screen.getByText('Available for back order')).toBeInTheDocument();
    });

    it('renders an empty persistent live region when no inventory data is available (unknown status hidden by default)', () => {
        const productWithoutInventory = {
            ...baseProduct,
            inventory: undefined,
        };

        render(<InventoryMessage product={productWithoutInventory} />);

        // The live region stays in the a11y tree (never aria-hidden) so a later status change is
        // announced, but it holds no content while the status is unknown/hidden.
        const region = screen.getByRole('status');
        expect(region).not.toHaveAttribute('aria-hidden');
        expect(region).toBeEmptyDOMElement();
        expect(screen.queryByText('Inventory unavailable')).not.toBeInTheDocument();
    });

    it('renders visible unknown status message when showUnknownStatus is true', () => {
        const productWithoutInventory = {
            ...baseProduct,
            inventory: undefined,
        };

        render(<InventoryMessage product={productWithoutInventory} showUnknownStatus={true} />);

        // The text should be visible and accessible
        expect(screen.getByText('Inventory unavailable')).toBeInTheDocument();
        // Should not have aria-hidden attribute
        expect(screen.getByText('Inventory unavailable')).not.toHaveAttribute('aria-hidden');
    });

    describe('low stock', () => {
        it('renders "Few items left" when stock is at or below threshold and above 1', () => {
            const lowStockProduct = {
                ...baseProduct,
                inventory: {
                    id: 'test-inventory',
                    ats: 3,
                    orderable: true,
                    backorderable: false,
                    preorderable: false,
                },
            };

            render(<InventoryMessage product={lowStockProduct} lowStockThreshold={5} />);

            expect(screen.getByText('Few items left')).toBeInTheDocument();
        });

        it('renders "Few items left" at the exact threshold', () => {
            const lowStockProduct = {
                ...baseProduct,
                inventory: {
                    id: 'test-inventory',
                    ats: 5,
                    orderable: true,
                    backorderable: false,
                    preorderable: false,
                },
            };

            render(<InventoryMessage product={lowStockProduct} lowStockThreshold={5} />);

            expect(screen.getByText('Few items left')).toBeInTheDocument();
        });

        it('renders "1 item left" when only one unit remains', () => {
            const oneLeftProduct = {
                ...baseProduct,
                inventory: {
                    id: 'test-inventory',
                    ats: 1,
                    orderable: true,
                    backorderable: false,
                    preorderable: false,
                },
            };

            render(<InventoryMessage product={oneLeftProduct} lowStockThreshold={5} />);

            expect(screen.getByText('1 item left')).toBeInTheDocument();
        });

        it('renders in-stock message when stock is above threshold', () => {
            render(<InventoryMessage product={baseProduct} lowStockThreshold={5} />);

            expect(screen.getByText('In stock')).toBeInTheDocument();
        });

        it('does not show low-stock when threshold is 0 (default)', () => {
            const lowStockProduct = {
                ...baseProduct,
                inventory: {
                    id: 'test-inventory',
                    ats: 3,
                    orderable: true,
                    backorderable: false,
                    preorderable: false,
                },
            };

            render(<InventoryMessage product={lowStockProduct} />);

            expect(screen.getByText('In stock')).toBeInTheDocument();
        });
    });

    describe('custom getInventoryStatus function', () => {
        it('uses custom getInventoryStatus function when provided', () => {
            const customGetInventoryStatus = vi.fn().mockReturnValue('in-stock');

            render(<InventoryMessage product={baseProduct} getInventoryStatus={customGetInventoryStatus} />);

            expect(customGetInventoryStatus).toHaveBeenCalledWith(baseProduct, undefined);
            expect(screen.getByText('In stock')).toBeInTheDocument();
        });

        it('uses custom getInventoryStatus function with variant when provided', () => {
            const variant = {
                productId: 'test-product',
                variationValues: {},
                inventory: {
                    id: 'variant-inventory',
                    ats: 0,
                    orderable: true,
                    backorderable: true,
                    preorderable: false,
                },
            } as unknown as ShopperProducts.schemas['Variant'];

            const customGetInventoryStatus = vi.fn().mockReturnValue('back-order');

            render(
                <InventoryMessage
                    product={baseProduct}
                    currentVariant={variant}
                    getInventoryStatus={customGetInventoryStatus}
                />
            );

            expect(customGetInventoryStatus).toHaveBeenCalledWith(baseProduct, variant);
            expect(screen.getByText('Available for back order')).toBeInTheDocument();
        });

        it('renders an empty persistent live region when custom getInventoryStatus returns unknown', () => {
            const customGetInventoryStatus = vi.fn().mockReturnValue('unknown');

            render(<InventoryMessage product={baseProduct} getInventoryStatus={customGetInventoryStatus} />);

            expect(customGetInventoryStatus).toHaveBeenCalledWith(baseProduct, undefined);

            // The live region persists (never aria-hidden) but holds no content while unknown/hidden.
            const region = screen.getByRole('status');
            expect(region).not.toHaveAttribute('aria-hidden');
            expect(region).toBeEmptyDOMElement();
            expect(screen.queryByText('Inventory unavailable')).not.toBeInTheDocument();
        });

        it('renders visible unknown status when custom getInventoryStatus returns unknown and showUnknownStatus is true', () => {
            const customGetInventoryStatus = vi.fn().mockReturnValue('unknown');

            render(
                <InventoryMessage
                    product={baseProduct}
                    getInventoryStatus={customGetInventoryStatus}
                    showUnknownStatus={true}
                />
            );

            expect(customGetInventoryStatus).toHaveBeenCalledWith(baseProduct, undefined);
            // The text should be visible and accessible
            expect(screen.getByText('Inventory unavailable')).toBeInTheDocument();
            // Should not have aria-hidden attribute
            expect(screen.getByText('Inventory unavailable')).not.toHaveAttribute('aria-hidden');
        });

        it('falls back to default getInventoryStatus when custom function is not provided', () => {
            render(<InventoryMessage product={baseProduct} />);

            expect(screen.getByText('In stock')).toBeInTheDocument();
        });
    });

    describe('non-color cues', () => {
        it('provides a screen-reader cue for in-stock status', () => {
            const product: ShopperProducts.schemas['Product'] = {
                id: 'test-product',
                inventory: { id: 'inv-1', orderable: true, ats: 10 },
            };

            render(<InventoryMessage product={product} />);

            // The sr-only span carries the status meaning independent of color.
            const message = screen.getByText(/in stock/i);
            const srOnlyText = message.querySelector('.sr-only');
            expect(srOnlyText).toHaveTextContent(/available/i);
        });

        it('provides a screen-reader cue for low-stock status', () => {
            const product: ShopperProducts.schemas['Product'] = {
                id: 'test-product',
                inventory: { id: 'inv-1', orderable: true, ats: 1 },
            };

            render(<InventoryMessage product={product} lowStockThreshold={5} />);

            const message = screen.getByText(/item left/i);
            const srOnlyText = message.querySelector('.sr-only');
            expect(srOnlyText).toHaveTextContent(/limited availability/i);
        });

        it('provides a screen-reader cue for out-of-stock status', () => {
            const product: ShopperProducts.schemas['Product'] = {
                id: 'test-product',
                inventory: { id: 'inv-1', orderable: false, ats: 0 },
            };

            render(<InventoryMessage product={product} />);

            const message = screen.getByText(/out of stock/i);
            const srOnlyText = message.querySelector('.sr-only');
            expect(srOnlyText).toHaveTextContent(/not available/i);
        });

        it('provides an sr-only prefix for pre-order status', () => {
            const product: ShopperProducts.schemas['Product'] = {
                id: 'test-product',
                inventory: { id: 'inv-1', orderable: true, preorderable: true, ats: 5 },
            };

            render(<InventoryMessage product={product} />);

            const srOnlyPrefix = screen.getByText('Pre-order:');
            expect(srOnlyPrefix).toHaveClass('sr-only');
            expect(screen.getByText(/available for pre.?order/i)).toBeInTheDocument();
        });

        it('provides an sr-only prefix for back-order status', () => {
            const product: ShopperProducts.schemas['Product'] = {
                id: 'test-product',
                inventory: { id: 'inv-1', orderable: true, backorderable: true, ats: 0 },
            };

            render(<InventoryMessage product={product} />);

            const srOnlyPrefix = screen.getByText('Back order:');
            expect(srOnlyPrefix).toHaveClass('sr-only');
            expect(screen.getByText(/available for back.?order/i)).toBeInTheDocument();
        });

        it('hides the color indicator dot from screen readers', () => {
            const product: ShopperProducts.schemas['Product'] = {
                id: 'test-product',
                inventory: { id: 'inv-1', orderable: true, ats: 10 },
            };

            const { container } = render(<InventoryMessage product={product} />);

            const dot = container.querySelector('[aria-hidden="true"].h-2.w-2');
            expect(dot).toBeInTheDocument();
        });

        it('applies the correct status color class for each status', () => {
            const testCases = [
                { inventory: { id: 'inv-1', orderable: true, ats: 10 }, expectedClass: 'text-status-positive' },
                {
                    inventory: { id: 'inv-1', orderable: true, ats: 1 },
                    expectedClass: 'text-status-warning',
                    lowStockThreshold: 5,
                },
                { inventory: { id: 'inv-1', orderable: false, ats: 0 }, expectedClass: 'text-status-critical' },
                {
                    inventory: { id: 'inv-1', orderable: true, preorderable: true, ats: 5 },
                    expectedClass: 'text-status-info',
                },
                {
                    inventory: { id: 'inv-1', orderable: true, backorderable: true, ats: 0 },
                    expectedClass: 'text-status-warning',
                },
            ];

            testCases.forEach(({ inventory, expectedClass, lowStockThreshold }) => {
                const { container, unmount } = render(
                    <InventoryMessage product={{ id: 'test', inventory }} lowStockThreshold={lowStockThreshold} />
                );

                expect(container.querySelector('p')).toHaveClass(expectedClass);
                unmount();
            });
        });
    });
});
