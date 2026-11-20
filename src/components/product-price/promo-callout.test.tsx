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

import { describe, test, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import PromoCallout from './promo-callout';
import type { ShopperProducts } from '@/scapi';

describe('PromoCallout', () => {
    const baseMockProduct: ShopperProducts.schemas['Product'] = {
        id: 'test-product',
        name: 'Test Product',
        price: 29.99,
        type: {},
    };

    test('renders nothing when promotion has no calloutMsg', () => {
        const productWithEmptyPromo: ShopperProducts.schemas['Product'] = {
            ...baseMockProduct,
            productPromotions: [
                {
                    promotionId: 'test-promo',
                    promotionalPrice: 25.99,
                    calloutMsg: '',
                },
            ],
        };

        render(<PromoCallout product={productWithEmptyPromo} />);
        // Should not render any visible text when calloutMsg is empty
        expect(screen.queryByText(/.+/)).not.toBeInTheDocument();
    });

    test('renders plain text callout message', () => {
        const productWithTextPromo: ShopperProducts.schemas['Product'] = {
            ...baseMockProduct,
            productPromotions: [
                {
                    promotionId: '10offRollSleeveBlouse',
                    promotionalPrice: 25.99,
                    calloutMsg: '10$ Off roll sleeve blouse',
                },
            ],
        };

        render(<PromoCallout product={productWithTextPromo} />);
        expect(screen.getByText('10$ Off roll sleeve blouse')).toBeInTheDocument();
    });

    test('renders callout message with HTML formatting', () => {
        const productWithHtmlPromo: ShopperProducts.schemas['Product'] = {
            ...baseMockProduct,
            productPromotions: [
                {
                    promotionId: '10offRollSleeveBlouse',
                    promotionalPrice: 25.99,
                    calloutMsg: '<p>10$ Off roll <strong>sleeve</strong> blouse</p>',
                },
            ],
        };

        render(<PromoCallout product={productWithHtmlPromo} />);

        expect(
            screen.getByText((_, element) => {
                return element?.textContent === '10$ Off roll sleeve blouse' && element?.tagName.toLowerCase() === 'p';
            })
        ).toBeInTheDocument();
        expect(screen.getByText('sleeve')).toBeInTheDocument();
    });

    test('renders every native qualified offer without inferring precedence', () => {
        const productWithMultiplePromos: ShopperProducts.schemas['Product'] = {
            ...baseMockProduct,
            productPromotions: [
                {
                    promotionId: 'first-promo',
                    promotionalPrice: 20.99,
                    calloutMsg: 'First promotion message',
                },
                {
                    promotionId: 'second-promo',
                    promotionalPrice: 25.99,
                    calloutMsg: 'Second promotion message',
                },
            ],
        };

        render(<PromoCallout product={productWithMultiplePromos} />);
        expect(screen.getByText('First promotion message')).toBeInTheDocument();
        expect(screen.getByText('Second promotion message')).toBeInTheDocument();
    });

    test('retains the first message per offer and native display order across SKU and parent', () => {
        const { container } = render(
            <PromoCallout
                product={
                    {
                        ...baseMockProduct,
                        productPromotions: [
                            { promotionId: 'local', calloutMsg: '<b>SKU offer</b>' },
                            { calloutMsg: 'Offer without ID' },
                            { promotionId: 'empty', calloutMsg: '' },
                        ],
                    } as unknown as ShopperProducts.schemas['Product']
                }
                parentProduct={
                    {
                        id: 'parent',
                        productPromotions: [
                            { promotionId: 'local', calloutMsg: 'Duplicate parent message' },
                            { calloutMsg: 'Offer without ID' },
                            { promotionId: 'group', calloutMsg: 'Group gift' },
                        ],
                    } as unknown as ShopperProducts.schemas['Product']
                }
            />
        );
        expect(Array.from(container.querySelectorAll('span'), (span) => span.innerHTML)).toEqual([
            '<b>SKU offer</b>',
            'Offer without ID',
            'Group gift',
        ]);
        expect(container.querySelectorAll('span.block')).toHaveLength(3);
    });

    test('handles script tags safely (scripts do not execute via innerHTML)', () => {
        const productWithScriptTag: ShopperProducts.schemas['Product'] = {
            ...baseMockProduct,
            productPromotions: [
                {
                    promotionId: 'script-promo',
                    promotionalPrice: 25.99,
                    calloutMsg: '<script>alert("test")</script>Safe content <strong>here</strong>',
                },
            ],
        };

        render(<PromoCallout product={productWithScriptTag} />);

        // Should render the safe text content parts
        expect(screen.getByText('Safe content')).toBeInTheDocument();
        expect(screen.getByText('here')).toBeInTheDocument();
        // Script content should not be rendered as text
        expect(screen.queryByText('alert("test")')).not.toBeInTheDocument();
    });

    test('handles variant products with promotions from findLowestPrice', () => {
        const masterProductWithVariants: ShopperProducts.schemas['Product'] = {
            ...baseMockProduct,
            hitType: 'master' as const,
            type: { master: true },
            variants: [
                {
                    productId: 'variant-1',
                    price: 20.99,
                    productPromotions: [
                        {
                            promotionId: 'variant-promo',
                            promotionalPrice: 18.99,
                            calloutMsg: 'Variant promotion message',
                        },
                    ],
                } as any,
            ],
        };

        render(<PromoCallout product={masterProductWithVariants} />);
        expect(screen.getByText('Variant promotion message')).toBeInTheDocument();
    });
});

test('preserves parent and variant qualified callouts, including conditional gift offers, without duplicates', () => {
    const allStore = { promotionId: 'all-store', calloutMsg: 'All stores coupon' };
    render(
        <PromoCallout
            product={
                {
                    id: 'master',
                    type: { master: true },
                    price: 16,
                    productPromotions: [allStore, { promotionId: 'group', calloutMsg: 'Group threshold gift' }],
                    variants: [
                        {
                            productId: 'variant',
                            price: 16,
                            productPromotions: [allStore, { promotionId: 'individual', calloutMsg: 'Local offer' }],
                        },
                    ],
                } as unknown as ShopperProducts.schemas['Product']
            }
        />
    );
    expect(screen.getAllByText('All stores coupon')).toHaveLength(1);
    expect(screen.getByText('Group threshold gift')).toBeVisible();
    expect(screen.getByText('Local offer')).toBeVisible();
});
