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
import type { ComponentType } from 'react';
import { ConfigProvider } from '@salesforce/storefront-next-runtime/config';
import { mockConfig } from '@/test-utils/config';
import ProductMerchandisingGridSkeleton from '../skeleton';

const meta: Meta<typeof ProductMerchandisingGridSkeleton> = {
    title: 'Products/Product Merchandising Grid/Skeleton',
    component: ProductMerchandisingGridSkeleton,
    tags: ['autodocs'],
    parameters: {
        layout: 'fullscreen',
        docs: {
            description: {
                component: 'Layout-matching loading state for the bounded product merchandising grid.',
            },
        },
    },
    decorators: [
        (Story: ComponentType) => (
            <ConfigProvider config={mockConfig}>
                <Story />
            </ConfigProvider>
        ),
    ],
    argTypes: {
        columns: {
            control: 'inline-radio',
            options: [2, 3, 4],
            description: 'Number of skeleton columns at desktop widths.',
        },
        rows: {
            control: { type: 'range', min: 1, max: 6, step: 1 },
            description: 'Number of bounded skeleton rows to display.',
        },
        title: { table: { disable: true } },
        shopAllUrl: { table: { disable: true } },
        shopAllText: { table: { disable: true } },
        className: { table: { disable: true } },
    },
};

export default meta;
type Story = StoryObj<typeof ProductMerchandisingGridSkeleton>;

export const Default: Story = {
    args: {
        columns: 3,
        rows: 2,
        title: 'Featured pieces',
        shopAllUrl: '/category/root',
        shopAllText: 'Shop all furniture',
    },
};
