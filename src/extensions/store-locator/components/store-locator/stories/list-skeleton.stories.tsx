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
import ListSkeleton from '../list-skeleton';

const meta: Meta<typeof ListSkeleton> = {
    title: 'Extensions/Store Locator/List Skeleton',
    component: ListSkeleton,
    tags: ['autodocs'],
    parameters: {
        layout: 'padded',
        docs: {
            description: {
                component: `
The ListSkeleton component displays a loading skeleton for the store locator list.

## Features

- **Loading State**: Shows skeleton placeholders while stores are loading
- **Status Message**: Optional status message above the skeleton
- **Responsive Layout**: Adapts to mobile and desktop layouts

## Usage

This component is used in StoreLocatorList to show loading state while fetching store data.
                `,
            },
        },
    },
    argTypes: {
        statusMessage: {
            description: 'Optional status message to display above the skeleton',
            control: 'text',
        },
    },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
    args: {
        statusMessage: null,
    },
    parameters: {
        docs: {
            description: {
                story: `
Default list skeleton showing:
- 10 skeleton rows
- Radio button placeholders
- Store name and address placeholders
- No status message

This is the default loading state.
                `,
            },
        },
    },
};

export const WithStatusMessage: Story = {
    args: {
        statusMessage: 'Searching for stores within 100 km of 94102...',
    },
    parameters: {
        docs: {
            description: {
                story: `
List skeleton with status message. Shows:
- Status message above skeleton
- 10 skeleton rows
- Loading indicators

This state appears when a search is in progress.
                `,
            },
        },
    },
};
