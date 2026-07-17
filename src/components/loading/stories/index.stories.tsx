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
import { expect, waitFor, within } from 'storybook/test';
import { waitForStorybookReady } from '@storybook/test-utils';
// Storybook stories drive the global memory-router via the framework's
// `useNavigate` so `Loading`'s `useNavigation()` hook can observe a real
// non-idle transition. The site-aware project wrapper from
// `@/hooks/use-navigate` requires SiteProvider/ConfigProvider that the
// Storybook harness doesn't set up for this isolated story.

// eslint-disable-next-line no-restricted-imports -- storybook harness lacks SiteProvider/ConfigProvider; see comment above
import { useNavigate } from 'react-router';
import { useEffect, type ReactElement } from 'react';
import Loading from '..';

/**
 * On mount, kick off a programmatic navigation to a route whose loader is
 * deliberately slow. While the loader resolves React Router's
 * `useNavigation().state` is `'loading'`, which is exactly the signal
 * `<Loading />` watches for and opens its overlay 150ms later.
 */
function NavigateOnMount({ to }: { to: string }): ReactElement {
    const navigate = useNavigate();
    useEffect(() => {
        navigate(to);
    }, [navigate, to]);
    return <p className="p-4 text-sm text-muted-foreground">Idle.</p>;
}

const SLOW_NAV_PATH = '/storybook-loading-target';

const meta: Meta<typeof Loading> = {
    title: 'Core/Feedback/Loading',
    component: Loading,
    tags: ['autodocs', 'interaction'],
    parameters: {
        layout: 'fullscreen',
        docs: {
            description: {
                component: `
Route-level loading indicator that subscribes to React Router's \`useNavigation()\`.

The overlay opens 150ms after the router transitions to \`'loading'\` (or \`'submitting'\`) and closes as soon as the router returns to \`'idle'\`. It's optimized for streaming SSR — the initial server render never shows the spinner; only client-side follow-up navigations.
                `,
            },
        },
    },
};

export default meta;
type Story = StoryObj<typeof Loading>;

/**
 * Active navigation — `NavigateOnMount` triggers a navigation whose loader
 * is held for 1500ms. The overlay appears 150ms in and disappears when the
 * destination loader resolves.
 */
export const Loading_: Story = {
    name: 'Loading',
    parameters: {
        mockRoutes: [
            {
                path: SLOW_NAV_PATH,
                loader: () => new Promise((resolve) => setTimeout(() => resolve({}), 1500)),
                element: <p className="p-4 text-sm">Destination loaded.</p>,
            },
        ],
    },
    render: () => (
        <div className="min-h-screen bg-background">
            <Loading />
            <NavigateOnMount to={SLOW_NAV_PATH} />
        </div>
    ),
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);

        // The overlay is `position: fixed` and uses `.animate-spin` for the
        // visual indicator. It mounts ~150ms after the navigation begins.
        await waitFor(
            () => {
                expect(document.querySelector('.animate-spin')).not.toBeNull();
            },
            { timeout: 1000 }
        );

        // After the destination loader resolves the overlay is unmounted and
        // the destination text becomes visible inside the canvas.
        await waitFor(
            () => {
                expect(within(canvasElement).queryByText(/destination loaded/i)).toBeInTheDocument();
                expect(document.querySelector('.animate-spin')).toBeNull();
            },
            { timeout: 3000 }
        );
    },
};
