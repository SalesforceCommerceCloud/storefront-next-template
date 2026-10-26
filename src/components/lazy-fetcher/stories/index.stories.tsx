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
import LazyFetcher from '../index';

type DemoData = { message: string };

const meta: Meta<typeof LazyFetcher<DemoData>> = {
    title: 'Core/Utility/LazyFetcher',
    component: LazyFetcher,
    tags: ['autodocs'],
    parameters: {
        docs: {
            description: {
                component:
                    'Defers a resource-route fetch until the container enters the viewport. Shows `fallback` while pending and renders `children(data)` once data arrives. Returns `null` when the fetch settles with an error so the section hides rather than showing the skeleton indefinitely.',
            },
        },
        mockRoutes: [
            {
                path: '/resource/lazy-demo',
                loader: () => Response.json({ message: 'Loaded from resource route.' }),
            },
            {
                path: '/resource/lazy-demo-error',
                loader: () => new Response('Internal Error', { status: 500 }),
            },
        ],
    },
    args: {
        url: '/resource/lazy-demo',
        fallback: <p className="text-sm text-muted-foreground animate-pulse">Loading…</p>,
        children: (data: DemoData) => <p className="text-sm">{data.message}</p>,
    },
};

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * Before the container enters the viewport the fetcher has not fired.
 * In snapshot tests (JSDOM) IntersectionObserver never fires, so this
 * state is what the snapshot captures — the fallback content inside the
 * wrapper div.
 */
export const Pending: Story = {};

/**
 * When the resource route returns an error (non-JSON plain-text response)
 * the component returns `null` rather than keeping the fallback skeleton
 * visible indefinitely. The wrapper div is still in the DOM but renders
 * no children.
 */
export const ErrorState: Story = {
    args: {
        url: '/resource/lazy-demo-error',
    },
};
