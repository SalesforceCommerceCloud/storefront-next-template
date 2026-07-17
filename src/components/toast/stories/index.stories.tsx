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
import { expect, within, userEvent, waitFor } from 'storybook/test';
import { waitForStorybookReady } from '@storybook/test-utils';
import { Button } from '@/components/ui/button';
import { AppToaster, toast, useToast } from '../index';

/**
 * Story scaffold that mirrors how toasts work in production — the page
 * mounts a single `<AppToaster>` at the root (see `src/root.tsx`), and
 * any component on the page calls `useToast()` (or `toast.*` directly)
 * to enqueue a notification.
 */
function ToastDemo({ triggerLabel, onTrigger }: { triggerLabel: string; onTrigger: () => void }) {
    return (
        <div className="flex flex-col items-start gap-4 p-6">
            <AppToaster />
            <Button onClick={onTrigger}>{triggerLabel}</Button>
        </div>
    );
}

const meta: Meta = {
    title: 'Core/Feedback/Toast',
    tags: ['autodocs', 'interaction'],
    parameters: {
        layout: 'fullscreen',
        docs: {
            description: {
                component: `
Toast notifications powered by [sonner](https://sonner.emilkowal.ski/).

In production the app mounts a single \`<AppToaster />\` at the route root and components call the imperative \`useToast()\` hook to enqueue messages. Stories below mirror that setup so what you see is what ships.
                `,
            },
        },
    },
};

export default meta;
type Story = StoryObj;

/**
 * Default info toast. Mirrors typical app feedback like "Item added to cart".
 */
export const Default: Story = {
    render: () => {
        function Trigger() {
            const { addToast } = useToast();
            return <ToastDemo triggerLabel="Show toast" onTrigger={() => addToast('Event has been created', 'info')} />;
        }
        return <Trigger />;
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);
        const button = await canvas.findByRole('button', { name: /show toast/i });

        await userEvent.click(button);

        // Sonner renders toasts into a portal under document.body.
        await waitFor(
            async () => {
                await expect(within(document.body).findByText(/event has been created/i)).resolves.toBeInTheDocument();
            },
            { timeout: 2000 }
        );
    },
};

/**
 * Success variant — used after successful mutations like saving a profile
 * or applying a promo code.
 */
export const Success: Story = {
    render: () => {
        function Trigger() {
            const { addToast } = useToast();
            return (
                <ToastDemo
                    triggerLabel="Show success toast"
                    onTrigger={() =>
                        addToast('Saved successfully', 'success', {
                            description: 'Your changes have been saved.',
                        })
                    }
                />
            );
        }
        return <Trigger />;
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);
        const button = await canvas.findByRole('button', { name: /show success toast/i });

        await userEvent.click(button);

        await waitFor(
            async () => {
                await expect(within(document.body).findByText(/saved successfully/i)).resolves.toBeInTheDocument();
            },
            { timeout: 2000 }
        );
    },
};

/**
 * Error variant — used for action failures (e.g. payment declined,
 * validation error).
 */
export const Error: Story = {
    render: () => {
        function Trigger() {
            const { addToast } = useToast();
            return (
                <ToastDemo
                    triggerLabel="Show error toast"
                    onTrigger={() =>
                        addToast('Save failed', 'error', {
                            description: 'Could not save your changes. Please try again.',
                        })
                    }
                />
            );
        }
        return <Trigger />;
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);
        const button = await canvas.findByRole('button', { name: /show error toast/i });

        await userEvent.click(button);

        await waitFor(
            async () => {
                await expect(within(document.body).findByText(/save failed/i)).resolves.toBeInTheDocument();
            },
            { timeout: 2000 }
        );
    },
};

/**
 * Promise variant — shows a loading toast that auto-resolves to success
 * or error when the underlying promise settles. Used for long-running
 * actions like placing an order.
 */
export const Promise_: Story = {
    name: 'Promise',
    render: () => (
        <div className="flex flex-col items-start gap-4 p-6">
            <AppToaster />
            <Button
                onClick={() => {
                    const work = new Promise<{ name: string }>((resolve) =>
                        setTimeout(() => resolve({ name: 'Order #1234' }), 1500)
                    );
                    toast.promise(work, {
                        loading: 'Placing order…',
                        success: (data) => `${data.name} placed`,
                        error: 'Order could not be placed',
                    });
                }}>
                Show promise toast
            </Button>
        </div>
    ),
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);
        const button = await canvas.findByRole('button', { name: /show promise toast/i });

        await userEvent.click(button);

        // First the loading toast appears.
        await waitFor(
            async () => {
                await expect(within(document.body).findByText(/placing order/i)).resolves.toBeInTheDocument();
            },
            { timeout: 1000 }
        );

        // Then the resolved success toast replaces it (1500ms delay above).
        await waitFor(
            async () => {
                await expect(within(document.body).findByText(/order #1234 placed/i)).resolves.toBeInTheDocument();
            },
            { timeout: 3000 }
        );
    },
};

/**
 * Promise rejection variant — exercises the rejected-path of `toast.promise`,
 * where the loading toast is replaced by the configured `error` string when
 * the underlying promise rejects.
 */
export const PromiseRejection: Story = {
    render: () => (
        <div className="flex flex-col items-start gap-4 p-6">
            <AppToaster />
            <Button
                onClick={() => {
                    const work = new Promise<{ name: string }>((_, reject) =>
                        setTimeout(() => reject(new globalThis.Error('Network timeout')), 1500)
                    );
                    toast.promise(work, {
                        loading: 'Placing order…',
                        success: (data) => `${data.name} placed`,
                        error: 'Order could not be placed',
                    });
                }}>
                Show promise rejection toast
            </Button>
        </div>
    ),
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);
        const button = await canvas.findByRole('button', { name: /show promise rejection toast/i });

        await userEvent.click(button);

        // Loading toast appears first.
        await waitFor(
            async () => {
                await expect(within(document.body).findByText(/placing order/i)).resolves.toBeInTheDocument();
            },
            { timeout: 1000 }
        );

        // Then the rejected error toast replaces it (1500ms delay above).
        await waitFor(
            async () => {
                await expect(
                    within(document.body).findByText(/order could not be placed/i)
                ).resolves.toBeInTheDocument();
            },
            { timeout: 3000 }
        );
    },
};
