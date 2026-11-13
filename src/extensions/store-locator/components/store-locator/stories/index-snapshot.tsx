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

// The luxury overlay uses extStoreLocator translations. In the mirror's storybook context
// only the canonical extStoreLocator translations are loaded ("Find a Store"), not the
// luxury override ("Find a Boutique"). Stub only this namespace with canonical values so
// template and mirror produce identical snapshots. All other namespaces use real translations.
vi.mock('react-i18next', async (importOriginal) => {
    const actual = await importOriginal<typeof import('react-i18next')>();
    const realUseTranslation = actual.useTranslation as (...args: unknown[]) => unknown;
    return {
        ...actual,
        useTranslation: (...args: unknown[]) => {
            const ns = Array.isArray(args[0]) ? args[0][0] : args[0];
            if (ns === 'extStoreLocator') {
                return {
                    t: (key: string) => ({ 'storeLocator.title': 'Find a Store' })[key] ?? key,
                    i18n: { language: 'en-US' },
                };
            }
            return realUseTranslation(...args);
        },
    };
});

// The luxury overlay's useBoutiqueList calls useFetcher twice (territories + boutiques).
// Stub the hook directly so no route fetches are attempted in the snapshot context.
vi.mock('@/extensions/store-locator/hooks/use-boutique-list', () => ({
    useBoutiqueList: () => ({ stores: [], availability: undefined, isLoading: false, hasError: false }),
}));

vi.mock('react-router', () => ({
    href: (path: string) => path,
    createContext: vi.fn().mockImplementation(() => ({})),
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
    useRevalidator: () => ({
        revalidate: () => Promise.resolve(),
    }),
}));

import { composeStories } from '@storybook/react-vite';
import * as StoreLocatorStories from './index.stories';
import { render, cleanup } from '@testing-library/react';
import { StoryTestWrapper } from '../../../../../../.storybook/test-wrapper';

const composed = composeStories(StoreLocatorStories);

afterEach(() => {
    cleanup();
});

describe('StoreLocator stories snapshot', () => {
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
