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
import withSuspense from '../index';
import { expect, within } from 'storybook/test';
import { waitForStorybookReady } from '@storybook/test-utils';

// Example component to use with withSuspense
function ExampleComponent({ data, message }: { data?: { name: string }; message?: string }) {
    return (
        <div className="p-6">
            <h2 className="text-2xl font-bold mb-2">{data?.name || message || 'Loaded'}</h2>
            <p className="text-muted-foreground">This component was loaded with Suspense.</p>
        </div>
    );
}

const ExampleWithSuspense = withSuspense(ExampleComponent, {
    fallback: <div className="p-6">Loading component...</div>,
});

// Build a fresh suspense-wrapped component on every render so each story run
// gets its own promise. A module-scope promise can already be settled before
// the story mounts, which makes the suspense-then-resolve transition
// unobservable.
//
// The 600ms delay keeps the fallback visible long enough for the snapshot
// harness to capture a deterministic state (the fallback) — without the
// delay the snapshot races against the act() flush and is non-deterministic.
// The play function below waits longer than 600ms so it observes the
// post-resolution state in the live Storybook UI.
const buildExampleWithPromise = () => {
    const resolvedPromise = new Promise<{ name: string }>((resolve) => {
        setTimeout(() => resolve({ name: 'Resolved Data' }), 600);
    });
    return withSuspense(ExampleComponent, {
        fallback: <div className="p-6">Loading data...</div>,
        resolve: resolvedPromise,
    });
};

const meta: Meta<typeof ExampleWithSuspense> = {
    title: 'Core/Utilities/With Suspense',
    component: ExampleWithSuspense,
    tags: ['autodocs', 'interaction'],
    parameters: {
        layout: 'centered',
        docs: {
            description: {
                component: `
A higher-order component that wraps components with Suspense boundaries and optional promise resolution.

### Features:
- Automatic Suspense wrapping
- Custom fallback components
- Promise resolution support
- Data prop injection
                `,
            },
        },
    },
};

export default meta;
type Story = StoryObj<typeof ExampleWithSuspense>;

export const Default: Story = {
    render: () => <ExampleWithSuspense message="Default Component" />,
    parameters: {
        docs: {
            story: `
Component wrapped with Suspense using default fallback.

### Features:
- Suspense boundary
- Default fallback
- No promise resolution
            `,
        },
    },
    play: async ({ canvasElement }) => {
        const canvas = within(canvasElement);

        await waitForStorybookReady(canvasElement);

        // Check for loaded content
        const content = await canvas.findByText(/default component/i, {}, { timeout: 5000 });
        await expect(content).toBeInTheDocument();
    },
};

export const FallbackVisible: Story = {
    render: () => {
        // 600ms delay is long enough for the play function to assert the
        // fallback (1000ms timeout) but short enough that the promise
        // resolves and the suspended resource is released before vitest
        // cleanup — avoids leaked-timer / act() warnings in the snapshot
        // harness.
        const slowPromise = new Promise<{ name: string }>((resolve) => {
            setTimeout(() => resolve({ name: 'Slow Resolved' }), 600);
        });
        const SlowExample = withSuspense(ExampleComponent, {
            fallback: <div className="p-6 bg-muted rounded">Loading slow data…</div>,
            resolve: slowPromise,
        });
        return <SlowExample />;
    },
    parameters: {
        docs: {
            story: 'A short delay keeps the fallback visible long enough to verify the loading state renders.',
        },
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);
        // Fallback should appear quickly.
        const fallback = await canvas.findByText(/loading slow data/i, {}, { timeout: 500 });
        await expect(fallback).toBeInTheDocument();
    },
};

export const WithPromise: Story = {
    render: () => {
        const ExampleWithPromise = buildExampleWithPromise();
        return <ExampleWithPromise />;
    },
    parameters: {
        docs: {
            story: `
Component wrapped with Suspense that resolves a promise and passes data as prop.

### Features:
- Promise resolution
- Data prop injection
- Automatic Suspense handling
            `,
        },
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);

        // The promise resolves at 600ms (see buildExampleWithPromise above);
        // a 1500ms ceiling is tight enough to catch a "promise never resolves"
        // regression without flaking on slow CI.
        const resolved = await canvas.findByText(/resolved data/i, {}, { timeout: 1500 });
        await expect(resolved).toBeInTheDocument();
    },
};
