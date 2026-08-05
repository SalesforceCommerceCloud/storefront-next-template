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
import { useLayoutEffect, type ComponentType } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import { waitForStorybookReady } from '@storybook/test-utils';
import { createConfigWrapper } from '@/test-utils/config';
import { RequestCodeForm } from '../request-code-form';

const ORDER_LOOKUP_ACTION_PATH = '/action/order-lookup-request-code';

const requestCodeAction = (data: { ok: true } | { ok: false; code: string }) => ({
    path: ORDER_LOOKUP_ACTION_PATH,
    action: () => data,
});

// Mirrors the mock in security/stories/turnstile-widget.stories.tsx: stubs
// `window.turnstile` so the widget resolves a token without loading the real
// Cloudflare script, letting stories drive a real form submission end-to-end.
function installTurnstileMock() {
    const w = window as Window & {
        turnstile?: {
            render: (container: string | HTMLElement, options: { callback?: (token: string) => void }) => string;
            execute: () => void;
            reset: () => void;
            remove: () => void;
            getResponse: () => string;
        };
    };
    const previous = w.turnstile;
    document.getElementById('turnstile-script')?.remove();
    w.turnstile = {
        render(_container, options) {
            queueMicrotask(() => options.callback?.('mock-turnstile-token'));
            return 'mock-widget-id';
        },
        execute() {},
        reset() {},
        remove() {},
        getResponse() {
            return '';
        },
    };
    return () => {
        w.turnstile = previous;
        document.getElementById('turnstile-script')?.remove();
    };
}

function WithTurnstileMock({ Story }: { Story: ComponentType }) {
    useLayoutEffect(() => installTurnstileMock(), []);
    return (
        <div className="w-full max-w-md p-6 bg-background border rounded-none">
            <h1 className="text-2xl font-bold text-foreground mb-1">Order Lookup</h1>
            <p className="text-sm text-muted-foreground mb-6">Enter the order number and email used at checkout.</p>
            <Story />
        </div>
    );
}

async function fillForm(canvas: ReturnType<typeof within>) {
    const orderNumberInput = canvas.getByLabelText('Order Number');
    const emailInput = canvas.getByLabelText('Email Address');
    await userEvent.type(orderNumberInput, '12345678');
    await userEvent.type(emailInput, 'test@example.com');
}

async function fillAndSubmit(canvas: ReturnType<typeof within>) {
    await fillForm(canvas);
    const submitButton = canvas.getByRole('button', { name: /find my order/i });
    await waitFor(() => expect(submitButton).not.toBeDisabled());
    await userEvent.click(submitButton);
}

const ConfigWithTurnstile = createConfigWrapper({
    app: {
        security: {
            turnstile: {
                sites: {
                    default: [{ siteKey: 'test-site-key', domains: ['localhost', '127.0.0.1'] }],
                },
                enabled: true,
            },
        },
    },
} as any);

const ConfigWithTurnstileDisabled = createConfigWrapper({
    app: {
        security: {
            turnstile: {
                sites: {},
                enabled: false,
            },
        },
    },
} as any);

const meta: Meta<typeof RequestCodeForm> = {
    title: 'ORDER LOOKUP/Request Code Form',
    component: RequestCodeForm,
    tags: ['autodocs', 'interaction'],
    parameters: {
        layout: 'centered',
        docs: {
            description: {
                component:
                    'Guest order lookup request-code form. Collects order number + email, runs Turnstile challenge (when enabled), and submits to `/action/order-lookup-request-code`. On success, switches to a "code sent" state with resend button.',
            },
        },
    },
    decorators: [
        (Story) => (
            <ConfigWithTurnstile>
                <WithTurnstileMock Story={Story} />
            </ConfigWithTurnstile>
        ),
    ],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);

        await expect(canvas.getByLabelText('Order Number')).toBeInTheDocument();
        await expect(canvas.getByLabelText('Email Address')).toBeInTheDocument();
        await expect(canvas.getByTestId('turnstile-widget')).toBeInTheDocument();
        await expect(canvas.getByRole('button', { name: /find my order/i })).toBeInTheDocument();
    },
};

export const Submitting: Story = {
    parameters: {
        mockRoutes: [
            {
                path: ORDER_LOOKUP_ACTION_PATH,
                // Never resolves, so the fetcher stays in `state: 'submitting'` for the assertion window.
                action: () => new Promise(() => {}),
            },
        ],
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);

        await fillAndSubmit(canvas);

        const submitButton = canvas.getByRole('button', { name: /find my order/i });
        await waitFor(() => expect(submitButton).toBeDisabled());
        await expect(submitButton).toHaveTextContent('Find My Order...');
    },
};

export const ValidationErrors: Story = {
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);

        const orderNumberInput = canvas.getByLabelText('Order Number');
        const emailInput = canvas.getByLabelText('Email Address');

        // Type invalid values and blur
        await userEvent.type(orderNumberInput, '123');
        await userEvent.tab();

        await expect(canvas.getByText('Please check your order number and email address.')).toBeInTheDocument();

        await userEvent.type(emailInput, 'not-an-email');
        await userEvent.tab();

        await expect(canvas.getAllByText('Please check your order number and email address.')).toHaveLength(2);
    },
};

export const RateLimitedError: Story = {
    parameters: {
        mockRoutes: [requestCodeAction({ ok: false, code: 'RATE_LIMITED' })],
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);

        await fillAndSubmit(canvas);

        const errorBanner = await canvas.findByRole('alert');
        await expect(errorBanner).toHaveTextContent(/too many requests/i);
    },
};

export const TurnstileFailedError: Story = {
    parameters: {
        mockRoutes: [requestCodeAction({ ok: false, code: 'TURNSTILE_FAILED' })],
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);

        await fillAndSubmit(canvas);

        const errorBanner = await canvas.findByRole('alert');
        await expect(errorBanner).toHaveTextContent(/verification failed/i);
    },
};

export const CodeSentState: Story = {
    parameters: {
        mockRoutes: [requestCodeAction({ ok: true })],
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);

        await fillAndSubmit(canvas);

        await expect(
            await canvas.findByText(/We've sent a verification code to test@example.com/i)
        ).toBeInTheDocument();
        await expect(canvas.getByRole('button', { name: /resend code/i })).toBeInTheDocument();
    },
};

export const TurnstileDisabled: Story = {
    decorators: [
        (Story) => (
            <ConfigWithTurnstileDisabled>
                <Story />
            </ConfigWithTurnstileDisabled>
        ),
    ],
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);

        await expect(canvas.getByLabelText('Order Number')).toBeInTheDocument();
        await expect(canvas.getByLabelText('Email Address')).toBeInTheDocument();
        await expect(canvas.queryByTestId('turnstile-widget')).not.toBeInTheDocument();
        await expect(canvas.getByRole('button', { name: /find my order/i })).toBeInTheDocument();
    },
};

/**
 * Form-fill archetype. Types valid order number + email into the two required
 * fields and asserts the values land correctly and the submit button becomes
 * enabled after Turnstile token is obtained.
 */
export const FilledForm: Story = {
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);

        const orderNumberInput = canvas.getByLabelText<HTMLInputElement>('Order Number');
        const emailInput = canvas.getByLabelText<HTMLInputElement>('Email Address');

        await userEvent.type(orderNumberInput, '12345678');
        await userEvent.type(emailInput, 'test@example.com');

        await expect(orderNumberInput).toHaveValue('12345678');
        await expect(emailInput).toHaveValue('test@example.com');
        await expect(emailInput.validity.valid).toBe(true);
    },
};
