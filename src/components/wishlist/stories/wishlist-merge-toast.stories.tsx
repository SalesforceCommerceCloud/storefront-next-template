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
import { useEffect, useRef, type ReactElement } from 'react';
import { expect, waitFor, within } from 'storybook/test';
import { waitForStorybookReady } from '@storybook/test-utils';
import { useNavigate } from '@/hooks/use-navigate';
import { Toaster } from '@/components/toast';
import { WishlistMergeToast } from '../wishlist-merge-toast';

type WishlistMergeToastArgs = {
    flag: 'success' | 'partial' | 'bogus' | 'none';
};

/**
 * Story host. Reuses Storybook's preview-provided router. On mount, pushes the URL
 * (with optional wishlistMerge query) onto that router so WishlistMergeToast can
 * read it via useSearchParams. We render <Toaster /> so the toast is observable.
 */
function StoryHost({ flag }: WishlistMergeToastArgs): ReactElement {
    const navigate = useNavigate();
    const didPush = useRef(false);

    useEffect(() => {
        if (didPush.current) return;
        didPush.current = true;
        const target = flag === 'none' ? '/' : `/?wishlistMerge=${flag}`;
        void navigate(target, { replace: true });
    }, [flag, navigate]);

    return (
        <div className="space-y-4">
            <div data-testid="route-shell">
                <p>Account wishlist route shell — toast mount target.</p>
            </div>
            <WishlistMergeToast />
            <Toaster />
        </div>
    );
}

const meta: Meta<typeof StoryHost> = {
    title: 'Account/Wishlist/Wishlist Merge Toast',
    component: StoryHost,
    tags: ['autodocs', 'interaction'],
    parameters: {
        layout: 'padded',
        docs: {
            description: {
                component: `
Effect-only component mounted in the authenticated app shell. When the URL carries
\`?wishlistMerge=success\` or \`?wishlistMerge=partial\` (set by an auth-success route after
merging the guest wishlist), it fires a toast and replaces the URL to strip the param so
a refresh does not re-fire.

The component renders nothing — the observable behaviour is the toast and the URL change.
                `,
            },
        },
    },
    argTypes: {
        flag: {
            description: 'wishlistMerge query value to inject on mount',
            control: { type: 'select' },
            options: ['success', 'partial', 'bogus', 'none'],
        },
    },
};

export default meta;
type Story = StoryObj<typeof StoryHost>;

export const Success: Story = {
    name: 'Success flag → toast surfaces',
    args: { flag: 'success' },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);
        await expect(canvas.getByTestId('route-shell')).toBeInTheDocument();

        // Sonner portals out of canvas; assert against document.body
        const body = within(document.body);
        await waitFor(async () => {
            await expect(body.getByText(/added to your account wishlist/i)).toBeInTheDocument();
        });
    },
};

export const Partial: Story = {
    name: 'Partial flag → partial-merge toast',
    args: { flag: 'partial' },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const body = within(document.body);
        await waitFor(async () => {
            await expect(body.getByText(/no longer available/i)).toBeInTheDocument();
        });
    },
};

export const NoFlag: Story = {
    name: 'No flag → silent (no toast)',
    args: { flag: 'none' },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);
        await expect(canvas.getByTestId('route-shell')).toBeInTheDocument();

        const body = within(document.body);
        await expect(body.queryByText(/added to your account wishlist/i)).not.toBeInTheDocument();
        await expect(body.queryByText(/no longer available/i)).not.toBeInTheDocument();
    },
};

export const InvalidFlag: Story = {
    name: 'Invalid flag value → silent',
    args: { flag: 'bogus' },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const body = within(document.body);
        await expect(body.queryByText(/added to your account wishlist/i)).not.toBeInTheDocument();
    },
};
