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
import { useEffect, type ReactNode } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { ConfigProvider, useConfig } from '@salesforce/storefront-next-runtime/config';
import { expect } from 'storybook/test';
import { waitForStorybookReady } from '@storybook/test-utils';
import { useStoreLocator } from '@/extensions/store-locator/providers/store-locator';
import LocalAvailability from '@/extensions/bopis/components/refine-inventory/local-availability';

function AvailabilityState({ children, hasStore }: { children: ReactNode; hasStore: boolean }) {
    const config = useConfig();
    const setSelectedStoreInfo = useStoreLocator((state) => state.setSelectedStoreInfo);
    useEffect(() => {
        setSelectedStoreInfo(hasStore ? { id: 'A', inventoryId: 'list-A', name: 'Market Street Downtown' } : null);
    }, [hasStore, setSelectedStoreInfo]);
    return (
        <ConfigProvider
            config={{
                ...config,
                features: { ...config.features, localInventory: { enabled: true, nativeSearchVerified: false } },
            }}>
            {children}
        </ConfigProvider>
    );
}

const meta = {
    title: 'Extensions/BOPIS/Local Availability',
    component: LocalAvailability,
    tags: ['autodocs', 'interaction', 'local-availability'],
    decorators: [
        (Story, context) => (
            <AvailabilityState hasStore={context.parameters.selectedStore !== false}>
                <Story />
            </AvailabilityState>
        ),
    ],
} satisfies Meta<typeof LocalAvailability>;

export default meta;
type Story = StoryObj<typeof meta>;

export const NoStoreSelected: Story = {
    parameters: { selectedStore: false },
    play: async ({ canvas, canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        await expect(await canvas.findByRole('checkbox', { name: 'Show unavailable products' })).toBeDisabled();
    },
};

export const SelectedStore: Story = {
    play: async ({ canvas, canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        await expect(await canvas.findByRole('checkbox', { name: 'Show unavailable products' })).toBeChecked();
        await expect(canvas.getByRole('button', { name: 'Market Street Downtown' })).toBeInTheDocument();
    },
};

export const FilteringUnavailable: Story = {
    play: async ({ canvas, canvasElement, userEvent }) => {
        await waitForStorybookReady(canvasElement);
        const checkbox = await canvas.findByRole('checkbox', { name: 'Show unavailable products' });
        checkbox.focus();
        await userEvent.keyboard(' ');
        await expect(checkbox).toHaveFocus();
        await expect(checkbox).toBeChecked();
        await expect(canvas.getByRole('alert')).toHaveTextContent('Availability filtering is temporarily unavailable');
    },
};
