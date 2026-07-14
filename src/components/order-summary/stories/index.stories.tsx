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
import { expect, within, userEvent, waitFor } from 'storybook/test';
import { waitForStorybookReady } from '@storybook/test-utils';
import type { ShopperBasketsV2, ShopperProducts } from '@/scapi';
import OrderSummary from '../index';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import {
    basketWithBonusOpportunityAllSlotsFilled,
    basketWithGift,
    basketWithMultipleItems,
    basketWithPromoError,
    emptyBasket,
    inBasketMultipleItemDetails,
} from '@/components/__mocks__';
import { SiteProvider } from '@salesforce/storefront-next-runtime/site-context';
import { mockLocale, mockSiteObject } from '@/test-utils/config';
import { mockStandardProductOrderable } from '@/components/__mocks__/standard-product';

const mockSite = mockSiteObject;

const meta: Meta<typeof OrderSummary> = {
    title: 'CHECKOUT/Order Summary',
    component: OrderSummary,
    parameters: {
        layout: 'padded',
        docs: {
            description: {
                component: `
\`<OrderSummary>\` renders subtotal, shipping, tax, promo summary, and the checkout CTA. Used by both the cart route (\`<CartContent>\`) and the checkout page; bucketed under **CHECKOUT/** because checkout has the higher importer count (3 callers including order details vs. 1 in cart).

The component exposes several boolean toggles (\`showCartItems\`, \`showHeading\`, \`showPromoCodeForm\`, \`itemsExpanded\`, \`isEstimate\`). Rather than a story per combination, those are exposed via the controls panel on the **Default** story, and the dedicated stories cover *semantic* configurations only.
                `,
            },
        },
    },
    tags: ['autodocs', 'interaction'],
    argTypes: {
        basket: {
            description: 'The shopping basket containing items and totals',
            table: { disable: true },
        },
        showPromoCodeForm: {
            description: 'Whether to display the promo code form',
            control: 'boolean',
        },
        showCartItems: {
            description: 'Whether to display the cart items accordion',
            control: 'boolean',
        },
        showHeading: {
            description: 'Whether to display the "Order Summary" heading',
            control: 'boolean',
        },
        itemsExpanded: {
            description: 'Whether the cart items accordion should be expanded by default',
            control: 'boolean',
        },
        isEstimate: {
            description: 'Whether to show "Est." prefix for totals',
            control: 'boolean',
        },
        productsByItemId: {
            description: 'Optional product ID to product details mapping',
            table: { disable: true },
        },
    },
    decorators: [
        (Story: React.ComponentType) => (
            <SiteProvider
                site={mockSite}
                locale={mockLocale}
                language={mockSiteObject.defaultLocale}
                currency={mockSiteObject.defaultCurrency}>
                <Story />
            </SiteProvider>
        ),
    ],
};

export default meta;
type Story = StoryObj<typeof OrderSummary>;

const mockProductMap: Record<string, ShopperProducts.schemas['Product']> = {};

if (inBasketMultipleItemDetails.data && basketWithMultipleItems.productItems) {
    basketWithMultipleItems.productItems.forEach((item: ShopperBasketsV2.schemas['ProductItem']) => {
        const productData = inBasketMultipleItemDetails.data?.find(
            (product: ShopperProducts.schemas['Product']) => product.id === item.productId
        );
        if (productData && item.itemId) {
            mockProductMap[item.itemId] = productData;
        }
    });
}

export const Default: Story = {
    args: {
        basket: basketWithMultipleItems,
        showPromoCodeForm: false,
        showCartItems: true,
        showHeading: true,
        itemsExpanded: false,
        isEstimate: false,
        productsByItemId: mockProductMap,
    },
    parameters: {
        docs: {
            description: {
                story: 'Standard order summary. Use the controls panel to toggle `showCartItems`, `showHeading`, `showPromoCodeForm`, `itemsExpanded`, and `isEstimate` — exposed as controls rather than a separate story per combination.',
            },
        },
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const heading = canvasElement.querySelector('h1, h2, h3, [role="heading"]');
        await expect(heading).toBeInTheDocument();
    },
};

const basketWithOrderPromos = {
    ...basketWithMultipleItems,
    couponItems: [
        {
            couponItemId: 'coupon-1',
            code: 'SAVE20',
            statusCode: 'applied',
            itemText: '20% Off Discount',
        },
    ],
    orderPriceAdjustments: [
        {
            priceAdjustmentId: 'adjustment-1',
            // `couponCode` links the adjustment back to `couponItems[].code` so
            // `AppliedCouponRow` can sum and render the per-coupon discount.
            couponCode: 'SAVE20',
            itemText: '20% Off Discount',
            price: -14.71,
            promotionId: 'promo-save-20',
        },
    ],
} as ShopperBasketsV2.schemas['Basket'];

