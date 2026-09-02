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
import { expect, userEvent, waitFor, within } from 'storybook/test';
import { waitForStorybookReady } from '@storybook/test-utils';
import DeliveryOptions from '../delivery-options';
import { masterProductWithInventories } from '@/components/__mocks__/master-product-with-inventories';
// @sfdc-extension-block-start SFDC_EXT_BOPIS
// @sfdc-extension-block-start SFDC_EXT_SHIPPING_DELIVERY
import { ShippingDeliveryProvider } from '@/extensions/shipping-delivery/context/shipping-delivery-context';
import DeliveryEstimateCalculatorTarget from '@/extensions/shipping-delivery/components/target/delivery-estimate-calculator-target';
// @sfdc-extension-block-end SFDC_EXT_SHIPPING_DELIVERY
// @sfdc-extension-block-end SFDC_EXT_BOPIS

const meta = {
    title: 'Fulfillment/Delivery Options',
    component: DeliveryOptions,
    tags: ['autodocs'],
    parameters: {
        layout: 'padded',
        docs: {
            description: {
                component: 'Composes the available shipping and pickup fulfillment options for a product.',
            },
        },
    },
    argTypes: {
        product: { table: { disable: true } },
        onSelectionChange: { table: { disable: true } },
    },
} satisfies Meta<typeof DeliveryOptions>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
    args: {
        product: masterProductWithInventories,
        quantity: 1,
    },
};

// @sfdc-extension-block-start SFDC_EXT_BOPIS
export const PickupStoreSelected: Story = {
    args: {
        product: masterProductWithInventories,
        quantity: 1,
        pickupLocation: {
            id: 'store-1',
            name: 'Downtown Store',
            inventoryId: 'inventory_m',
        },
    },
};

// @sfdc-extension-block-start SFDC_EXT_SHIPPING_DELIVERY
export const DeliveryCalculatorDisclosure: Story = {
    tags: ['interaction'],
    args: {
        product: masterProductWithInventories,
        quantity: 1,
        deliveryAvailable: true,
        pickupLocation: {
            id: 'store-1',
            name: 'Downtown Store',
            inventoryId: 'inventory_m',
        },
        enableDeliveryEstimatePresentation: true,
        instanceId: 'storybook-pdp-delivery-options',
    },
    render: (args) => (
        <ShippingDeliveryProvider productId={args.product.id}>
            <DeliveryOptions {...args} />
            <DeliveryEstimateCalculatorTarget displayStyle="summary" />
        </ShippingDeliveryProvider>
    ),
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);
        const delivery = canvas.getByRole('radio', { name: 'Delivery' });
        const pickup = canvas.getByRole('radio', { name: /pickup in/i });

        await expect(delivery).toHaveAccessibleDescription('Enter postal code to see delivery estimate');
        await expect(
            canvas.queryByRole('button', { name: 'Enter postal code to see delivery estimate' })
        ).not.toBeInTheDocument();
        await userEvent.click(delivery);
        await waitFor(() => expect(delivery).toBeChecked());
        await expect(delivery.parentElement).toHaveTextContent('Enter postal code to see delivery estimate');

        const postalCode = await canvas.findByRole('textbox');
        await expect(postalCode).toHaveFocus();

        await userEvent.click(pickup);
        await waitFor(() => expect(pickup).toBeChecked());

        delivery.focus();
        await userEvent.keyboard(' ');
        await waitFor(() => expect(delivery).toBeChecked());
        await expect(canvas.getByRole('textbox')).toBe(postalCode);
    },
};
// @sfdc-extension-block-end SFDC_EXT_SHIPPING_DELIVERY
// @sfdc-extension-block-end SFDC_EXT_BOPIS
