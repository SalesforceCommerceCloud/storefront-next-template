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
import { describe, expect, test, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { ShopperBasketsV2 } from '@/scapi';
import { getTranslation } from '@salesforce/storefront-next-runtime/i18n';
import { OrderSummaryMobileAccordion } from './mobile-heading';
import {
    getOrderSummaryItemCount,
    getOrderSummaryMobileHeading,
    isOrderTotalEstimated,
    type OrderSummaryBasket,
} from './mobile-heading-utils';
import { AllProvidersWrapper } from '@/test-utils/context-provider';

vi.mock('@/lib/currency', () => ({
    formatCurrency: (amount: number) => `$${amount.toFixed(2)}`,
}));

describe('OrderSummary mobile heading helpers', () => {
    const { t } = getTranslation();
    const basket = {
        basketId: 'basket-1',
        orderTotal: 27.0,
        productItems: [
            { itemId: 'item-1', productId: 'p1', quantity: 2 },
            { itemId: 'item-2', productId: 'p2', quantity: 1 },
        ],
    } as ShopperBasketsV2.schemas['Basket'];

    test('getOrderSummaryItemCount sums product item quantities', () => {
        expect(getOrderSummaryItemCount(basket)).toBe(3);
        expect(
            getOrderSummaryItemCount({
                ...basket,
                productItems: [{ itemId: 'item-3', productId: 'p3', quantity: undefined }],
            })
        ).toBe(0);
    });

    test('isOrderTotalEstimated returns true when shipping is unknown', () => {
        expect(isOrderTotalEstimated({ ...basket, shippingTotal: undefined, taxTotal: 2.5 })).toBe(true);
    });

    test('isOrderTotalEstimated returns true when tax is unknown (net taxation)', () => {
        expect(isOrderTotalEstimated({ ...basket, shippingTotal: 5, taxTotal: undefined })).toBe(true);
        expect(isOrderTotalEstimated({ ...basket, shippingTotal: 5, taxTotal: -1 })).toBe(true);
    });

    test('isOrderTotalEstimated returns false when both shipping and tax are known', () => {
        expect(isOrderTotalEstimated({ ...basket, shippingTotal: 5, taxTotal: 2.5 })).toBe(false);
        expect(isOrderTotalEstimated({ ...basket, shippingTotal: 0, taxTotal: 0 })).toBe(false);
    });

    test('isOrderTotalEstimated returns false when taxation is gross (tax included in prices)', () => {
        expect(isOrderTotalEstimated({ ...basket, shippingTotal: 5, taxation: 'gross', taxTotal: undefined })).toBe(
            false
        );
    });

    test('getOrderSummaryMobileHeading uses estimated key by default', () => {
        const translate = vi.fn((key: string, options?: { count?: number }) => `${key}:${options?.count ?? 0}`);

        const heading = getOrderSummaryMobileHeading(translate as any, basket);

        expect(heading).toBe('summary.mobileHeading:3');
        expect(translate).toHaveBeenCalledWith('summary.mobileHeading', { count: 3 });
    });

    test('getOrderSummaryMobileHeading uses total key when isEstimate is false', () => {
        const translate = vi.fn((key: string, options?: { count?: number }) => `${key}:${options?.count ?? 0}`);

        const heading = getOrderSummaryMobileHeading(translate as any, basket, false);

        expect(heading).toBe('summary.mobileHeadingTotal:3');
        expect(translate).toHaveBeenCalledWith('summary.mobileHeadingTotal', { count: 3 });
    });

    test('OrderSummaryMobileAccordion renders single-line heading by default', () => {
        render(
            <AllProvidersWrapper>
                <OrderSummaryMobileAccordion basket={basket}>
                    <div data-testid="mobile-content">Mobile summary content</div>
                </OrderSummaryMobileAccordion>
            </AllProvidersWrapper>
        );

        expect(screen.getByText(t('cart:summary.mobileHeading', { count: 3 }))).toBeInTheDocument();
        expect(screen.queryByTestId('mobile-content')).not.toBeInTheDocument();
    });

    test('OrderSummaryMobileAccordion shows price alongside heading when showPrice is true', () => {
        render(
            <AllProvidersWrapper>
                <OrderSummaryMobileAccordion basket={basket} showPrice>
                    <div data-testid="mobile-content">Mobile summary content</div>
                </OrderSummaryMobileAccordion>
            </AllProvidersWrapper>
        );

        expect(screen.getByText(t('cart:summary.mobileHeading', { count: 3 }))).toBeInTheDocument();
        expect(screen.getByText('$27.00')).toBeInTheDocument();
        expect(screen.queryByTestId('mobile-content')).not.toBeInTheDocument();
    });

    test('OrderSummaryMobileAccordion renders non-estimated heading when isEstimate is false', () => {
        render(
            <AllProvidersWrapper>
                <OrderSummaryMobileAccordion basket={basket} isEstimate={false}>
                    <div data-testid="mobile-content">Mobile summary content</div>
                </OrderSummaryMobileAccordion>
            </AllProvidersWrapper>
        );

        expect(screen.getByText(t('cart:summary.mobileHeadingTotal', { count: 3 }))).toBeInTheDocument();
    });

    test('OrderSummaryMobileAccordion respects defaultExpanded', () => {
        render(
            <AllProvidersWrapper>
                <OrderSummaryMobileAccordion basket={basket as OrderSummaryBasket} defaultExpanded={true}>
                    <div data-testid="mobile-content">Mobile summary content</div>
                </OrderSummaryMobileAccordion>
            </AllProvidersWrapper>
        );

        const trigger = screen.getByRole('button');
        expect(trigger).toHaveAttribute('aria-expanded', 'true');
        expect(screen.getByTestId('mobile-content')).toBeInTheDocument();
    });

    // A caller (Cart) pins this accordion to the viewport with a fixed-position wrapper. Without
    // a bounded, scrollable content region, expanded content can be clipped by the viewport edge
    // at narrow widths / high zoom with no way to reach it (WCAG 1.4.10).
    test('OrderSummaryMobileAccordion applies contentClassName to the expanded content region', () => {
        render(
            <AllProvidersWrapper>
                <OrderSummaryMobileAccordion
                    basket={basket as OrderSummaryBasket}
                    defaultExpanded={true}
                    contentClassName="max-h-[40vh] overflow-y-auto">
                    <div data-testid="mobile-content">Mobile summary content</div>
                </OrderSummaryMobileAccordion>
            </AllProvidersWrapper>
        );

        const content = screen.getByTestId('mobile-content').parentElement;
        expect(content).toHaveClass('max-h-[40vh]', 'overflow-y-auto');
    });
});
