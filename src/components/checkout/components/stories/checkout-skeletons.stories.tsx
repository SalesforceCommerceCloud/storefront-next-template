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
import type { Meta, StoryObj } from '@storybook/react-vite';
import { Title, Description, Controls } from '@storybook/addon-docs/blocks';
import {
    ExpressPaymentsSkeleton,
    ContactInfoSkeleton,
    ShippingAddressSkeleton,
    ShippingOptionsSkeleton,
    PaymentSkeleton,
    PickupSkeleton,
    OrderSummarySkeleton,
    MyCartSkeleton,
    CheckoutSkeleton,
} from '../checkout-skeletons';
import type { ComponentProps } from 'react';
import { expect } from 'storybook/test';
import { waitForStorybookReady } from '@storybook/test-utils';
import { checkoutStrictA11yParameters } from '@/components/checkout/storybook/checkout-strict-a11y-parameters';

const meta: Meta = {
    title: 'Checkout/Skeletons',
    parameters: {
        ...checkoutStrictA11yParameters,
        layout: 'padded',
        docs: {
            description: {
                component: `
### CheckoutSkeletons Components

This module provides skeleton loading placeholders for all checkout components. Skeletons are displayed while data is being fetched, providing visual feedback to users that content is loading.

**Available Skeleton Components:**
- **ExpressPaymentsSkeleton**: Shows loading state for express payment buttons grid
- **ContactInfoSkeleton**: Shows loading state for contact info form (email + phone fields)
- **ShippingAddressSkeleton**: Shows loading state for shipping address form (name, address, city, state, zip)
- **ShippingOptionsSkeleton**: Shows loading state for shipping method selection (radio options)
- **PaymentSkeleton**: Shows loading state for payment form (card details, billing address)
- **PickupSkeleton**: Shows loading state for pickup location selection
- **OrderSummarySkeleton**: Shows loading state for order totals sidebar
- **MyCartSkeleton**: Shows loading state for cart items list
- **CheckoutSkeleton**: Full-page skeleton for entire checkout flow

**Usage:**
These skeletons are typically rendered inside \`<Suspense>\` boundaries while async data is loading. They match the layout and dimensions of the actual components to minimize layout shift when content loads.

**Design:**
All skeletons use the \`Skeleton\` component from \`@/components/ui/skeleton\` which provides consistent shimmer animation and styling across the application.
                `,
            },
            page: () => (
                <>
                    <Title />
                    <Description />
                    <Controls />
                </>
            ),
        },
    },
    tags: ['autodocs', 'interaction'],
};

export default meta;

type ExpressPaymentsSkeletonStory = StoryObj<typeof ExpressPaymentsSkeleton>;
type ContactInfoSkeletonStory = StoryObj<typeof ContactInfoSkeleton>;
type ShippingAddressSkeletonStory = StoryObj<typeof ShippingAddressSkeleton>;
type ShippingOptionsSkeletonStory = StoryObj<typeof ShippingOptionsSkeleton>;
type PaymentSkeletonStory = StoryObj<typeof PaymentSkeleton>;
type PickupSkeletonStory = StoryObj<typeof PickupSkeleton>;
type OrderSummarySkeletonStory = StoryObj<typeof OrderSummarySkeleton>;
type MyCartSkeletonStory = StoryObj<{ itemCount?: ComponentProps<typeof MyCartSkeleton>['itemCount'] }>;
type CheckoutSkeletonStory = StoryObj<typeof CheckoutSkeleton>;

export const ExpressPayments: ExpressPaymentsSkeletonStory = {
    render: () => <ExpressPaymentsSkeleton />,
    parameters: {
        docs: {
            description: {
                story: 'Loading state for express payment buttons (Apple Pay, Google Pay, etc.). Shows 5 button placeholders in responsive grid layout.',
            },
        },
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const skeleton = canvasElement.querySelector('[data-testid="express-payments-skeleton"]');
        await expect(skeleton).toBeInTheDocument();
    },
};