export const WithAppliedPromotions: Story = {
    args: {
        basket: basketWithOrderPromos,
        showPromoCodeForm: true,
        showCartItems: true,
        showHeading: true,
        itemsExpanded: false,
        isEstimate: false,
        productsByItemId: mockProductMap,
    },
    parameters: {
        docs: {
            description: {
                story: 'Order with an applied order-level coupon. Verifies both the discount-line rendering and the per-coupon discount amount that `AppliedCouponRow` derives by matching `orderPriceAdjustments[].couponCode === couponItems[].code`.',
            },
        },
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);

        const adjustmentText = Array.from(canvasElement.querySelectorAll('span, div')).find((element) =>
            element.textContent?.includes('20% Off Discount')
        );
        await expect(adjustmentText).toBeInTheDocument();

        // The promo-code form's applied-coupons section renders the coupon badge plus
        // the formatted discount sum (-£14.71) for the matching `couponCode`.
        const appliedCoupons = await canvas.findByTestId('applied-coupons');
        await expect(appliedCoupons).toHaveTextContent('SAVE20');
        await expect(appliedCoupons.textContent ?? '').toMatch(/£14\.71/);
    },
};

const basketWithItemPromos = {
    ...basketWithMultipleItems,
    productItems: [
        {
            ...basketWithMultipleItems.productItems![0],
            priceAdjustments: [{ priceAdjustmentId: 'item-adj-1', itemText: '$10 Off Ties', price: -10.0 }],
            priceAfterItemDiscount: 28.38,
        },
        {
            ...basketWithMultipleItems.productItems![1],
            priceAdjustments: [{ priceAdjustmentId: 'item-adj-2', itemText: '15% Off Tops', price: -5.28 }],
            priceAfterItemDiscount: 29.91,
        },
    ],
    productSubTotal: 58.29,
    productTotal: 58.29,
} as ShopperBasketsV2.schemas['Basket'];

export const WithItemLevelPromotions: Story = {
    args: {
        basket: basketWithItemPromos,
        showPromoCodeForm: false,
        showCartItems: false,
        showHeading: true,
        itemsExpanded: false,
        isEstimate: false,
        productsByItemId: mockProductMap,
    },
    parameters: {
        docs: {
            description: {
                story: 'Per-line price adjustments rendered as discount sub-lines under each cart item.',
            },
        },
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const tiePromo = Array.from(canvasElement.querySelectorAll('span, div')).find((el) =>
            el.textContent?.includes('$10 Off Ties')
        );
        await expect(tiePromo).toBeInTheDocument();
        const topPromo = Array.from(canvasElement.querySelectorAll('span, div')).find((el) =>
            el.textContent?.includes('15% Off Tops')
        );
        await expect(topPromo).toBeInTheDocument();
    },
};

const bonusProductMap: Record<string, ShopperProducts.schemas['Product']> = {};
(basketWithBonusOpportunityAllSlotsFilled.productItems ?? []).forEach((item) => {
    if (item.itemId) {
        bonusProductMap[item.itemId] = {
            ...mockStandardProductOrderable.product,
            id: item.productId ?? mockStandardProductOrderable.product.id,
            name: item.productName ?? mockStandardProductOrderable.product.name,
        };
    }
});

export const WithBonusProductLine: Story = {
    args: {
        basket: basketWithBonusOpportunityAllSlotsFilled,
        showPromoCodeForm: false,
        showCartItems: true,
        showHeading: true,
        itemsExpanded: true,
        isEstimate: true,
        productsByItemId: bonusProductMap,
    },
    parameters: {
        docs: {
            description: {
                story: 'Order summary with a bonus opportunity and all bonus slots filled — bonus line items appear at price 0 alongside the qualifying item. Backed by `basketWithBonusOpportunityAllSlotsFilled`.',
            },
        },
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const heading = canvasElement.querySelector('h1, h2, h3, [role="heading"]');
        await expect(heading).toBeInTheDocument();
    },
};

const giftProductMap: Record<string, ShopperProducts.schemas['Product']> = {};
(basketWithGift.productItems ?? []).forEach((item) => {
    if (item.itemId) {
        giftProductMap[item.itemId] = {
            ...mockStandardProductOrderable.product,
            id: item.productId ?? mockStandardProductOrderable.product.id,
            name: item.productName ?? mockStandardProductOrderable.product.name,
        };
    }
});

