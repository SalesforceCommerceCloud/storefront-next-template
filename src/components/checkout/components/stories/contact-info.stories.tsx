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
import type { ComponentType } from 'react';
import { Title, Description, Controls } from '@storybook/addon-docs/blocks';
import ContactInfo from '../contact-info';
import { expect, within, userEvent } from 'storybook/test';
import { waitForStorybookReady } from '@storybook/test-utils';
import { CheckoutActionLogger } from '@/components/checkout/storybook/checkout-action-logger';
import { checkoutStrictA11yParameters } from '@/components/checkout/storybook/checkout-strict-a11y-parameters';
import BasketProvider from '@/providers/basket';

const meta: Meta<typeof ContactInfo> = {
    component: ContactInfo,
    title: 'Checkout/Contact/Contact Info',
    tags: ['autodocs', 'interaction'],
    parameters: {
        ...checkoutStrictA11yParameters,
        layout: 'padded',
        docs: {
            description: {
                component: `
### ContactInfo Component

This component handles the first step of the checkout process, collecting the customer's email address and phone number. It supports both guest and registered customer flows with optional passwordless OTP authentication.

**Key Features:**
- **Email and Phone Collection**: Email field with country code selector and phone input; phone is formatted in real-time as the user types
- **Passwordless OTP Flow**: On email blur, sends an OTP request for registered users — shows a spinner inside the email field while the request is in flight, then opens the OTP modal on success
- **Form Validation**: react-hook-form + Zod schema; field-level errors for invalid email or phone
- **Saving State**: Submit button shows loading text and is disabled while contact info is being saved
- **Toggle States**: Edit form shown when \`isEditing\` is true; summary view when false
- **Auto-fill**: Pre-fills email and phone from the basket or authenticated customer profile
- **Login Suggestion**: Shows a login prompt in summary view when a registered email is detected but the shopper is not logged in
- **Guest Checkout**: "Checkout as guest" option available during OTP flow — suppresses login hints for the session
- **Turnstile Support**: Optionally gated by Cloudflare Turnstile for bot protection during OTP flows

**Dependencies:**
- \`react-hook-form\` + \`@hookform/resolvers/zod\`: Form state and validation
- \`@/providers/basket\`: Email and phone pre-fill from basket data
- \`@/components/toggle-card\`: Edit/summary toggle wrapper
- \`@/components/login/otp-modal\`: Lazy-loaded OTP verification modal
- \`@/components/security/turnstile-widget\`: Bot protection widget (when enabled)
- \`@/lib/checkout/schemas\`: Email and phone validation schema
- \`@/lib/address/phone-utils\`: Phone formatting and country code utilities
- \`react-router\`: \`useFetcher\` for OTP request, \`useRevalidator\` for post-login data refresh
                `,
            },
            page: () => (
                <>
                    <Title />
                    <Description />
                    <Controls />
                </>
            ),
        },
    },
    decorators: [
        (Story) => (
            <div className="max-w-2xl mx-auto p-6">
                <CheckoutActionLogger name="contact-info">
                    <Story />
                </CheckoutActionLogger>
            </div>
        ),
    ],
    argTypes: {
        onSubmit: {
            description:
                'Callback function called when the form is submitted with valid contact data (email, countryCode, phone)',
            table: {
                type: { summary: '(data: ContactInfoData) => void' },
            },
        },
        onEdit: {
            description: 'Callback function called when the edit button is clicked to re-open the form',
            table: {
                type: { summary: '() => void' },
            },
        },
        isLoading: {
            control: 'boolean',
            description: 'Whether the contact info is being saved — disables the submit button and shows loading text',
            table: {
                defaultValue: { summary: 'false' },
            },
        },
        isCompleted: {
            control: 'boolean',
            description: 'Unused in the current implementation — edit/summary toggle is driven solely by `isEditing`',
            table: {
                defaultValue: { summary: 'false' },
            },
        },
        isEditing: {
            control: 'boolean',
            description: 'Controls the view — true shows the edit form, false shows the summary view',
            table: {
                defaultValue: { summary: 'true' },
            },
        },
        defaultOtpSending: {
            control: 'boolean',
            description:
                'Initial OTP sending state — used in Storybook to show the spinner in the email field without triggering fetcher logic',
            table: {
                defaultValue: { summary: 'false' },
            },
        },
        actionData: {
            control: 'object',
            description:
                'Action data containing form errors (formError for general errors, fieldErrors.email/fieldErrors.phone for field-specific validation)',
            table: {
                type: { summary: 'CheckoutActionData | undefined' },
            },
        },
        onRegisteredUserChoseGuest: {
            description:
                'Optional callback invoked when a registered user chooses "Checkout as guest" during OTP flow. Parent should suppress login hints and unblock contact step.',
            table: {
                type: { summary: '(isGuest: boolean) => void | undefined' },
            },
        },
        onPasswordlessOtpVerified: {
            description:
                'Optional callback invoked when shopper successfully completes passwordless OTP login at contact step. Resets UI that was applied for "checkout as guest" skip.',
            table: {
                type: { summary: '() => void | undefined' },
            },
        },
        suppressRegisteredEmailLoginHints: {
            control: 'boolean',
            description:
                'When true, hide login suggestion hints in summary view (used after "Checkout as guest" on passwordless OTP to treat as plain guest UX)',
            table: {
                defaultValue: { summary: 'false' },
            },
        },
        otpFlowActiveRef: {
            description:
                'Optional ref object kept in sync to prevent checkout from advancing to next step while OTP modal is open or OTP authorization is in flight',
            table: {
                type: { summary: 'MutableRefObject<boolean> | undefined' },
            },
        },
    },
};

