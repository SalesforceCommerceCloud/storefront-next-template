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

import { useEffect, useRef, type ReactNode, type ReactElement } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { action } from 'storybook/actions';
import { expect, within, userEvent, waitFor } from 'storybook/test';
import { waitForStorybookReady } from '@storybook/test-utils';
import { Form } from '@/components/ui/form';
import {
    EmailUpdateFields,
    createEmailUpdateFormSchema,
    type EmailUpdateFormData,
    type EmailUpdateFetcherData,
} from '../index';
import type { ScapiFetcher } from '@/hooks/use-scapi-fetcher';
import { getTranslation } from '@salesforce/storefront-next-runtime/i18n';

function ActionLogger({ children }: { children: ReactNode }): ReactElement {
    const containerRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        const root = containerRef.current;
        if (!root) return;

        const logInput = action('form-input');
        const logInputValue = action('form-input-value');
        const logSubmit = action('form-submit');
        const logCancel = action('form-cancel');

        const isInsideHarness = (element: Element) => root.contains(element);

        const deriveLabel = (element: HTMLElement): string => {
            const ariaLabel = element.getAttribute('aria-label')?.trim();
            if (ariaLabel) return ariaLabel;

            if (element instanceof HTMLElement) {
                const label = element.closest('label');
                if (label) {
                    const labelText = label.textContent?.replace(/\s+/g, ' ').trim();
                    if (labelText) return labelText;
                }
            }

            if (element instanceof HTMLInputElement) {
                const placeholder = element.placeholder?.trim();
                if (placeholder) return placeholder;
            }

            const testId = element.getAttribute('data-testid')?.trim();
            return testId ?? '';
        };

        const handleChange = (event: Event) => {
            const target = event.target;
            if (!(target instanceof HTMLInputElement) || !isInsideHarness(target)) return;

            const label = deriveLabel(target);
            if (!label) return;

            logInput({ label });
            logInputValue({ label, value: target.value });
        };

        const handleSubmit = (event: SubmitEvent) => {
            const form = event.target;
            if (!(form instanceof HTMLFormElement) || !isInsideHarness(form)) return;

            event.preventDefault();

            logSubmit({});
        };

        const handleClick = (event: MouseEvent) => {
            const target = event.target;
            if (!(target instanceof HTMLElement) || !isInsideHarness(target)) return;

            if (target instanceof HTMLButtonElement && target.type === 'button') {
                const label = deriveLabel(target);
                if (label && label.toLowerCase().includes('cancel')) {
                    logCancel({});
                }
            }
        };

        root.addEventListener('change', handleChange, true);
        root.addEventListener('submit', handleSubmit, true);
        root.addEventListener('click', handleClick, true);

        return () => {
            root.removeEventListener('change', handleChange, true);
            root.removeEventListener('submit', handleSubmit, true);
            root.removeEventListener('click', handleClick, true);
        };
    }, []);

    return <div ref={containerRef}>{children}</div>;
}

// Helper function to create a mock fetcher
function createMockFetcher<TData = unknown>(
    initialState: 'idle' | 'loading' | 'submitting' = 'idle',
    initialData?: TData,
    initialSuccess: boolean = false,
    initialErrors?: string[]
): ScapiFetcher<TData> {
    return {
        state: initialState,
        data: initialData,
        success: initialSuccess,
        errors: initialErrors,

        load: async () => {},

        submit: async () => {},
        formAction: undefined,
        formData: undefined,
        formEncType: 'application/x-www-form-urlencoded',
        formMethod: 'GET',
        formTarget: undefined,
        text: undefined,
        json: undefined,
        Form: undefined as unknown,

        reset: () => {},
        type: 'init',
    } as unknown as ScapiFetcher<TData>;
}

/**
 * EmailUpdateFields component that renders the form fields for updating email address.
 */