export const WithGiftLine: Story = {
    args: {
        basket: basketWithGift,
        showPromoCodeForm: false,
        showCartItems: true,
        showHeading: true,
        itemsExpanded: true,
        isEstimate: true,
        productsByItemId: giftProductMap,
    },
    parameters: {
        docs: {
            description: {
                story: "Order summary fed by `basketWithGift` (line item with `gift: true`). The summary itself doesn't render a gift indicator — this story verifies totals and item rendering remain stable when the gift flag is set.",
            },
        },
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const heading = canvasElement.querySelector('h1, h2, h3, [role="heading"]');
        await expect(heading).toBeInTheDocument();
    },
};

const promoErrorProductMap: Record<string, ShopperProducts.schemas['Product']> = {};
(basketWithPromoError.productItems ?? []).forEach((item) => {
    if (item.itemId) {
        promoErrorProductMap[item.itemId] = {
            ...mockStandardProductOrderable.product,
            id: item.productId ?? mockStandardProductOrderable.product.id,
            name: item.productName ?? mockStandardProductOrderable.product.name,
        };
    }
});

export const WithCouponDiscount: Story = {
    args: {
        basket: basketWithPromoError,
        showPromoCodeForm: true,
        showCartItems: false,
        showHeading: true,
        itemsExpanded: false,
        isEstimate: false,
        productsByItemId: promoErrorProductMap,
    },
    parameters: {
        docs: {
            description: {
                story: 'Order summary with one applied coupon (`SAVE10`) and the matching `orderPriceAdjustment` discount line. Backed by `basketWithPromoError` (which models a basket post-successful-apply, not an error). The play function asserts both the coupon badge and the formatted discount.',
            },
        },
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);

        const heading = canvasElement.querySelector('h1, h2, h3, [role="heading"]');
        await expect(heading).toBeInTheDocument();

        // The applied coupon row + discount sub-line live inside the promo-code form
        // accordion (already expanded). Assert both the coupon code and the formatted
        // discount amount (-£3.84) are rendered.
        const appliedCoupons = await canvas.findByTestId('applied-coupons');
        await expect(appliedCoupons).toHaveTextContent('SAVE10');
        await expect(appliedCoupons.textContent ?? '').toMatch(/£3\.84/);
    },
};

export const EstimateMode: Story = {
    args: {
        basket: basketWithMultipleItems,
        showPromoCodeForm: false,
        showCartItems: true,
        showHeading: true,
        itemsExpanded: false,
        isEstimate: true,
        productsByItemId: mockProductMap,
    },
    parameters: {
        docs: {
            description: {
                story: 'Cart-route variant — totals prefixed with "Est." until shipping address is selected at checkout.',
            },
        },
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        // Total-row label is a <dt> after the dl-grid refactor; older stories queried span-only.
        const totalLabel = Array.from(canvasElement.querySelectorAll('dt, span')).find((el) =>
            el.textContent?.toLowerCase().includes('estimated total')
        );
        await expect(totalLabel).not.toBeUndefined();
    },
};

export const EmptyBasket: Story = {
    args: {
        basket: emptyBasket,
        showPromoCodeForm: false,
        showCartItems: true,
        showHeading: true,
        itemsExpanded: false,
        isEstimate: false,
        productsByItemId: {},
    },
    parameters: {
        docs: {
            description: {
                story: 'Empty basket — verifies the no-items message and zeroed totals.',
            },
        },
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const heading = canvasElement.querySelector('h1, h2, h3, [role="heading"]');
        await expect(heading).toBeInTheDocument();
    },
};

export const MobileCollapsible: Story = {
    args: {
        basket: basketWithMultipleItems,
        showPromoCodeForm: false,
        showCartItems: false,
        showHeading: false,
        itemsExpanded: false,
        isEstimate: true,
        productsByItemId: mockProductMap,
    },
    render: (args) => {
        const totalItems = args.basket?.productItems?.reduce((acc, item) => acc + (item.quantity ?? 0), 0) || 0;
        return (
            <Accordion type="single" collapsible className="w-full">
                <AccordionItem value="order-summary" className="border-b-0">
                    <AccordionTrigger className="px-[var(--cart-summary-px)] py-4 hover:no-underline">
                        <span className="flex-1 text-left text-sm font-semibold text-primary">
                            Estimated Total ({totalItems} items)
                        </span>
                    </AccordionTrigger>
                    <AccordionContent className="p-0">
                        <OrderSummary
                            {...args}
                            showCheckoutAction={false}
                            className="border-none shadow-none rounded-none !py-0 [--cart-summary-px:1rem]"
                        />
                    </AccordionContent>
                </AccordionItem>
            </Accordion>
        );
    },
    parameters: {
        viewport: {
            defaultViewport: 'mobile1',
        },
        docs: {
            description: {
                story: 'Mobile viewport — order summary collapses behind an "Estimated Total (X items)" trigger.',
            },
        },
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const accordionTrigger = Array.from(canvasElement.querySelectorAll('button')).find((button) =>
            button.textContent?.toLowerCase().includes('estimated total')
        );
        await expect(accordionTrigger).toBeInTheDocument();
        await expect(accordionTrigger?.textContent).toMatch(/\d+\s+items?/i);
    },
};

