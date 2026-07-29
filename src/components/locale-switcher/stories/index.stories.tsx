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
import { allModes } from '../../../../.storybook/modes';
import { expect, within, userEvent, waitFor } from 'storybook/test';
import { waitForStorybookReady } from '@storybook/test-utils';
import i18next from 'i18next';
import LocaleSwitcher from '../index';

/**
 * The real `LocaleSwitcher` performs `window.location.href = pathname` after a successful submit,
 * triggering a full page reload. `window.location` is `[Unforgeable]` in real browsers, so we
 * can't safely intercept the navigation here without elaborate test-runner shims. Instead, the
 * play functions below verify the *immediate, observable* effects of selecting an option:
 *   - the change event reaches `i18next` (the component awaits `i18n.changeLanguage(newLocale)`
 *     before posting to the action and before the redirect)
 *   - the `<select>` reflects the new value
 *
 * The actual page reload is exercised by E2E tests, not Storybook.
 */

const meta: Meta<typeof LocaleSwitcher> = {
    title: 'Layout/Switchers/Locale Switcher',
    component: LocaleSwitcher,
    parameters: {
        chromatic: { modes: { desktop: allModes.desktop } },
        layout: 'centered',
        docs: {
            description: {
                component:
                    'A language selector component that allows users to switch between supported locales. Changes are applied immediately on the client-side, persisted to the server via cookie, and trigger a full page reload so loaders, Suspense boundaries, and i18n re-run with the new locale.',
            },
        },
    },
    tags: ['autodocs', 'interaction'],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
    loaders: [
        async () => {
            await i18next.changeLanguage('en-GB');
            return {};
        },
    ],
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);

        const selector = canvas.getByRole('combobox');
        await expect(selector).toBeInTheDocument();
        await expect(selector).toHaveAttribute('aria-label');

        await expect(selector).toHaveValue('en-GB');

        // Endonyms — translation values are stored in each locale's own language
        await expect(canvas.getByRole('option', { name: /english.*uk/i })).toBeInTheDocument();
        await expect(canvas.getByRole('option', { name: /italiano.*italia/i })).toBeInTheDocument();
    },
};

export const ItalianSelected: Story = {
    loaders: [
        async () => {
            await i18next.changeLanguage('it-IT');
            return {};
        },
    ],
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);

        const selector = canvas.getByRole('combobox');
        await expect(selector).toBeInTheDocument();
        await expect(selector).toHaveValue('it-IT');

        await expect(canvas.getByRole('option', { name: /english.*uk/i })).toBeInTheDocument();
        await expect(canvas.getByRole('option', { name: /italiano.*italia/i })).toBeInTheDocument();
    },
};

export const SwitchLanguage: Story = {
    loaders: [
        async () => {
            await i18next.changeLanguage('en-GB');
            return {};
        },
    ],
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);

        const selector = canvas.getByRole('combobox');
        await expect(selector).toHaveValue('en-GB');

        await userEvent.selectOptions(selector, 'it-IT');

        // The real component awaits `i18n.changeLanguage(newLocale)` before submitting to the
        // server action, so we observe the i18next change synchronously after `selectOptions`.
        await waitFor(() => {
            expect(i18next.language).toBe('it-IT');
        });
        await expect(selector).toHaveValue('it-IT');
    },
};
