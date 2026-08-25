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
import DeliveryOptions from '../delivery-options';
import { masterProductWithInventories } from '@/components/__mocks__/master-product-with-inventories';

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
// @sfdc-extension-block-end SFDC_EXT_BOPIS
