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
import { expect } from 'storybook/test';
import { waitForStorybookReady } from '@storybook/test-utils';
import type { ShopperBasketsV2, ShopperProducts } from '@/scapi';
import { SiteProvider } from '@salesforce/storefront-next-runtime/site-context';
import { mockLocale, mockSiteObject } from '@/test-utils/config';
import {
    basketWithMultipleItems,
    inBasketMultipleItemDetails,
} from '@/components/__mocks__/basket-with-multiple-items';
import OrderSummary from '../index';
import { OrderSummaryMobileAccordion } from '../mobile-heading';

const mockSite = mockSiteObject;
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

const meta: Meta<typeof OrderSummaryMobileAccordion> = {
    title: 'Checkout/Order Summary/Mobile Accordion',
    component: OrderSummaryMobileAccordion,
    tags: ['autodocs', 'interaction'],
    parameters: {
        layout: 'padded',
        viewport: {
            defaultViewport: 'mobile1',
        },
        docs: {
            description: {
                component:
                    '`<OrderSummaryMobileAccordion>` is the mobile-only collapsible wrapper around `<OrderSummary>`. It produces the sticky bottom-of-viewport "Estimated Total (X items)" trigger on the cart route. Used by `<CartContent>` only — `defaultExpanded` is exposed as a control rather than spawning two stories per Pattern 10.',
            },
        },
    },
    argTypes: {
        defaultExpanded: {
            description: 'Whether the accordion should mount in the expanded state',
            control: 'boolean',
        },
        isEstimate: {
            description: 'Whether to show "Est." prefix for totals',
            control: 'boolean',
        },
        basket: {
            description: 'The shopping basket to display in the trigger summary line',
            table: { disable: true },
        },
    },
    args: {
        basket: basketWithMultipleItems,
        defaultExpanded: false,
        isEstimate: true,
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
type Story = StoryObj<typeof OrderSummaryMobileAccordion>;

export const Default: Story = {
    render: (args) => (
        <OrderSummaryMobileAccordion {...args}>
            <OrderSummary
                basket={args.basket}
                showCartItems={false}
                showHeading={false}
                showPromoCodeForm={true}
                isEstimate={args.isEstimate}
                productsByItemId={mockProductMap}
                showCheckoutAction={false}
                className="border-none shadow-none rounded-none !py-0 [--cart-summary-px:1rem]"
            />
        </OrderSummaryMobileAccordion>
    ),
    play: async ({ canvasElement, args }) => {
        await waitForStorybookReady(canvasElement);
        const trigger = Array.from(canvasElement.querySelectorAll('button')).find((button) =>
            button.textContent?.toLowerCase().includes('estimated total')
        );
        await expect(trigger).toBeInTheDocument();
        await expect(trigger?.textContent).toMatch(/\d+\s+items?/i);
        await expect(trigger).toHaveAttribute('aria-expanded', String(Boolean(args.defaultExpanded)));
    },
};
