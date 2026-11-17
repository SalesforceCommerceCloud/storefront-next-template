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
import ShopByStoreScaffold from '../shop-by-store-scaffold';
import { ShopByStoreSelectorPanel } from '../shop-by-store-sheet';
import type { ShopByStoreState } from '@/extensions/shop-by-store';

const meta: Meta<typeof ShopByStoreScaffold> = {
    title: 'Extensions/Shop By Store/Shop By Store Scaffold',
    component: ShopByStoreScaffold,
    tags: ['autodocs', 'interaction'],
    parameters: {
        layout: 'fullscreen',
        docs: {
            description: {
                component:
                    'Fixture-only store-selection states for experience design. This scaffold does not register a storefront target or persist a store selection.',
            },
        },
    },
    argTypes: {
        initialSelectedStore: { table: { disable: true } },
        initialSelectorState: { table: { disable: true } },
        initialSheetOpen: { table: { disable: true } },
    },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);

        await userEvent.click(canvas.getByRole('button', { name: 'Choose a store' }));
        const dialog = await within(document.body).findByRole('dialog');
        await userEvent.click(within(dialog).getByRole('radio', { name: /central market/i }));

        await waitFor(() => expect(within(document.body).queryByRole('dialog')).not.toBeInTheDocument());
        await expect(canvas.getByRole('button', { name: /current store: central market/i })).toBeInTheDocument();
    },
};

export const Loading: Story = {
    render: () => <SelectorStateStory state="loading" />,
};

function SelectorStateStory({ state }: { state: ShopByStoreState }) {
    return <ShopByStoreSelectorPanel state={state} onRetry={() => undefined} />;
}

export const EmptyResults: Story = {
    render: () => <SelectorStateStory state="empty" />,
};

export const LocationDenied: Story = {
    render: () => <SelectorStateStory state="location-denied" />,
};

export const SearchError: Story = {
    render: () => <SelectorStateStory state="search-error" />,
};

export const SelectionError: Story = {
    render: () => <SelectorStateStory state="selection-error" />,
};
