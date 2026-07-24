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
import {
    ExpressPaymentsSkeleton,
    ContactInfoSkeleton,
    ShippingAddressSkeleton,
    ShippingOptionsSkeleton,
    PaymentSkeleton,
    PickupSkeleton,
    OrderSummarySkeleton,
    MyCartSkeleton,
} from './checkout-skeletons';

describe('Checkout Skeleton Components', () => {
    describe('ExpressPaymentsSkeleton', () => {
        it('should render without crashing', () => {
            render(<ExpressPaymentsSkeleton />);
            expect(screen.getByTestId('express-payments-skeleton')).toBeInTheDocument();
        });

        it('should render 5 payment button skeletons', () => {
            const { container } = render(<ExpressPaymentsSkeleton />);
            const skeletons = container.querySelectorAll('.h-9');
            expect(skeletons.length).toBe(5);
        });
    });

    describe('ContactInfoSkeleton', () => {
        it('should render without crashing', () => {
            const { container } = render(<ContactInfoSkeleton />);
            expect(
                container.querySelector('[data-testid="card"]') || container.querySelector('.border-ui')
            ).toBeInTheDocument();
        });

        it('should render form field skeletons', () => {
            const { container } = render(<ContactInfoSkeleton />);
            // Should have email field (h-12), phone country code (h-12), phone number (h-12), button (h-12)
            const formFields = container.querySelectorAll('.h-12');
            expect(formFields.length).toBeGreaterThanOrEqual(3);
        });
    });

    describe('ShippingAddressSkeleton', () => {
        it('should render without crashing', () => {
            const { container } = render(<ShippingAddressSkeleton />);
            expect(
                container.querySelector('[data-testid="card"]') || container.querySelector('.border-ui')
            ).toBeInTheDocument();
        });

        it('should render address form field skeletons', () => {
            const { container } = render(<ShippingAddressSkeleton />);
            // Multiple h-12 skeletons for form fields
            const formFields = container.querySelectorAll('.h-12');
            expect(formFields.length).toBeGreaterThanOrEqual(5);
        });
    });

    describe('ShippingOptionsSkeleton', () => {
        it('should render without crashing', () => {
            const { container } = render(<ShippingOptionsSkeleton />);
            expect(
                container.querySelector('[data-testid="card"]') || container.querySelector('.border-ui')
            ).toBeInTheDocument();
        });

        it('should render shipping method option skeletons', () => {
            const { container } = render(<ShippingOptionsSkeleton />);
            // Should have 2 shipping options with radio buttons
            const radioSkeletons = container.querySelectorAll('.rounded-full');
            expect(radioSkeletons.length).toBe(2);
        });
    });

    describe('PaymentSkeleton', () => {
        it('should render without crashing', () => {
            const { container } = render(<PaymentSkeleton />);
            expect(
                container.querySelector('[data-testid="card"]') || container.querySelector('.border-ui')
            ).toBeInTheDocument();
        });

        it('should render payment form field skeletons', () => {
            const { container } = render(<PaymentSkeleton />);
            // Card number, expiry, CVV, checkbox
            const formFields = container.querySelectorAll('.h-12');
            expect(formFields.length).toBeGreaterThanOrEqual(3);
        });
    });

    describe('PickupSkeleton', () => {
        it('should render without crashing', () => {
            const { container } = render(<PickupSkeleton />);
            expect(
                container.querySelector('[data-testid="card"]') || container.querySelector('.border-ui')
            ).toBeInTheDocument();
        });
    });

    describe('OrderSummarySkeleton', () => {
        it('should render without crashing', () => {
            render(<OrderSummarySkeleton />);
            expect(screen.getByTestId('order-summary-skeleton')).toBeInTheDocument();
        });

        it('should render pricing row skeletons', () => {
            const { container } = render(<OrderSummarySkeleton />);
            // Should have at least 3 pricing rows (subtotal, shipping, tax)
            const pricingRows = container.querySelectorAll('.justify-between');
            expect(pricingRows.length).toBeGreaterThanOrEqual(3);
        });
    });

    describe('MyCartSkeleton', () => {
        it('should render without crashing', () => {
            render(<MyCartSkeleton />);
            expect(screen.getByTestId('my-cart-skeleton')).toBeInTheDocument();
        });

        it('should render default number of cart items', () => {
            render(<MyCartSkeleton />);
            const items = screen.getAllByTestId(/^my-cart-item-skeleton-/);
            expect(items.length).toBe(2);
        });

        it('should render specified number of cart items', () => {
            render(<MyCartSkeleton itemCount={4} />);
            const items = screen.getAllByTestId(/^my-cart-item-skeleton-/);
            expect(items.length).toBe(4);
        });
    });

    // Height reservation prevents the skeleton-to-content height mismatch that
    // toggles the viewport scrollbar during checkout hydration.
    describe('step skeletons reserve height', () => {
        it.each([
            ['ContactInfoSkeleton', ContactInfoSkeleton, 'min-h-[168px]'],
            ['ShippingAddressSkeleton', ShippingAddressSkeleton, 'min-h-[520px]'],
            ['ShippingOptionsSkeleton', ShippingOptionsSkeleton, 'min-h-[180px]'],
            ['PaymentSkeleton', PaymentSkeleton, 'min-h-[280px]'],
        ] as const)('%s reserves min-height', (_name, Component, expectedClass) => {
            const { container } = render(<Component />);
            const card = container.querySelector('[data-slot="card"]');
            if (!card) throw new Error('expected Card element to render');
            expect(card.className).toContain(expectedClass);
        });
    });
});
