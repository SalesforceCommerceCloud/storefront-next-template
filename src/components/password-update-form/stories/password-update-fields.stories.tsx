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
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import { waitForStorybookReady } from '@storybook/test-utils';
import { Form } from '@/components/ui/form';
import {
    PasswordUpdateFields,
    createPasswordUpdateFormSchema,
    type PasswordUpdateFormData,
    type PasswordUpdateFetcherData,
} from '../index';
import type { ScapiFetcher } from '@/hooks/use-scapi-fetcher';
import { getTranslation } from '@salesforce/storefront-next-runtime/i18n';

function createMockFetcher(state: 'idle' | 'submitting' = 'idle'): ScapiFetcher<PasswordUpdateFetcherData> {
    return {
        state,
        data: undefined,
        success: false,
        errors: undefined,
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
    } as unknown as ScapiFetcher<PasswordUpdateFetcherData>;
}

interface HarnessProps {
    defaultValues?: Partial<PasswordUpdateFormData>;
    fetcherState?: 'idle' | 'submitting';
    showCancel?: boolean;
}

function PasswordUpdateFieldsHarness({ defaultValues, fetcherState = 'idle', showCancel = false }: HarnessProps) {
    const { t } = getTranslation();
    const form = useForm<PasswordUpdateFormData>({
        resolver: zodResolver(createPasswordUpdateFormSchema(t)),
        defaultValues: {
            currentPassword: '',
            password: '',
            confirmPassword: '',
            ...defaultValues,
        },
    });
    const updateFetcher = createMockFetcher(fetcherState);
    const handleSubmit = form.handleSubmit(() => {});

    return (
        <Form {...form}>
            <form onSubmit={(e) => void handleSubmit(e)} data-testid="password-update-fields-form">
                <PasswordUpdateFields
                    form={form}
                    updateFetcher={updateFetcher}
                    onCancel={showCancel ? () => {} : undefined}
                />
            </form>
        </Form>
    );
}

const meta: Meta<HarnessProps> = {
    title: 'Account/Profile/Password Update Form',
    component: PasswordUpdateFieldsHarness,
    tags: ['autodocs', 'interaction'],
    parameters: {
        layout: 'centered',
        docs: {
            description: {
                component:
                    'Form fields for the in-account password change flow. Renders current / new / confirm password inputs with the live `PasswordRequirement` checklist plus save (and optional cancel) buttons. The submit button shows "Saving..." and is disabled when the fetcher is `submitting`.',
            },
        },
    },
    argTypes: {
        showCancel: {
            control: 'boolean',
            description: 'When true, renders the optional Cancel button alongside Save.',
        },
        fetcherState: {
            control: 'radio',
            options: ['idle', 'submitting'],
            description: 'Drives the submit button label and disabled state.',
        },
    },
    decorators: [
        (Story) => (
            <div className="p-8 max-w-2xl">
                <Story />
            </div>
        ),
    ],
    render: (args) => <PasswordUpdateFieldsHarness {...args} />,
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);

        await expect(canvas.getByLabelText(/current password/i)).toBeInTheDocument();
        await expect(canvas.getByLabelText(/^new password/i)).toBeInTheDocument();
        await expect(canvas.getByLabelText(/^confirm new password/i)).toBeInTheDocument();
        await expect(canvas.getByRole('button', { name: /save/i })).toBeInTheDocument();
    },
};

export const WithInitialValues: Story = {
    args: {
        defaultValues: {
            currentPassword: 'OldPassword123',
            password: 'NewPassword123!',
            confirmPassword: 'NewPassword123!',
        },
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);

        await expect(canvas.getByLabelText(/current password/i)).toHaveValue('OldPassword123');
        await expect(canvas.getByLabelText(/^new password/i)).toHaveValue('NewPassword123!');
        await expect(canvas.getByLabelText(/^confirm new password/i)).toHaveValue('NewPassword123!');
    },
};

export const Submitting: Story = {
    args: {
        defaultValues: {
            currentPassword: 'OldPassword123',
            password: 'NewPassword123!',
            confirmPassword: 'NewPassword123!',
        },
        fetcherState: 'submitting',
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);

        const submitButton = canvas.getByRole('button', { name: 'Saving...' });
        await expect(submitButton).toBeDisabled();
    },
};

export const WithCancelButton: Story = {
    args: { showCancel: true },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);

        await expect(canvas.getByRole('button', { name: /cancel/i })).toBeInTheDocument();
    },
};

export const PasswordMismatchError: Story = {
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);

        await userEvent.type(canvas.getByLabelText(/current password/i), 'OldPassword123');
        await userEvent.type(canvas.getByLabelText(/^new password/i), 'NewPassword123!');
        const confirmInput = canvas.getByLabelText(/^confirm new password/i);
        await userEvent.type(confirmInput, 'DifferentPassword123!');
        await userEvent.click(canvas.getByRole('button', { name: /save/i }));

        await waitFor(
            async () => {
                await expect(confirmInput).toHaveAttribute('aria-invalid', 'true');
            },
            { timeout: 5000 }
        );
    },
};
