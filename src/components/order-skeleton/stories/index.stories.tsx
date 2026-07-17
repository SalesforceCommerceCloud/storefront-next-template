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
import OrderSkeleton from '../index';

const meta: Meta<typeof OrderSkeleton> = {
    title: 'Account/Orders/Order Skeleton',
    component: OrderSkeleton,
    parameters: {
        layout: 'fullscreen',
        docs: {
            description: {
                component:
                    'Loading placeholder for /order-confirmation/$orderNo and /account/orders/$orderNo. Mirrors the order summary, shipping, payment, and action-button layout so the page reserves dimensions while order data resolves.',
            },
        },
    },
    tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
