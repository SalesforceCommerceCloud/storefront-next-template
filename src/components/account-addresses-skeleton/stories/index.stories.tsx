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
import AccountAddressesSkeleton from '../index';

const meta: Meta<typeof AccountAddressesSkeleton> = {
    title: 'Account/Addresses/Account Addresses Skeleton',
    component: AccountAddressesSkeleton,
    parameters: {
        layout: 'padded',
        docs: {
            description: {
                component:
                    'Loading placeholder for /account/addresses. Mirrors the production grid of address cards so the page maintains layout dimensions while customer data resolves.',
            },
        },
    },
    tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