const meta: Meta<typeof EmailUpdateFields> = {
    title: 'Account/Profile/Email Update Fields',
    component: EmailUpdateFields,
    tags: ['autodocs', 'interaction'],
    parameters: {
        layout: 'centered',
        docs: {
            description: {
                component: `
The Email Update Fields component renders the form fields for changing user email address.

**Features:**
- Email field
- Current password field (optional, controlled by \`requirePassword\` prop)
- Submit and cancel buttons
- Form validation feedback
                `,
            },
        },
    },
    decorators: [
        (Story) => (
            <ActionLogger>
                <div className="p-8 max-w-2xl">
                    <Story />
                </div>
            </ActionLogger>
        ),
    ],
    argTypes: {
        form: {
            description: 'React Hook Form instance for managing form state and validation',
            control: false,
        },
        updateFetcher: {
            description: 'React Router fetcher for handling email update requests',
            control: false,
        },
        onCancel: {
            description: 'Optional callback function to handle cancel action',
            action: 'cancel',
        },
        requirePassword: {
            description: 'Whether to require and display the current password field',
            control: 'boolean',
        },
    },
};

export default meta;
type Story = StoryObj<typeof EmailUpdateFields>;

/**
 * Default fields with empty form
 */
export const Default: Story = {
    render: function DefaultStory() {
        const { t } = getTranslation();
        const emailUpdateFormSchema = createEmailUpdateFormSchema(t);
        const form = useForm<EmailUpdateFormData>({
            resolver: zodResolver(emailUpdateFormSchema),
            defaultValues: {
                currentPassword: '',
                email: '',
            },
        });

        const updateFetcher = createMockFetcher<EmailUpdateFetcherData>('idle');

        const handleSubmit = form.handleSubmit(() => {
            // Form submission handled by story
        });

        return (
            <Form {...form}>
                <form onSubmit={(e) => void handleSubmit(e)} data-testid="email-update-fields-form" noValidate>
                    <EmailUpdateFields form={form} updateFetcher={updateFetcher} />
                </form>
            </Form>
        );
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);
        const { t } = getTranslation();

        // Verify email field is present
        const emailInput = await canvas.findByPlaceholderText(
            t('account:email.newEmailPlaceholder'),
            {},
            { timeout: 5000 }
        );
        await expect(emailInput).toBeInTheDocument();

        // Verify password field is present (requirePassword defaults to true)
        const passwordInput = await canvas.findByPlaceholderText(
            t('account:email.currentPasswordPlaceholder'),
            {},
            { timeout: 5000 }
        );
        await expect(passwordInput).toBeInTheDocument();

        // Verify submit button
        const submitButton = await canvas.findByRole(
            'button',
            { name: t('account:email.saveButton') },
            { timeout: 5000 }
        );
        await expect(submitButton).toBeInTheDocument();
    },
};

/**
 * Fields with initial values
 */
export const WithInitialValues: Story = {
    render: function WithInitialValuesStory() {
        const { t } = getTranslation();
        const emailUpdateFormSchema = createEmailUpdateFormSchema(t);
        const form = useForm<EmailUpdateFormData>({
            resolver: zodResolver(emailUpdateFormSchema),
            defaultValues: {
                currentPassword: 'MyPassword123',
                email: 'user@example.com',
            },
        });

        const updateFetcher = createMockFetcher<EmailUpdateFetcherData>('idle');

        const handleSubmit = form.handleSubmit(() => {
            // Form submission handled by story
        });

        return (
            <Form {...form}>
                <form onSubmit={(e) => void handleSubmit(e)} data-testid="email-update-fields-form" noValidate>
                    <EmailUpdateFields form={form} updateFetcher={updateFetcher} />
                </form>
            </Form>
        );
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);
        const { t } = getTranslation();

        // Verify email field is populated
        const emailInput = await canvas.findByPlaceholderText(
            t('account:email.newEmailPlaceholder'),
            {},
            { timeout: 5000 }
        );
        await expect(emailInput).toBeInTheDocument();
        await expect(emailInput).toHaveValue('user@example.com');

        // Verify password field is populated
        const passwordInput = await canvas.findByPlaceholderText(
            t('account:email.currentPasswordPlaceholder'),
            {},
            { timeout: 5000 }
        );
        await expect(passwordInput).toBeInTheDocument();
        await expect(passwordInput).toHaveValue('MyPassword123');
    },
};

