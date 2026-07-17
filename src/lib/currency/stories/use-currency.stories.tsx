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
import { expect, within, waitFor } from 'storybook/test';
import { waitForStorybookReady } from '@storybook/test-utils';
import { useCurrency } from '../use-currency';

const SUPPORTED = ['USD', 'GBP', 'EUR'];

// Harness: loader currency is neutral (USD); a GBP cookie should win post-hydration.
function CurrencyHarness() {
    const currency = useCurrency('USD', SUPPORTED, 'currency');
    return (
        <output data-testid="currency" aria-label="Current currency">
            {currency}
        </output>
    );
}

const meta: Meta<typeof CurrencyHarness> = {
    title: 'Core/Utilities/useCurrency',
    component: CurrencyHarness,
    tags: ['interaction'],
};
export default meta;

type Story = StoryObj<typeof meta>;

export const RestoresFromCookie: Story = {
    loaders: [
        async () => {
            // Set cookie before component mounts — React Router createCookie('currency').serialize('GBP') → IkdCUCI%3D
            document.cookie = 'currency=IkdCUCI%3D; path=/';

            const warnings: string[] = [];
            // eslint-disable-next-line no-console
            const original = console.error;
            // eslint-disable-next-line no-console
            console.error = (...args: unknown[]) => {
                warnings.push(String(args[0]));
                original(...args);
            };

            return { warnings, original };
        },
    ],
    play: async ({ canvasElement, loaded }) => {
        await waitForStorybookReady(canvasElement);

        const { warnings, original } = loaded as { warnings: string[]; original: typeof console.error };
        try {
            const canvas = within(canvasElement);
            // Hook should restore to GBP from cookie
            await waitFor(() => expect(canvas.getByTestId('currency')).toHaveTextContent('GBP'));
            // The load-bearing property: no hydration-mismatch warning.
            expect(warnings.some((w) => /hydrat/i.test(w))).toBe(false);
        } finally {
            // eslint-disable-next-line no-console
            console.error = original;
            // Cleanup
            document.cookie = 'currency=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/';
        }
    },
};
