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
import StoreLocatorBadge from '@/extensions/store-locator/components/header/store-locator-badge';
import StoreLocatorProvider from '@/extensions/store-locator/providers/store-locator';

const meta: Meta<typeof StoreLocatorBadge> = {
    title: 'Extensions/Store Locator/Store Locator Badge',
    component: StoreLocatorBadge,
    tags: ['autodocs'],
    parameters: {
        layout: 'padded',
        docs: {
            description: {
                component:
                    'Header trigger for opening the shared Store Locator sheet. The selected-store state exposes the store name, distance, and postal code in one accessible button.',
            },
        },
    },
    decorators: [
        (Story: React.ComponentType) => (
            <StoreLocatorProvider>
                <Story />
            </StoreLocatorProvider>
        ),
    ],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
    parameters: {
        docs: {
            description: {
                story: 'No selected store. The button opens the shared Store Locator sheet.',
            },
        },
    },
};

export const SelectedStore: Story = {
    decorators: [
        (Story: React.ComponentType) => (
            <StoreLocatorProvider
                selectedStoreInfo={{
                    id: 'downtown-store',
                    name: 'Downtown Store',
                    postalCode: '94105',
                    countryCode: 'US',
                    distance: 1.2,
                }}>
                <Story />
            </StoreLocatorProvider>
        ),
    ],
    parameters: {
        docs: {
            description: {
                story: 'Selected-store state with the store identity, distance, and postal code shown by the same trigger that opens the locator.',
            },
        },
    },
};