/**
 * Fields with cancel button
 */
export const WithCancelButton: Story = {
    render: function WithCancelButtonStory() {
        const { t } = getTranslation();
        const emailUpdateFormSchema = createEmailUpdateFormSchema(t);
        const form = useForm<EmailUpdateFormData>({
            resolver: zodResolver(emailUpdateFormSchema),
            defaultValues: {
                currentPassword: '',
                email: '',
            },
        });

        const updateFetcher = createMockFetcher<EmailUpdateFetcherData>('idle');

        const handleSubmit = form.handleSubmit(() => {
            // Form submission handled by story
        });

        const handleCancel = () => {};

        return (
            <Form {...form}>
                <form onSubmit={(e) => void handleSubmit(e)} data-testid="email-update-fields-form" noValidate>
                    <EmailUpdateFields form={form} updateFetcher={updateFetcher} onCancel={handleCancel} />
                </form>
            </Form>
        );
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);
        const { t } = getTranslation();

        // Verify cancel button is present
        const cancelButton = await canvas.findByRole(
            'button',
            { name: t('account:email.cancelButton') },
            { timeout: 5000 }
        );
        await expect(cancelButton).toBeInTheDocument();
    },
};

/**
 * Fields in submitting state
 */
export const Submitting: Story = {
    render: function SubmittingStory() {
        const { t } = getTranslation();
        const emailUpdateFormSchema = createEmailUpdateFormSchema(t);
        const form = useForm<EmailUpdateFormData>({
            resolver: zodResolver(emailUpdateFormSchema),
            defaultValues: {
                currentPassword: 'MyPassword123',
                email: 'user@example.com',
            },
        });

        const updateFetcher = createMockFetcher<EmailUpdateFetcherData>('submitting');

        const handleSubmit = form.handleSubmit(() => {
            // Form submission handled by story
        });

        return (
            <Form {...form}>
                <form onSubmit={(e) => void handleSubmit(e)} data-testid="email-update-fields-form" noValidate>
                    <EmailUpdateFields form={form} updateFetcher={updateFetcher} />
                </form>
            </Form>
        );
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);

        // Verify submit button is disabled during submission
        const submitButton = await canvas.findByRole('button', { name: 'Saving...' }, { timeout: 5000 });
        await expect(submitButton).toBeInTheDocument();
        await expect(submitButton).toBeDisabled();
    },
};

/**
 * Interactive fields with user input
 */
export const Interactive: Story = {
    render: function InteractiveStory() {
        const { t } = getTranslation();
        const emailUpdateFormSchema = createEmailUpdateFormSchema(t);
        const form = useForm<EmailUpdateFormData>({
            resolver: zodResolver(emailUpdateFormSchema),
            defaultValues: {
                currentPassword: '',
                email: '',
            },
        });

        const updateFetcher = createMockFetcher<EmailUpdateFetcherData>('idle');

        const handleSubmit = form.handleSubmit(() => {
            // Form submission handled by story
        });

        return (
            <Form {...form}>
                <form onSubmit={(e) => void handleSubmit(e)} data-testid="email-update-fields-form" noValidate>
                    <EmailUpdateFields form={form} updateFetcher={updateFetcher} />
                </form>
            </Form>
        );
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);
        const { t } = getTranslation();

        // Interact with email field
        const emailInput = await canvas.findByPlaceholderText(
            t('account:email.newEmailPlaceholder'),
            {},
            { timeout: 5000 }
        );
        await userEvent.type(emailInput, 'newemail@example.com', { delay: 10 });
        await expect(emailInput).toHaveValue('newemail@example.com');

        // Interact with password field
        const passwordInput = await canvas.findByPlaceholderText(
            t('account:email.currentPasswordPlaceholder'),
            {},
            { timeout: 5000 }
        );
        await userEvent.type(passwordInput, 'MyPassword123', { delay: 10 });
        await expect(passwordInput).toHaveValue('MyPassword123');
    },
};