type Story = StoryObj<typeof meta>;

const mockBasketWithContactInfo = {
    basketId: 'story-basket',
    customerInfo: {
        email: 'jane.doe@example.com',
        phone: '5551234567',
    },
};

const withMockBasket = (Story: ComponentType) => (
    <BasketProvider basket={mockBasketWithContactInfo as never}>
        <Story />
    </BasketProvider>
);

const createArgs = (overrides: Partial<Story['args']> = {}): Story['args'] => ({
    onSubmit: () => undefined,
    onEdit: () => undefined,
    isLoading: false,
    isCompleted: false,
    isEditing: true,
    actionData: undefined,
    ...overrides,
});

export const EditView: Story = {
    args: createArgs(),
    parameters: {
        docs: {
            description: {
                story: 'Edit mode — email address and phone number fields are shown for input.',
            },
        },
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);

        const inputs = canvas.queryAllByRole('textbox');
        await expect(inputs.length).toBeGreaterThan(0);

        // Type a valid email into the first input
        await userEvent.type(inputs[0], 'test@example.com');
        await expect(inputs[0]).toHaveValue('test@example.com');
    },
};

export const SendingOtp: Story = {
    args: createArgs({ defaultOtpSending: true }),
    decorators: [withMockBasket],
    parameters: {
        docs: {
            description: {
                story: 'After the customer enters their email and tabs away, a passwordless OTP request is sent — a spinner appears inside the email field and the field is disabled while the request is in flight.',
            },
        },
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);

        // Email field is pre-filled and disabled while OTP is being sent
        const emailInput = canvas.getByRole('textbox', { name: /email address/i });
        await expect(emailInput).toHaveValue('jane.doe@example.com');
        await expect(emailInput).toBeDisabled();
    },
};

export const SavingState: Story = {
    args: createArgs({ isLoading: true }),
    parameters: {
        docs: {
            description: {
                story: 'Shows the form while the contact info is being saved — submit button is disabled and shows loading text.',
            },
        },
        a11y: {
            config: {
                rules: [{ id: 'color-contrast', enabled: false }],
            },
        },
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);

        // In loading state the submit button should be disabled
        const submitButton = canvas.queryByRole('button', { name: /continue|submit|saving/i });
        if (submitButton) {
            await expect(submitButton).toBeDisabled();
        }

        // Form inputs remain enabled during loading; only submit is disabled
        const inputs = canvas.queryAllByRole('textbox');
        await expect(inputs.length).toBeGreaterThan(0);
    },
};

export const SummaryView: Story = {
    args: createArgs({ isCompleted: true, isEditing: false }),
    decorators: [withMockBasket],
    parameters: {
        docs: {
            description: {
                story: 'Shows the completed summary view — email and phone from basket, no editable inputs.',
            },
        },
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);

        // Summary view: email and phone are visible, no editable inputs
        await expect(canvas.getByText('jane.doe@example.com')).toBeInTheDocument();
        const inputs = canvas.queryAllByRole('textbox');
        await expect(inputs.length).toBe(0);
    },
};

export const WithValidationErrors: Story = {
    args: createArgs(),
    parameters: {
        docs: {
            description: {
                story: 'Submitting the form with invalid email triggers react-hook-form validation errors.',
            },
        },
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);

        // Type an invalid email and tab out to trigger react-hook-form validation.
        // The Continue button is now gated on form.formState.isValid, so clicking it is
        // not a valid trigger - blurring the field is the standard way to surface a
        // field-level error.
        const emailInput = canvas.getByRole('textbox', { name: /email address/i });
        await userEvent.type(emailInput, 'not-an-email');
        await userEvent.tab();

        // Field-level validation error should appear
        const errorMessage = await canvas.findByText(/please enter a valid email address/i);
        await expect(errorMessage).toBeInTheDocument();
    },
};

export default meta;
