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
import { expect, within, userEvent } from 'storybook/test';
import { waitForStorybookReady } from '@storybook/test-utils';
import { getTranslation } from '@salesforce/storefront-next-runtime/i18n';
import { AppToaster } from '@/components/toast';
import Contact from '../index';
import { checkoutStrictA11yParameters } from '@/components/checkout/storybook/checkout-strict-a11y-parameters';

const meta: Meta<typeof Contact> = {
    title: 'Content/Marketing/Contact',
    component: Contact,
    tags: ['autodocs', 'interaction'],
    parameters: {
        ...checkoutStrictA11yParameters,
        layout: 'fullscreen',
        docs: {
            description: {
                component: `
Page-level Contact component used on the about-us / contact route. Two-column layout: localized support copy + phone link on the left, and a contact form (Full Name / Email / Topic / Message) on the right. Uses HTML5 \`required\` validation and the standard React Router \`<Form>\`. On successful submit, raises a Sonner toast and clears all fields.

Page-level coverage per WI Step 5 — the story renders the entire surface with form + sidebar, not isolated form controls.
                `,
            },
        },
    },
    decorators: [
        (Story) => (
            <div className="bg-background px-6 py-10">
                <Story />
            </div>
        ),
    ],
};

export default meta;
type Story = StoryObj<typeof Contact>;

export const Default: Story = {
    render: () => <Contact />,
    play: async ({ canvasElement }) => {
        const { t } = getTranslation();
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);

        await expect(canvas.getByRole('heading', { name: t('aboutUs:contact.title') })).toBeInTheDocument();
        await expect(canvas.getByText(t('aboutUs:contact.phoneDisplay'))).toBeInTheDocument();
        await expect(canvas.getByPlaceholderText(t('aboutUs:contact.form.placeholders.fullName'))).toBeInTheDocument();
        await expect(canvas.getByPlaceholderText(t('aboutUs:contact.form.placeholders.email'))).toBeInTheDocument();
        await expect(canvas.getByPlaceholderText(t('aboutUs:contact.form.placeholders.topic'))).toBeInTheDocument();
        await expect(canvas.getByPlaceholderText(t('aboutUs:contact.form.placeholders.message'))).toBeInTheDocument();
        await expect(canvas.getByRole('button', { name: t('aboutUs:contact.form.submit') })).toBeInTheDocument();
    },
};

export const FormValidationAndSubmission: Story = {
    render: () => (
        <>
            <AppToaster />
            <Contact />
        </>
    ),
    play: async ({ canvasElement }) => {
        const { t } = getTranslation();
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);

        const fullNameInput = canvas.getByPlaceholderText(t('aboutUs:contact.form.placeholders.fullName'));
        const emailInput = canvas.getByPlaceholderText(t('aboutUs:contact.form.placeholders.email'));
        const topicInput = canvas.getByPlaceholderText(t('aboutUs:contact.form.placeholders.topic'));
        const messageInput = canvas.getByPlaceholderText(t('aboutUs:contact.form.placeholders.message'));
        const submitButton = canvas.getByRole('button', { name: t('aboutUs:contact.form.submit') });

        await userEvent.click(submitButton);
        await expect(fullNameInput).toBeInvalid();
        await expect(emailInput).toBeInvalid();
        await expect(topicInput).toBeInvalid();
        await expect(messageInput).toBeInvalid();

        await userEvent.type(fullNameInput, 'Jamie Doe');
        await userEvent.type(topicInput, 'Order support');
        await userEvent.type(messageInput, 'Can you help me update a shipping address?');
        await userEvent.type(emailInput, 'not-an-email');
        await expect(emailInput).toBeInvalid();

        await userEvent.clear(emailInput);
        await userEvent.type(emailInput, 'jamie.doe@example.com');

        await userEvent.click(submitButton);

        // Post-submission state (AC #5 / WI Step 6): form clears and the success toast appears.
        await expect(fullNameInput).toHaveValue('');
        await expect(emailInput).toHaveValue('');
        await expect(topicInput).toHaveValue('');
        await expect(messageInput).toHaveValue('');

        // Sonner portals the toast to document.body, not into the canvas root.
        // Use within(document.body) to find it.
        const body = within(document.body);
        await expect(await body.findByText(t('aboutUs:contact.toast.success'))).toBeInTheDocument();
    },
};
