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
import { createPage } from '../index';
import { expect, within } from 'storybook/test';
import { waitForStorybookReady } from '@storybook/test-utils';

type ExampleLoaderData = { title: string; content: string };

function ExamplePageComponent({ loaderData }: { loaderData?: ExampleLoaderData }) {
    return (
        <div className="p-6">
            <h1 className="text-2xl font-bold mb-4">{loaderData?.title || 'Default Title'}</h1>
            <p className="text-muted-foreground">{loaderData?.content || 'Default content'}</p>
        </div>
    );
}

type CreatePageArgs = {
    title: string;
    content: string;
    withPageKey: boolean;
    withCustomFallback: boolean;
};

// CreatePageArgs is a synthetic args shape that drives createPage() factory invocation, so it
// doesn't share a prop signature with ExamplePageComponent. Drop `component:` from the meta —
// Storybook's autodocs will fall back to the title.
const meta: Meta<CreatePageArgs> = {
    title: 'Core/Utilities/Create Page',
    tags: ['autodocs', 'interaction'],
    parameters: {
        layout: 'centered',
        docs: {
            description: {
                component:
                    'A higher-order component factory that wraps a route component with Suspense + an optional page-key Fragment for navigation transitions. Used by every route in the storefront via `createPage({ component, fallback?, getPageKey? })`. The story demos use a small `ExamplePageComponent` to show the factory output; in production the component is your route view (e.g. `CategoryView`, `ProductView`).',
            },
        },
    },
    argTypes: {
        title: { control: 'text', description: 'loaderData.title passed to the wrapped component' },
        content: { control: 'text', description: 'loaderData.content passed to the wrapped component' },
        withPageKey: {
            control: 'boolean',
            description:
                'Synthetic toggle: when on, calls createPage with a getPageKey that returns loaderData.title. The page is wrapped in <Fragment key={pageKey}> so navigation transitions remount cleanly.',
            table: { category: 'Synthetic' },
        },
        withCustomFallback: {
            control: 'boolean',
            description:
                'Synthetic toggle: when on, supplies a custom Suspense fallback (default fallback is a 7-skeleton stack).',
            table: { category: 'Synthetic' },
        },
    },
    args: {
        title: 'Example Page',
        content: 'This is an example page created with createPage.',
        withPageKey: false,
        withCustomFallback: false,
    },
    render: ({ title, content, withPageKey, withCustomFallback }) => {
        const Page = createPage<ExampleLoaderData>({
            component: ExamplePageComponent,
            getPageKey: withPageKey ? (data) => data?.title || 'default' : undefined,
            fallback: withCustomFallback ? (
                <div className="p-6 bg-muted rounded">Custom loading state...</div>
            ) : undefined,
        });
        return <Page loaderData={{ title, content }} />;
    },
};

export default meta;
type Story = StoryObj<CreatePageArgs>;

export const Playground: Story = {
    parameters: {
        docs: {
            description: {
                story: 'Toggle the title/content via Controls; flip `withPageKey` and `withCustomFallback` to observe the HOC factory variants.',
            },
        },
    },
};

export const Default: Story = {
    parameters: {
        docs: {
            description: {
                story: 'Basic page created with `createPage` — Suspense + default fallback.',
            },
        },
    },
    play: async ({ canvasElement }) => {
        const canvas = within(canvasElement);
        await waitForStorybookReady(canvasElement);
        const title = await canvas.findByRole('heading', { name: /example page/i });
        await expect(title).toBeInTheDocument();
    },
};

export const WithPageKey: Story = {
    args: {
        title: 'Page With Key',
        content:
            'This page uses a custom page key function — wraps in <Fragment key={pageKey}> for navigation transitions.',
        withPageKey: true,
    },
    parameters: {
        docs: {
            description: {
                story: 'Demonstrates `getPageKey` — the wrapped page is keyed off loader data so navigation between two routes that resolve to the same component still triggers a remount.',
            },
        },
    },
    play: async ({ canvasElement }) => {
        const canvas = within(canvasElement);
        await waitForStorybookReady(canvasElement);
        const title = await canvas.findByRole('heading', { name: /page with key/i });
        await expect(title).toBeInTheDocument();
    },
};

export const WithCustomFallback: Story = {
    args: {
        title: 'Custom Fallback',
        content: 'This page uses a custom fallback component (visible only while a Suspense boundary is pending).',
        withCustomFallback: true,
    },
    parameters: {
        docs: {
            description: {
                story: 'Demonstrates the custom-`fallback` arg. The fallback only renders when the wrapped component (or one of its children) suspends; with synchronous loader data the resolved view shows immediately.',
            },
        },
    },
    play: async ({ canvasElement }) => {
        const canvas = within(canvasElement);
        await waitForStorybookReady(canvasElement);
        const title = await canvas.findByRole('heading', { name: /custom fallback/i });
        await expect(title).toBeInTheDocument();
    },
};
