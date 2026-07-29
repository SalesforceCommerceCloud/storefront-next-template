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
import { expect, userEvent, within } from 'storybook/test';
import { waitForStorybookReady } from '@storybook/test-utils';
import { MarketingConsent, type MarketingConsentSubscriptions } from '../index';

const defaultSubscriptions: MarketingConsentSubscriptions = {
    data: [
        {
            subscriptionId: 'Sale',
            channels: ['email'],
            title: 'Sale',
            consentType: 'marketing',
            consentRequired: false,
            defaultStatus: 'opt_out',
            tags: [],
            consentStatus: [{ channel: 'email', contactPointValue: 'user@example.com', status: 'opt_out' }],
        },
        {
            subscriptionId: 'Newsletter',
            channels: ['email'],
            title: 'Newsletter',
            consentType: 'marketing',
            consentRequired: false,
            defaultStatus: 'opt_out',
            tags: [],
            consentStatus: [{ channel: 'email', contactPointValue: 'user@example.com', status: 'opt_in' }],
        },
    ],
};

const meta: Meta<typeof MarketingConsent> = {
    title: 'Account/Marketing Consent',
    component: MarketingConsent,
    args: {
        subscriptions: defaultSubscriptions,
        contactPointValueByChannel: { email: 'user@example.com' },
    },
    parameters: {
        layout: 'padded',
        docs: {
            description: {
                component:
                    'Marketing & Communication Preferences section on the Account Details page. Subscriptions come from getSubscriptions (loader); opt-in/opt-out status from API consentStatus. contactPointValueByChannel (e.g. user email/phone) is sent with updates; switches are disabled when no contact point for that channel. Switches are controlled and reflect server data after revalidation; on update failure they revert to the previous state and an error toast is shown.',
            },
        },
    },
    tags: ['autodocs', 'interaction'],
};

export default meta;
type Story = StoryObj<typeof MarketingConsent>;

export const Default: Story = {
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);

        await expect(canvas.getByText('Marketing & Communication Preferences')).toBeInTheDocument();
        const editButton = canvas.getByRole('button', { name: /edit marketing preferences/i });
        await expect(editButton).toHaveAttribute('aria-label', 'Edit marketing preferences');
        await expect(canvas.getByRole('heading', { level: 2, name: 'Email' })).toBeInTheDocument();
        const switches = canvas.getAllByRole('switch');
        await expect(switches).toHaveLength(2);
        await expect(canvas.getByText('Sale')).toBeInTheDocument();
        await expect(canvas.getByText('Newsletter')).toBeInTheDocument();
    },
};

export const SwitchesDisabledNoContactPoint: Story = {
    args: {
        subscriptions: defaultSubscriptions,
        contactPointValueByChannel: undefined,
    },
    parameters: { snapshot: false },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);

        // Click Edit first so switches enter editable mode — otherwise they're
        // disabled simply because the section isn't being edited, and this
        // story passes for the wrong reason. We want to prove that disabled-
        // ness specifically tracks the missing `contactPointValueByChannel`.
        await userEvent.click(canvas.getByRole('button', { name: /edit marketing preferences/i }));

        const switches = canvas.getAllByRole('switch');
        await expect(switches).toHaveLength(2);
        for (const sw of switches) {
            await expect(sw).toBeDisabled();
        }
    },
};
