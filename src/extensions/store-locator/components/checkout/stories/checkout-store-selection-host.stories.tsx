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
import { storeEntryCapabilities } from '@/extensions/store-locator/lib/store-entry-capabilities';
import { expect, userEvent, within } from 'storybook/test';
import { waitForStorybookReady } from '@storybook/test-utils';
import { ConfigProvider } from '@salesforce/storefront-next-runtime/config';
import { Button } from '@/components/ui/button';
import { mockConfig } from '@/test-utils/config';
import StoreLocatorProvider, { useStoreLocatorApi } from '@/extensions/store-locator/providers/store-locator';
import CheckoutStoreSelectionHost from '@/extensions/store-locator/components/checkout/checkout-store-selection-host';

type Props = { enabled: boolean };
function Trigger({ enabled }: Props) {
    const api = useStoreLocatorApi();
    return (
        <div className="p-4 space-y-4">
            <p>{enabled ? 'Choose a shopping store for checkout.' : 'Store entry is disabled.'}</p>
            <Button
                disabled={!enabled}
                onClick={(event) => {
                    api.setState({ returnFocusTarget: event.currentTarget });
                    api.getState().open();
                }}>
                Choose shopping store
            </Button>
            <CheckoutStoreSelectionHost />
        </div>
    );
}
function Demo({ enabled }: Props) {
    const config: typeof mockConfig = {
        ...mockConfig,
        features: {
            ...mockConfig.features,
            storeEntry: { enabled, fulfillmentModes: ['pickup', 'delivery'] },
        },
    };
    return (
        <ConfigProvider config={config}>
            <StoreLocatorProvider key={String(enabled)} entryEnabled={enabled}>
                <Trigger enabled={enabled} />
            </StoreLocatorProvider>
        </ConfigProvider>
    );
}
const meta = {
    title: 'Extensions/Store Locator/Checkout Store Selection Host',
    component: CheckoutStoreSelectionHost,
    render: (args) => <Demo {...args} />,
    args: { enabled: true },
    argTypes: {
        enabled: { control: 'boolean', description: 'Enable the checkout entry point and its shared lazy chooser.' },
    },
    tags: ['autodocs', 'store-entry-remediation'],
    parameters: {
        layout: 'fullscreen',
        mockRoutes: [{ path: '/resource/boutiques', loader: () => ({ success: true, stores: [] }) }],
        docs: {
            description: {
                component:
                    'Checkout mounts the shared chooser only after the shopper opens it. This fixture does not submit store changes.',
            },
        },
    },
} satisfies Meta<Props>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Playground: Story = {};
export const Disabled: Story = { args: { enabled: false } };
export const OpenAndCancel: Story = {
    tags: ['interaction'],
    parameters: { snapshot: false },
    // This journey requires the canonical fulfillment-first chooser capability.
    play: storeEntryCapabilities.fulfillmentFirst
        ? async ({ canvasElement }) => {
              await waitForStorybookReady(canvasElement);
              const origin = within(canvasElement).getByRole('button', { name: 'Choose shopping store' });
              await userEvent.click(origin);
              const page = within(canvasElement.ownerDocument.body);
              await expect(await page.findByRole('dialog')).toBeVisible();
              await userEvent.keyboard('{Escape}');
              await expect(page.queryByRole('dialog')).not.toBeInTheDocument();
              await expect(origin).toHaveFocus();
          }
        : undefined,
};