export const ContactInfo: ContactInfoSkeletonStory = {
    render: () => <ContactInfoSkeleton />,
    parameters: {
        docs: {
            description: {
                story: 'Loading state for contact info form. Shows email input and phone number fields (country code + phone).',
            },
        },
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        // Verify skeletons are rendered
        const skeletons = canvasElement.querySelectorAll('[data-slot="skeleton"]');
        await expect(skeletons.length).toBeGreaterThan(0);
    },
};

export const ShippingAddress: ShippingAddressSkeletonStory = {
    render: () => <ShippingAddressSkeleton />,
    parameters: {
        docs: {
            description: {
                story: 'Loading state for shipping address form. Shows first name, last name, address line 1, city, state, and postal code fields.',
            },
        },
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        // Verify skeletons are rendered
        const skeletons = canvasElement.querySelectorAll('[data-slot="skeleton"]');
        await expect(skeletons.length).toBeGreaterThan(0);
    },
};

export const ShippingOptions: ShippingOptionsSkeletonStory = {
    render: () => <ShippingOptionsSkeleton />,
    parameters: {
        docs: {
            description: {
                story: 'Loading state for shipping method selection. Shows 2 radio option placeholders for shipping methods (e.g., Standard, Express).',
            },
        },
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        // Verify skeletons are rendered
        const skeletons = canvasElement.querySelectorAll('[data-slot="skeleton"]');
        await expect(skeletons.length).toBeGreaterThan(0);
    },
};

export const Payment: PaymentSkeletonStory = {
    render: () => <PaymentSkeleton />,
    parameters: {
        docs: {
            description: {
                story: 'Loading state for payment form. Shows credit card radio option, name on card, expiry date, CVV fields, and billing address checkbox.',
            },
        },
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        // Verify skeletons are rendered
        const skeletons = canvasElement.querySelectorAll('[data-slot="skeleton"]');
        await expect(skeletons.length).toBeGreaterThan(0);
    },
};

export const Pickup: PickupSkeletonStory = {
    render: () => <PickupSkeleton />,
    parameters: {
        docs: {
            description: {
                story: 'Loading state for pickup location selection. Shows store location details placeholder.',
            },
        },
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        // Verify skeletons are rendered
        const skeletons = canvasElement.querySelectorAll('[data-slot="skeleton"]');
        await expect(skeletons.length).toBeGreaterThan(0);
    },
};

export const OrderSummary: OrderSummarySkeletonStory = {
    render: () => <OrderSummarySkeleton />,
    parameters: {
        docs: {
            description: {
                story: 'Loading state for order summary sidebar. Shows subtotal, tax, shipping, and total placeholders.',
            },
        },
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const skeleton = canvasElement.querySelector('[data-testid="order-summary-skeleton"]');
        await expect(skeleton).toBeInTheDocument();
    },
};

export const MyCart: MyCartSkeletonStory = {
    render: () => <MyCartSkeleton />,
    parameters: {
        docs: {
            description: {
                story: 'Loading state for cart items list. Shows 2 cart item placeholders by default.',
            },
        },
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const skeleton = canvasElement.querySelector('[data-testid="my-cart-skeleton"]');
        await expect(skeleton).toBeInTheDocument();
    },
};

export const MyCartWithManyItems: MyCartSkeletonStory = {
    args: { itemCount: 5 },
    render: ({ itemCount }) => <MyCartSkeleton itemCount={itemCount} />,
    parameters: {
        docs: {
            description: {
                story: 'Loading state for cart with many items. Shows 5 cart item placeholders.',
            },
        },
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const skeleton = canvasElement.querySelector('[data-testid="my-cart-skeleton"]');
        await expect(skeleton).toBeInTheDocument();
    },
};

export const FullCheckout: CheckoutSkeletonStory = {
    render: () => <CheckoutSkeleton />,
    parameters: {
        docs: {
            description: {
                story: 'Full-page loading state for entire checkout flow. Shows progress steps and 3 form section placeholders.',
            },
        },
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        // Verify multiple skeleton sections exist
        const skeletons = canvasElement.querySelectorAll('[data-slot="skeleton"]');
        await expect(skeletons.length).toBeGreaterThan(0);
    },
};
