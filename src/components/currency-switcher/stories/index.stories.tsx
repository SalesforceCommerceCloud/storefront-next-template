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
import { expect, within } from 'storybook/test';
import { waitForStorybookReady } from '@storybook/test-utils';
import { SiteProvider } from '@salesforce/storefront-next-runtime/site-context';
import { mockLocale, mockSiteObject } from '@/test-utils/config';
import CurrencySwitcher from '../index';

const meta: Meta<typeof CurrencySwitcher> = {
    title: 'Layout/Switchers/Currency Switcher',
    component: CurrencySwitcher,
    tags: ['autodocs', 'interaction'],
    parameters: {
        layout: 'padded',
        docs: {
            description: {
                component:
                    'A native `<select>` for changing currency. Persistence requires a server action + page reload, so a "change" interaction story would only repeat the steady-state assertion in `Default`. The two stories below cover the value-driven states (default GBP, preselected EUR).',
            },
        },
    },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);

        const select = await canvas.findByRole('combobox', {}, { timeout: 5000 });
        await expect(select).toHaveAttribute('aria-label');
        await expect(select).toHaveValue('GBP');

        const options = canvas.getAllByRole('option');
        await expect(options.length).toBe(2);
        await expect(canvas.getByRole('option', { name: /british pound/i })).toBeInTheDocument();
        await expect(canvas.getByRole('option', { name: /euro/i })).toBeInTheDocument();
    },
};

export const EuroSelected: Story = {
    decorators: [
        (Story) => (
            // Shadow the global StorybookSiteProvider so `useSite().currency` returns 'EUR'.
            // The inner SiteProvider wins because both providers use the same React context.
            <SiteProvider
                site={mockSiteObject}
                locale={mockLocale}
                language={mockSiteObject.defaultLocale}
                currency="EUR">
                <Story />
            </SiteProvider>
        ),
    ],
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);

        const select = await canvas.findByRole('combobox', {}, { timeout: 5000 });
        await expect(select).toHaveValue('EUR');
    },
};
