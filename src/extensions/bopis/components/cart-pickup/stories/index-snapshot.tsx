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
import { vi, expect, test, describe, afterEach } from 'vitest';
import type React from 'react';

vi.mock('react-router', async () => ({
    UNSAFE_DataRouterContext: (await import('react')).createContext({}),
    href: (path: string) => path,
    createContext: vi.fn().mockImplementation(() => ({})),
    useFormAction: () => '.',
    useFetcher: () => ({
        data: null,
        state: 'idle',
        submit: () => {},
        Form: (props: React.PropsWithChildren<Record<string, unknown>>) => <form {...props}>{props.children}</form>,
    }),
    useFetchers: () => [],
    useNavigate: () => () => {},
    useLocation: () => ({ pathname: '/', search: '', hash: '', state: null, key: 'test' }),
    useNavigation: () => ({
        state: 'idle',
        location: { pathname: '/', search: '', hash: '', state: null, key: 'test' },
    }),
    useSearchParams: () => [new URLSearchParams(), vi.fn()],
    useInRouterContext: () => false,
    createMemoryRouter: vi.fn((routes) => ({
        routes: routes || [],
    })),
    RouterProvider: ({
        router,
        children,
    }: {
        router?: { routes?: Array<{ element?: React.ReactNode }> };
        children?: React.ReactNode;
    }) => {
        // Find the route with an element (usually the catch-all route at index 1)
        // If no route element found, render children as fallback (for test scenarios)
        const routeWithElement = router?.routes?.find((route) => {
            const elem = route.element;
            return elem && (typeof elem !== 'object' || !('then' in (elem as object)));
        });
        const element = routeWithElement?.element;
        // In test mocks, element is always a ReactElement, not a Promise
        if (element && (typeof element !== 'object' || !('then' in (element as object)))) {
            return <>{element as React.ReactElement}</>;
        }
        return <>{children}</>;
    },
    Link: (props: React.PropsWithChildren<{ to?: string; href?: string; [key: string]: unknown }>) => {
        const { to, href, children, ...rest } = props ?? {};
        return (
            <a href={to ?? href} {...rest}>
                {children}
            </a>
        );
    },
    Suspense: ({ children, fallback }: { children: React.ReactNode; fallback?: React.ReactNode }) => (
        <div>{fallback || children}</div>
    ),
    Await: ({ resolve, children }: { resolve: Promise<unknown>; children: (data: unknown) => React.ReactNode }) => {
        const resolveObj = resolve as any;
        const hasValue = resolveObj && typeof resolveObj === 'object' && '_value' in resolveObj;
        if (hasValue) {
            return <>{children(resolveObj._value)}</>;
        }
        return <>{children([])}</>;
    },
}));

import { composeStories } from '@storybook/react-vite';
import * as PickupStoreInfoStories from './index.stories';
import { render, cleanup } from '@testing-library/react';
import { StoryTestWrapper } from '../../../../../../.storybook/test-wrapper';

const composed = composeStories(PickupStoreInfoStories);

afterEach(() => {
    cleanup();
});

describe('CartPickup stories snapshot', () => {
    for (const [storyName, Story] of Object.entries(composed)) {
        // Skip interaction test stories from snapshots
        if (Story?.parameters?.snapshot === false || /interactiontests?/i.test(storyName)) continue;

        test(`${storyName} story renders and matches snapshot`, () => {
            const { container } = render(
                <StoryTestWrapper>
                    <Story />
                </StoryTestWrapper>
            );
            expect(container.firstChild).toMatchSnapshot();
        });
    }
});
