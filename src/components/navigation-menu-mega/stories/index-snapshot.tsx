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
import type { ReactNode } from 'react';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { composeStories } from '@storybook/react-vite';
import { cleanup, render } from '@testing-library/react';

// Synthesize the resolved value for `<Await>` so the snapshot captures the
// empty-state baseline (hamburger + empty mobile drawer) instead of the
// suspended fallback. Everything else from `react-router` flows through.
vi.mock('react-router', async (importOriginal) => {
    const actual = await importOriginal<typeof import('react-router')>();
    return {
        ...actual,
        Await: ({ children }: { resolve: Promise<unknown>; children: (data: unknown) => ReactNode }) =>
            children([]),
    };
});

// The site-aware `useNavigate` wrapper depends on `useConfig` and a router
// context, neither of which the snapshot harness mounts. Stub it the same way
// `index.test.tsx` does.
vi.mock('@/hooks/use-navigate', () => ({
    useNavigate: () => vi.fn(),
}));

import * as MegaMenuStories from './index.stories';

const composed = composeStories(MegaMenuStories);

afterEach(() => {
    cleanup();
});

describe('CategoryNavigationMenuMega stories snapshot', () => {
    for (const [storyName, Story] of Object.entries(composed)) {
        if (Story?.parameters?.snapshot === false || /interactiontests?/i.test(storyName)) continue;
        test(`${storyName} story renders and matches snapshot`, () => {
            const { container } = render(<Story />);
            expect(container.firstChild).toMatchSnapshot();
        });
    }
});