const basketGross = {
    ...basketWithMultipleItems,
    taxation: 'gross' as const,
    taxTotal: 5.25,
    orderTotal: 118.5,
} as ShopperBasketsV2.schemas['Basket'];

const basketNet = {
    ...basketWithMultipleItems,
    taxation: 'net' as const,
    taxTotal: 5.25,
    orderTotal: 118.5,
} as ShopperBasketsV2.schemas['Basket'];

export const GrossTaxation: Story = {
    args: {
        basket: basketGross,
        showPromoCodeForm: false,
        showCartItems: false,
        showHeading: true,
        isEstimate: false,
        productsByItemId: mockProductMap,
    },
    parameters: {
        docs: {
            description: {
                story: 'Gross taxation (e.g. RefArchGlobal): tax is included in product prices, so the tax line is hidden.',
            },
        },
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        // Tax label is a <dt> after the dl-grid refactor; older stories queried span-only.
        const taxLabel = Array.from(canvasElement.querySelectorAll('dt, span')).find((el) => el.textContent === 'Tax');
        await expect(taxLabel).toBeUndefined();
    },
};

export const NetTaxation: Story = {
    args: {
        basket: basketNet,
        showPromoCodeForm: false,
        showCartItems: false,
        showHeading: true,
        isEstimate: false,
        productsByItemId: mockProductMap,
    },
    parameters: {
        docs: {
            description: {
                story: 'Net taxation (e.g. RefArch): tax is added on top of product prices, so the tax line is shown.',
            },
        },
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        // Tax label is a <dt> after the dl-grid refactor; older stories queried span-only.
        const taxLabel = Array.from(canvasElement.querySelectorAll('dt, span')).find((el) => el.textContent === 'Tax');
        await expect(taxLabel).toBeInTheDocument();
    },
};

// Exported last on purpose. Snapshot tests render every story in this file in
// export order through one shared React tree, and the cart-items accordion
// consumes `useId`. Placing this interaction story before the promo-code-form
// stories (WithAppliedPromotions / WithCouponDiscount) would bump their
// auto-generated `useId` form-field IDs and churn unrelated snapshots. Keeping
// it last means it perturbs nothing that follows.
export const CartItemsAccordionInteraction: Story = {
    args: {
        basket: basketWithMultipleItems,
        showPromoCodeForm: false,
        showCartItems: true,
        showHeading: true,
        // Start collapsed (itemsExpanded:false) so the click drives the
        // closed→open transition rather than asserting an already-open accordion.
        itemsExpanded: false,
        isEstimate: false,
        productsByItemId: mockProductMap,
    },
    parameters: {
        docs: {
            description: {
                story: 'Clicks the cart-items accordion trigger and asserts it expands. The accordion is a Radix primitive, so expanded state lives in `aria-expanded` / `data-state="open"` — not a native `open` attribute. Crucially it then asserts the revealed content (the "Edit cart" link inside `AccordionContent`) becomes accessible, so the test verifies the component shows its items rather than merely that Radix toggled an attribute.',
            },
        },
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);

        // The cart-items trigger is labelled by its item-count text ("N items in cart").
        const trigger = canvas.getByRole('button', { name: /items in cart/i });

        // Starts collapsed: the trigger is closed and Radix renders the content with
        // `hidden`, so the "Edit cart" link inside it is not yet in the accessibility
        // tree (a role query with the default `hidden: false` can't see it).
        await expect(trigger).toHaveAttribute('aria-expanded', 'false');
        await expect(trigger).toHaveAttribute('data-state', 'closed');
        await expect(canvas.queryByRole('link', { name: /edit cart/i })).not.toBeInTheDocument();

        // Click expands it.
        await userEvent.click(trigger);

        // Radix toggles aria-expanded + data-state (not a native `open`)...
        await waitFor(async () => {
            await expect(trigger).toHaveAttribute('aria-expanded', 'true');
            await expect(trigger).toHaveAttribute('data-state', 'open');
        });

        // ...and — the actual point of the accordion — the content is revealed. The
        // "Edit cart" link rendered inside AccordionContent becomes accessible, proving
        // the component shows its cart items, not merely that an attribute flipped.
        await expect(await canvas.findByRole('link', { name: /edit cart/i })).toBeInTheDocument();
    },
};
