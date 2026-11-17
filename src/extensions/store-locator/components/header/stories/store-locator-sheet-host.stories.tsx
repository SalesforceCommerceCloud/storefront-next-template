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
/** @sfdc-extension-file SFDC_EXT_STORE_LOCATOR */
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, within } from 'storybook/test';
import { waitForStorybookReady } from '@storybook/test-utils';
import { Button } from '@/components/ui/button';
import StoreLocatorSheetHost from '../store-locator-sheet-host';
import StoreLocatorProvider, { useStoreLocator } from '@/extensions/store-locator/providers/store-locator';

function StoreLocatorSheetHostStory() {
    const openStoreLocator = useStoreLocator((state) => state.open);

    return (
        <>
            <Button onClick={() => openStoreLocator()}>Open Store Locator</Button>
            <StoreLocatorSheetHost />
        </>
    );
}

const meta: Meta<typeof StoreLocatorSheetHost> = {
    title: 'Extensions/Store Locator/Store Locator Sheet Host',
    component: StoreLocatorSheetHost,
    tags: ['autodocs', 'interaction'],
    parameters: {
        layout: 'padded',
        mockRoutes: [
            {
                path: '/resource/boutiques',
                loader: () => ({ success: true, stores: [] }),
            },
            {
                path: '/resource/appointment-territories',
                loader: () => ({ success: false, error: 'SCHEDULER_NOT_CONFIGURED' }),
            },
        ],
        docs: {
            description: {
                component:
                    'Mounts one lazily loaded Store Locator sheet for every Store Locator entry point while the shared locator state is open.',
            },
        },
    },
    render: () => (
        <StoreLocatorProvider>
            <StoreLocatorSheetHostStory />
        </StoreLocatorProvider>
    ),
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);

        const canvas = within(canvasElement);
        await userEvent.click(canvas.getByRole('button', { name: 'Open Store Locator' }));
        await expect(await within(document.body).findByRole('dialog')).toBeInTheDocument();
    },
};