/**
 * Invalid email error state - email field fails Zod email validation on submit
 */
export const InvalidEmailError: Story = {
    render: function InvalidEmailErrorStory() {
        const { t } = getTranslation();
        const emailUpdateFormSchema = createEmailUpdateFormSchema(t);
        const form = useForm<EmailUpdateFormData>({
            resolver: zodResolver(emailUpdateFormSchema),
            defaultValues: {
                currentPassword: '',
                email: '',
            },
        });

        const updateFetcher = createMockFetcher<EmailUpdateFetcherData>('idle');

        const handleSubmit = form.handleSubmit(() => {});

        return (
            <Form {...form}>
                <form onSubmit={(e) => void handleSubmit(e)} data-testid="email-update-fields-form" noValidate>
                    <EmailUpdateFields form={form} updateFetcher={updateFetcher} />
                </form>
            </Form>
        );
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);
        const { t } = getTranslation();

        const emailInput = await canvas.findByPlaceholderText(
            t('account:email.newEmailPlaceholder'),
            {},
            { timeout: 5000 }
        );
        await userEvent.type(emailInput, 'not-an-email', { delay: 10 });

        const passwordInput = await canvas.findByPlaceholderText(
            t('account:email.currentPasswordPlaceholder'),
            {},
            { timeout: 5000 }
        );
        await userEvent.type(passwordInput, 'MyPassword123', { delay: 10 });

        const submitButton = await canvas.findByRole(
            'button',
            { name: t('account:email.saveButton') },
            { timeout: 5000 }
        );
        await userEvent.click(submitButton);

        await waitFor(
            async () => {
                await expect(emailInput).toHaveAttribute('aria-invalid', 'true');
                const formMessages = canvasElement.querySelectorAll('[data-slot="form-message"]');
                const hasEmailError = Array.from(formMessages).some((el) =>
                    /valid email|emailInvalid/i.test(el.textContent ?? '')
                );
                expect(hasEmailError).toBe(true);
            },
            { timeout: 5000 }
        );
    },
};

/**
 * Fields without password requirement
 */
export const WithoutPassword: Story = {
    render: function WithoutPasswordStory() {
        const { t } = getTranslation();
        const emailUpdateFormSchema = createEmailUpdateFormSchema(t, false);
        const form = useForm<EmailUpdateFormData>({
            resolver: zodResolver(emailUpdateFormSchema),
            defaultValues: {
                currentPassword: '',
                email: '',
            },
        });

        const updateFetcher = createMockFetcher<EmailUpdateFetcherData>('idle');

        const handleSubmit = form.handleSubmit(() => {
            // Form submission handled by story
        });

        return (
            <Form {...form}>
                <form onSubmit={(e) => void handleSubmit(e)} data-testid="email-update-fields-form" noValidate>
                    <EmailUpdateFields form={form} updateFetcher={updateFetcher} requirePassword={false} />
                </form>
            </Form>
        );
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);
        const { t } = getTranslation();

        // Verify email field is present
        const emailInput = await canvas.findByPlaceholderText(
            t('account:email.newEmailPlaceholder'),
            {},
            { timeout: 5000 }
        );
        await expect(emailInput).toBeInTheDocument();

        // Verify password field is NOT present
        const passwordInput = canvas.queryByPlaceholderText(t('account:email.currentPasswordPlaceholder'));
        await expect(passwordInput).not.toBeInTheDocument();
    },
};
