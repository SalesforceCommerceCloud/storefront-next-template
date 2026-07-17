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

import { PromoCodeForm, type PromoCodeFormProps } from '../index';
import { expect, within, userEvent } from 'storybook/test';
import { waitForStorybookReady } from '@storybook/test-utils';
import { getTranslation } from '@salesforce/storefront-next-runtime/i18n';
import { basketWithPromoError } from '@/components/__mocks__';
import type { ShopperBasketsV2 } from '@/scapi';

const basketWithAppliedCoupon = {
    basketId: 'applied-coupon-basket',
    currency: 'GBP',
    couponItems: [
        {
            couponItemId: 'coupon-applied-1',
            code: 'SAVE10',
            statusCode: 'applied',
        },
    ],
    orderPriceAdjustments: [
        {
            priceAdjustmentId: 'adj-applied-1',
            couponCode: 'SAVE10',
            itemText: '10% Off Order',
            price: -3.84,
            promotionId: 'promo-save-10',
        },
    ],
} as ShopperBasketsV2.schemas['Basket'];

// A coupon SCAPI recognized but could not apply (valid code, nothing in the
// cart qualifies). It is parked on the basket as `no_applicable_promotion` but
// must NOT be presented to the shopper as applied.
const basketWithNotApplicableCoupon = {
    basketId: 'not-applicable-coupon-basket',
    currency: 'GBP',
    couponItems: [
        {
            couponItemId: 'coupon-not-applicable-1',
            code: 'PRODUCT',
            statusCode: 'no_applicable_promotion',
        },
    ],
} as ShopperBasketsV2.schemas['Basket'];

const meta: Meta<typeof PromoCodeForm> = {
    component: PromoCodeForm,
    title: 'Cart/Promo Codes/Promo Code Form',
    tags: ['autodocs', 'interaction'],
    parameters: {
        layout: 'padded',
        docs: {
            description: {
                component: `
\`<PromoCodeForm>\` renders the cart-side promo-code accordion: enter a code, submit it, see applied coupons with a remove (×) affordance. Validation flows through \`react-hook-form\` + Zod; the apply / remove fetches go through \`usePromoCodeActions\` (\`/action/promo-code-add\` and \`/action/promo-code-remove\`).

The component takes a single \`basket\` prop and reads three things off it:
- \`basketId\` — required for the apply mutation; absence triggers an inline error
- \`couponItems\` — drives the applied-coupon list at the bottom
- \`orderPriceAdjustments\` + \`productItems[].priceAdjustments\` — power the per-coupon discount sub-line

Stories:

| Story | Description |
|-------|-------------|
| **Default** | Empty basket — form open, accordion expanded, no applied coupons. \`basket\` is a control so different IDs / couponItems can be swapped without spawning new stories (Pattern 10) |
| **WithAppliedCoupon** | Basket has one applied coupon (no discount line) — verifies the badge + remove (×) affordance |
| **WithCouponDiscount** | Basket has one applied coupon plus a matching \`orderPriceAdjustment\` — verifies the per-coupon discount amount renders next to the badge. Backed by \`basketWithPromoError\` |
| **WithNotApplicableCoupon** | Basket holds a valid-but-ineligible coupon (\`statusCode: 'no_applicable_promotion'\`) — verifies it is NOT presented as applied (no applied-coupons list) |
                `,
            },
        },
    },
    decorators: [
        (Story: React.ComponentType) => (
            <div className="max-w-md mx-auto p-6">
                <Story />
            </div>
        ),
    ],
    argTypes: {
        basket: {
            control: 'object',
            description: 'Basket containing `basketId`, `couponItems`, and price adjustments. Drives every variant.',
        },
    },
    args: {
        basket: { basketId: 'test-basket-123', currency: 'GBP' } as ShopperBasketsV2.schemas['Basket'],
    },
    render: (args: PromoCodeFormProps) => <PromoCodeForm basket={args.basket} />,
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
    play: async ({ canvasElement }) => {
        const canvas = within(canvasElement);
        const { t } = getTranslation();

        await waitForStorybookReady(canvasElement);

        const accordionTrigger = await canvas.findByRole('button', { name: t('cart:promoCode.accordionTitle') });
        await expect(accordionTrigger).toBeInTheDocument();

        const input = await canvas.findByPlaceholderText(/promo code|discount code|enter code/i);
        await expect(input).toBeInTheDocument();

        const button = await canvas.findByRole('button', { name: /apply|submit/i });
        await expect(button).toBeInTheDocument();

        await userEvent.type(input, 'CUSTOM20');
        await expect(input).toHaveValue('CUSTOM20');
    },
};

export const WithAppliedCoupon: Story = {
    args: {
        basket: basketWithAppliedCoupon,
    },
    play: async ({ canvasElement }) => {
        const canvas = within(canvasElement);

        await waitForStorybookReady(canvasElement);

        const appliedCoupons = await canvas.findByTestId('applied-coupons');
        await expect(appliedCoupons).toBeInTheDocument();
        await expect(appliedCoupons).toHaveTextContent('SAVE10');

        const removeButton = await canvas.findByRole('button', { name: /remove SAVE10/i });
        await expect(removeButton).toBeInTheDocument();
    },
};

export const WithCouponDiscount: Story = {
    args: {
        basket: basketWithPromoError,
    },
    parameters: {
        docs: {
            description: {
                story: 'Applied coupon (`SAVE10`) backed by an `orderPriceAdjustment` carrying the matching `couponCode` — `AppliedCouponRow` sums the adjustment by `couponCode === item.code` and renders the formatted discount (`-£3.84`) beside the coupon badge.',
            },
        },
    },
    play: async ({ canvasElement }) => {
        const canvas = within(canvasElement);

        await waitForStorybookReady(canvasElement);

        const appliedCoupons = await canvas.findByTestId('applied-coupons');
        await expect(appliedCoupons).toBeInTheDocument();
        await expect(appliedCoupons).toHaveTextContent('SAVE10');
        // Discount line: -£3.84 (formatted via the basket's GBP currency)
        await expect(appliedCoupons.textContent ?? '').toMatch(/£3\.84/);
    },
};

export const WithNotApplicableCoupon: Story = {
    args: {
        basket: basketWithNotApplicableCoupon,
    },
    parameters: {
        docs: {
            description: {
                story: 'A valid coupon code that no cart item qualifies for. SCAPI returns HTTP 200 and parks the coupon as `no_applicable_promotion`, but the form filters it out so the shopper never sees a false "applied" state. The applied-coupons list is absent.',
            },
        },
    },
    play: async ({ canvasElement }) => {
        const canvas = within(canvasElement);

        await waitForStorybookReady(canvasElement);

        // The coupon is on the basket but not applied — it must not be rendered.
        await expect(canvas.queryByTestId('applied-coupons')).not.toBeInTheDocument();
        await expect(canvas.queryByText('PRODUCT')).not.toBeInTheDocument();
    },
};
