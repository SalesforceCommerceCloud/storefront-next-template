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
import type { ReactElement } from 'react';
import { expect, within } from 'storybook/test';
import { waitForStorybookReady } from '@storybook/test-utils';
import type { ShopperBasketsV2 } from '@/scapi';
import CartTitle from '../cart-title';
import { basketWithMultipleItems } from '@/components/__mocks__/basket-with-multiple-items';

const SAMPLE_SHIPPING_ADDRESS: ShopperBasketsV2.schemas['OrderAddress'] = {
    address1: '478 Artisan Way',
    city: 'Somerville',
    stateCode: 'MA',
    postalCode: '02145',
    countryCode: 'US',
};

interface CartTitleHarnessArgs {
    deliveryCount: number;
    withShippingAddress: boolean;
}

function CartTitleHarness({ deliveryCount, withShippingAddress }: CartTitleHarnessArgs): ReactElement {
    const basket: ShopperBasketsV2.schemas['Basket'] = withShippingAddress
        ? {
              ...basketWithMultipleItems,
              shipments: [
                  {
                      ...(basketWithMultipleItems.shipments?.[0] ?? { shipmentId: 'me' }),
                      shippingAddress: SAMPLE_SHIPPING_ADDRESS,
                  },
              ],
          }
        : basketWithMultipleItems;
    return <CartTitle basket={basket} deliveryCount={deliveryCount} />;
}

const meta: Meta<typeof CartTitleHarness> = {
    title: 'Cart/Cart Title',
    component: CartTitleHarness,
    tags: ['autodocs', 'interaction'],
    parameters: {
        layout: 'centered',
        docs: {
            description: {
                component: `
\`<CartTitle>\` renders the delivery heading on the cart route — sums quantities from the basket and emits a count-aware "Delivery — X out of Y items" line, plus an optional shipping-address sub-line when \`basket.shipments[0].shippingAddress\` is set (typical post-checkout-return or saved-address flows).

A single \`Default\` story covers both render paths: flip \`deliveryCount\` to exercise the count branch and \`withShippingAddress\` to surface / hide the address sub-line.
                `,
            },
        },
    },
    argTypes: {
        deliveryCount: {
            control: 'number',
            description: 'Number of items currently in the delivery group (drives the heading numerator).',
        },
        withShippingAddress: {
            control: 'boolean',
            description:
                "Toggle the address sub-line. Synthesises a `shippingAddress` on the basket's first shipment when on; falls back to the bare heading when off.",
        },
    },
    args: {
        // basketWithMultipleItems has 2 product items; default to "all of them are
        // in the delivery group" so the rendered heading reads "2 out of 2 items".
        deliveryCount: 2,
        withShippingAddress: false,
    },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
    play: async ({ canvasElement, args }) => {
        const canvas = within(canvasElement);
        await waitForStorybookReady(canvasElement);

        const heading = await canvas.findByRole('heading', { level: 2 });
        await expect(heading).toBeInTheDocument();

        // Address sub-line only renders when `basket.shipments[0].shippingAddress` is set.
        if (args.withShippingAddress) {
            const addressLine = await canvas.findByText(/478 Artisan Way.*Somerville.*MA.*02145/);
            await expect(addressLine).toBeInTheDocument();
        } else {
            await expect(canvas.queryByText(/Artisan Way/)).not.toBeInTheDocument();
        }
    },
};
