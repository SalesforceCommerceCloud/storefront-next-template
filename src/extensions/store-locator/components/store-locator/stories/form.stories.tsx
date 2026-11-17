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
import StoreLocatorForm from '../form';
import StoreLocatorProvider from '@/extensions/store-locator/providers/store-locator';

const meta: Meta<typeof StoreLocatorForm> = {
    title: 'Extensions/Store Locator/Store Locator Form',
    component: StoreLocatorForm,
    tags: ['autodocs'],
    parameters: {
        layout: 'padded',
        docs: {
            description: {
                component:
                    "Form for starting a Store Locator search by country and postal code, or by the shopper's current device location.",
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
                story: 'Initial form state with a country selector, postal-code search, and device-location alternative.',
            },
        },
    },
};
