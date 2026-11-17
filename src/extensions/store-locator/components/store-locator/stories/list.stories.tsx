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
import type { ReactNode } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import StoreLocatorList from '../list';
import StoreLocatorProvider from '@/extensions/store-locator/providers/store-locator';

function StoryWrapper({ children }: { children: ReactNode }) {
    return <StoreLocatorProvider>{children}</StoreLocatorProvider>;
}

const meta: Meta<typeof StoreLocatorList> = {
    title: 'Extensions/Store Locator/Store Locator List',
    component: StoreLocatorList,
    tags: ['autodocs'],
    parameters: {
        layout: 'padded',
        docs: {
            description: {
                component:
                    'Search-result list for the Store Locator. Before a shopper searches, it intentionally renders no content; searched, loading, and error states are covered by its component tests.',
            },
        },
    },
    decorators: [
        (Story: React.ComponentType) => (
            <StoryWrapper>
                <Story />
            </StoryWrapper>
        ),
    ],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
    parameters: {
        docs: {
            description: {
                story: 'Initial state before a search. The list intentionally renders no DOM until the Store Locator has a result, loading state, or error to show.',
            },
        },
    },
};
