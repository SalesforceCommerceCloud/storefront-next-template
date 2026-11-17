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
import { useState, type ReactElement } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import { waitForStorybookReady } from '@storybook/test-utils';
import { Button } from '@/components/ui/button';
import ShopByStoreSheet from '../shop-by-store-sheet';

function ShopByStoreSheetStory({ initialOpen = false }: { initialOpen?: boolean }): ReactElement {
    const [open, setOpen] = useState(initialOpen);

    return (
        <ShopByStoreSheet
            open={open}
            onOpenChange={setOpen}
            state="results"
            onSelect={() => setOpen(false)}
            onRetry={() => undefined}>
            <Button variant="secondary">Choose a store</Button>
        </ShopByStoreSheet>
    );
}

const meta: Meta<typeof ShopByStoreSheet> = {
    title: 'Extensions/Shop By Store/Shop By Store Sheet',
    component: ShopByStoreSheet,
    tags: ['autodocs', 'interaction'],
    parameters: {
        layout: 'padded',
        docs: {
            description: {
                component:
                    'Controlled sheet for the fixture-driven Shop by Store selector. The sheet closes after choosing a store.',
            },
        },
    },
    argTypes: {
        children: { table: { disable: true } },
        open: { table: { disable: true } },
        onOpenChange: { table: { disable: true } },
        state: { table: { disable: true } },
        selectedStoreId: { table: { disable: true } },
        onSelect: { table: { disable: true } },
        onRetry: { table: { disable: true } },
    },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
    render: () => <ShopByStoreSheetStory />,
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);

        await userEvent.click(canvas.getByRole('button', { name: 'Choose a store' }));
        const dialog = await within(document.body).findByRole('dialog');

        await userEvent.click(within(dialog).getByRole('radio', { name: /central market/i }));
        await waitFor(() => expect(within(document.body).queryByRole('dialog')).not.toBeInTheDocument());
    },
};

export const Open: Story = {
    render: () => <ShopByStoreSheetStory initialOpen />,
    parameters: {
        snapshot: true,
    },
};
