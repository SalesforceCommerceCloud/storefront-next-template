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
import { useEffect } from 'react';
import { expect, within, userEvent } from 'storybook/test';
import { waitForStorybookReady } from '@storybook/test-utils';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Form } from '@/components/ui/form';
import { PromoCodeFields, createPromoCodeFormSchema } from '../index';
import { getTranslation } from '@salesforce/storefront-next-runtime/i18n';

// Mock fetcher for Storybook
const mockFetcher = {
    state: 'idle' as const,
    data: undefined,
    formData: undefined,
    formMethod: undefined,
    formAction: undefined,
    formEncType: undefined,
    submit: (..._args: unknown[]) => undefined,
    load: (..._args: unknown[]) => undefined,
    Form: ({ children, ...props }: { children: React.ReactNode; [key: string]: unknown }) => (
        <form {...props}>{children}</form>
    ),
};

interface FieldsHarnessArgs {
    initialValue?: string;
    fetcherState?: 'idle' | 'submitting';
    triggerValidation?: boolean;
}

function FieldsHarness({ initialValue = '', fetcherState = 'idle', triggerValidation = false }: FieldsHarnessArgs) {
    const { t } = getTranslation();
    const promoCodeFormSchema = createPromoCodeFormSchema(t);
    const form = useForm({
        resolver: zodResolver(promoCodeFormSchema),
        defaultValues: { code: initialValue },
    });
    // `form.trigger()` schedules state updates; calling it during render produces
    // "Cannot update a component while rendering" warnings. Run in an effect.
    useEffect(() => {
        if (triggerValidation) {
            void form.trigger();
        }
    }, [triggerValidation, form]);
    const fetcher = { ...mockFetcher, state: fetcherState };
    return (
        <Form {...form}>
            <PromoCodeFields form={form} applyFetcher={fetcher as unknown as never} />
        </Form>
    );
}

const meta: Meta<typeof FieldsHarness> = {
    component: FieldsHarness,
    title: 'Cart/Promo Codes/Promo Code Fields',
    tags: ['autodocs', 'interaction'],
    parameters: {
        layout: 'padded',
        docs: {
            description: {
                component: `
\`<PromoCodeFields>\` is the input + submit-button row mounted inside the \`<PromoCodeForm>\` accordion. Stories cover the three real component states:

| Story | Description |
|-------|-------------|
| **Default** | Empty input, idle fetcher, button enabled |
| **LoadingState** | \`applyFetcher.state === 'submitting'\` — button is disabled and the spinner renders |
| **WithValidationError** | Zod schema rejects single-character input; the field displays an inline error |

The differentiating prop \`initialValue\` is exposed as a control rather than spawning an extra story per value (Pattern 10).
                `,
            },
        },
    },
    argTypes: {
        initialValue: {
            control: 'text',
            description:
                'Initial value seeded into the form. Drives the "with-initial-value" / "long-code" variants via the controls panel.',
        },
        fetcherState: {
            control: 'select',
            options: ['idle', 'submitting'],
            description: 'State of the apply fetcher — `submitting` disables the apply button.',
        },
        triggerValidation: {
            control: 'boolean',
            description: 'When true, triggers Zod validation on mount (used by `WithValidationError`).',
        },
    },
    args: {
        initialValue: '',
        fetcherState: 'idle',
        triggerValidation: false,
    },
    decorators: [
        (Story: React.ComponentType) => (
            <div className="max-w-md mx-auto p-6">
                <Story />
            </div>
        ),
    ],
};

type Story = StoryObj<typeof meta>;

export const Default: Story = {
    play: async ({ canvasElement }) => {
        const canvas = within(canvasElement);
        await waitForStorybookReady(canvasElement);

        const input = await canvas.findByPlaceholderText(/promo code|discount code|enter code/i);
        await expect(input).toBeInTheDocument();

        const button = await canvas.findByRole('button', { name: /apply|submit/i });
        await expect(button).toBeInTheDocument();
        await expect(button).not.toBeDisabled();

        await expect(input).toHaveValue('');

        // Smoke-test typing — also covers the previous "long code" scenario via the control.
        await userEvent.type(input, 'CUSTOM20');
        await expect(input).toHaveValue('CUSTOM20');
    },
};

export const LoadingState: Story = {
    args: {
        fetcherState: 'submitting',
    },
    parameters: {
        docs: {
            description: {
                story: 'Submit fetcher is in flight — apply button is disabled and the input remains editable.',
            },
        },
    },
    play: async ({ canvasElement }) => {
        const canvas = within(canvasElement);
        await waitForStorybookReady(canvasElement);

        const input = await canvas.findByPlaceholderText(/promo code|discount code|enter code/i);
        await expect(input).toBeInTheDocument();

        const button = await canvas.findByRole('button', { name: /apply|submit|loading/i });
        await expect(button).toBeInTheDocument();
        await expect(button).toBeDisabled();
        await expect(input).not.toBeDisabled();
    },
};

export const WithValidationError: Story = {
    args: {
        initialValue: 'A',
        triggerValidation: true,
    },
    parameters: {
        docs: {
            description: {
                story: 'Single-character input violates the Zod minimum-length rule; validation runs on mount and the field shows the inline error.',
            },
        },
    },
    play: async ({ canvasElement }) => {
        const canvas = within(canvasElement);
        const { t } = getTranslation();
        await waitForStorybookReady(canvasElement);

        const input = await canvas.findByDisplayValue('A');
        await expect(input).toBeInTheDocument();

        const button = await canvas.findByRole('button', { name: /apply|submit/i });
        await expect(button).toBeInTheDocument();

        // Validation message is rendered after the deferred trigger; wait for it.
        const errorMessage = await canvas.findByText(t('cart:promoCode.validation.minLength'));
        await expect(errorMessage).toBeInTheDocument();
    },
};

export default meta;
