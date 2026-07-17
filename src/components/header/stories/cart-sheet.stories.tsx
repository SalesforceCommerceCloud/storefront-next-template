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
import CartSheet from '../cart-sheet';
import { Button } from '@/components/ui/button';
import BasketProvider from '@/providers/basket';
import { setMiniCartOpen } from '@/hooks/mini-cart-store';
import emptyBasket from '@/components/__mocks__/empty-basket';
import emptyBasketSnapshot from '@/components/__mocks__/empty-basket-snapshot';
import { basketWithOneItem } from '@/components/__mocks__/basket-with-dress';
import basketWithOneItemSnapshot from '@/components/__mocks__/basket-with-dress-snapshot';
import { ConfigProvider } from '@salesforce/storefront-next-runtime/config';
import { mockConfig, mockLocale, mockSiteObject } from '@/test-utils/config';
import { SiteProvider } from '@salesforce/storefront-next-runtime/site-context';

const meta: Meta<typeof CartSheet> = {
    title: 'Layout/Header/Cart Sheet',
    component: CartSheet,
    tags: ['autodocs', 'interaction'],
    // Reset the module-scoped mini-cart open flag before each story — otherwise
    // one story's opened state leaks into the next and hides its trigger.
    beforeEach: () => {
        setMiniCartOpen(false);
    },
    parameters: {
        layout: 'centered',
        docs: {
            description: {
                component:
                    'Mini cart flyout. The cart icon (passed as the trigger child) opens the panel; basket data is read via `/resource/basket-products` (mocked in Storybook).',
            },
        },
    },
    decorators: [
        (Story) => (
            <ConfigProvider config={mockConfig}>
                <SiteProvider
                    site={mockSiteObject}
                    locale={mockLocale}
                    language={mockSiteObject.defaultLocale}
                    currency={mockSiteObject.defaultCurrency}>
                    <div className="p-8">
                        <Story />
                    </div>
                </SiteProvider>
            </ConfigProvider>
        ),
    ],
};

export default meta;
type Story = StoryObj<typeof CartSheet>;

export const Empty: Story = {
    decorators: [
        (Story) => (
            <BasketProvider basket={emptyBasket} snapshot={emptyBasketSnapshot}>
                <Story />
            </BasketProvider>
        ),
    ],
    render: () => (
        <CartSheet>
            <Button variant="ghost">Open Cart</Button>
        </CartSheet>
    ),
    parameters: {
        snapshot: false, // Radix UI Sheet with empty state causes infinite loop in test environment
        // The panel reads basket via the /resource/basket-products fetcher, not the
        // BasketProvider decorator — so override that fixture to an empty basket.
        miniCartData: { basket: emptyBasket, productsById: {} },
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);

        // Open via a real click (Radix wires SheetTrigger → onOpenChange).
        const trigger = canvas.getByRole('button', { name: /open cart/i });
        await userEvent.click(trigger);

        // Radix renders the panel in a portal on document.body, not the canvas.
        const documentBody = within(document.body);
        const cartSheet = await documentBody.findByRole('dialog', { hidden: false }, { timeout: 5000 });
        await expect(cartSheet).toBeInTheDocument();
        // Empty basket → empty-state copy.
        await expect(await documentBody.findByText(/your cart is empty/i, {}, { timeout: 5000 })).toBeInTheDocument();
    },
};

export const WithItems: Story = {
    decorators: [
        (Story) => (
            <BasketProvider basket={basketWithOneItem} snapshot={basketWithOneItemSnapshot}>
                <Story />
            </BasketProvider>
        ),
    ],
    render: () => (
        <CartSheet>
            <Button variant="ghost">Open Cart</Button>
        </CartSheet>
    ),
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);

        // Open via a real click (Radix wires SheetTrigger → onOpenChange).
        const trigger = canvas.getByRole('button', { name: /open cart/i });
        await userEvent.click(trigger);

        // Radix renders the panel in a portal on document.body, not the canvas.
        const documentBody = within(document.body);
        const cartSheet = await documentBody.findByRole('dialog', { hidden: false }, { timeout: 5000 });
        await expect(cartSheet).toBeInTheDocument();
        // Populated basket → checkout + continue-shopping actions in the footer.
        await expect(
            await documentBody.findByRole('link', { name: /checkout/i }, { timeout: 5000 })
        ).toBeInTheDocument();
        await expect(
            await documentBody.findByRole('button', { name: /continue shopping/i }, { timeout: 5000 })
        ).toBeInTheDocument();

        // Close via Escape (a safe, real close path — Radix handles it natively).
        // We use Escape rather than a "Close" button because the panel renders two:
        // the template's own SheetClose and storefront-ui's built-in one.
        await userEvent.keyboard('{Escape}');

        // Closing flips miniCartOpen false, which unmounts the panel — assert it's gone.
        await waitFor(() => expect(documentBody.queryByRole('dialog', { hidden: false })).not.toBeInTheDocument(), {
            onTimeout: (error) => new Error(`Cart sheet did not close after pressing Escape: ${error.message}`),
        });
    },
};
