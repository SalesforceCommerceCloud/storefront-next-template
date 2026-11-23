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
import { useState, type ComponentProps } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { storeEntryCapabilities } from '@/extensions/store-locator/lib/store-entry-capabilities';
import { expect, userEvent, within } from 'storybook/test';
import { waitForStorybookReady } from '@storybook/test-utils';
import { ConfigProvider } from '@salesforce/storefront-next-runtime/config';
import { Button } from '@/components/ui/button';
import { mockConfig } from '@/test-utils/config';
import StoreLocatorProvider from '@/extensions/store-locator/providers/store-locator';
import StoreEntryGate from '@/extensions/store-locator/components/store-entry-gate';

type Props = ComponentProps<typeof StoreEntryGate> & {
    enabled: boolean;
    policy: 'soft' | 'required';
    hasSelection: boolean;
};
function Demo({ enabled, policy, hasSelection }: Props) {
    const [shopping, setShopping] = useState(false);
    const config = {
        ...mockConfig,
        features: {
            ...mockConfig.features,
            storeEntry: { enabled, policy, fulfillmentModes: ['pickup', 'delivery'] as ('pickup' | 'delivery')[] },
        },
    };
    const selected = hasSelection
        ? {
              id: 'fixture-store',
              inventoryId: 'fixture-inventory',
              name: 'Market Street',
              fulfillmentMode: 'delivery' as const,
          }
        : null;
    return (
        <ConfigProvider config={config}>
            <StoreLocatorProvider
                key={JSON.stringify([enabled, policy, hasSelection])}
                selectedStoreInfo={selected}
                entryEnabled={enabled}>
                <main id="main-content" tabIndex={-1} className="p-4">
                    {shopping ? (
                        <StoreEntryGate>
                            <h1>Shopping content</h1>
                            <p>The requested shopping page is available.</p>
                        </StoreEntryGate>
                    ) : (
                        <Button onClick={() => setShopping(true)}>Open shopping page</Button>
                    )}
                </main>
            </StoreLocatorProvider>
        </ConfigProvider>
    );
}
const meta = {
    title: 'Extensions/Store Locator/Store Entry Gate',
    component: StoreEntryGate,
    render: (args) => <Demo {...args} />,
    args: { enabled: true, policy: 'required', hasSelection: false },
    argTypes: {
        enabled: { control: 'boolean', description: 'Enable store entry for this shopping route.' },
        policy: {
            control: 'radio',
            options: ['soft', 'required'],
            description: 'Soft entry permits browsing; required entry gates shopping until selection.',
        },
        hasSelection: { control: 'boolean', description: 'Supply a committed shopping store and delivery mode.' },
        children: { table: { disable: true } },
    },
    tags: ['autodocs', 'store-entry-remediation'],
    parameters: {
        layout: 'fullscreen',
        routeLoaderData: { 'routes/_app.p.$': {} },
        mockRoutes: [{ path: '/resource/boutiques', loader: () => ({ success: true, stores: [] }) }],
        docs: {
            description: {
                component:
                    'Open the sample shopping page to compare entry policies. Required entry can be dismissed to a continuation gate; no product is added. Uses fixture selection state.',
            },
        },
    },
} satisfies Meta<Props>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Playground: Story = {};
export const RequiredDismissal: Story = {
    tags: ['interaction'],
    parameters: { snapshot: false },
    // This journey requires the canonical fulfillment-first chooser capability.
    play: storeEntryCapabilities.fulfillmentFirst
        ? async ({ canvasElement }) => {
              await waitForStorybookReady(canvasElement);
              const page = within(canvasElement.ownerDocument.body);
              await userEvent.click(within(canvasElement).getByRole('button', { name: 'Open shopping page' }));
              await expect(await page.findByRole('dialog')).toBeVisible();
              await userEvent.keyboard('{Escape}');
              await expect(page.getByRole('heading', { name: 'Choose a store to continue' })).toBeVisible();
              const reopen = page.getByRole('button', { name: 'Choose store' });
              await expect(reopen).toHaveFocus();
              await expect(page.queryByRole('heading', { name: 'Shopping content' })).not.toBeInTheDocument();
              await userEvent.click(reopen);
              await expect(await page.findByRole('dialog')).toBeVisible();
              await userEvent.keyboard('{Escape}');
          }
        : undefined,
};
export const SoftEntry: Story = {
    tags: ['interaction'],
    args: { policy: 'soft' },
    parameters: { snapshot: false },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);
        await userEvent.click(canvas.getByRole('button', { name: 'Open shopping page' }));
        await expect(canvas.getByRole('heading', { name: 'Shopping content' })).toBeVisible();
        await expect(within(canvasElement.ownerDocument.body).queryByRole('dialog')).not.toBeInTheDocument();
    },
};
