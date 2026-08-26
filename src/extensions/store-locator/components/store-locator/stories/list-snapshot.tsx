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
import type { ShopperStores } from '@/scapi';

const createMockStore = (
    storeId: string,
    inventoryId: string,
    overrides: Partial<ShopperStores.schemas['Store']> = {}
): ShopperStores.schemas['Store'] => ({
    id: storeId,
    inventoryId,
    name: 'Test Store',
    address1: '123 Main St',
    city: 'San Francisco',
    stateCode: 'CA',
    postalCode: '94102',
    countryCode: 'US',
    ...overrides,
});

// Mock stores data for snapshot tests
const mockStoresData = {
    success: true,
    stores: {
        data: [
            createMockStore('store-1', 'inventory-1', {
                name: 'Downtown Store',
                address1: '123 Main Street',
                city: 'San Francisco',
                stateCode: 'CA',
                postalCode: '94102',
                distance: 2.5,
            }),
            createMockStore('store-2', 'inventory-2', {
                name: 'Uptown Store',
                address1: '456 Oak Avenue',
                city: 'San Francisco',
                stateCode: 'CA',
                postalCode: '94103',
                distance: 5.2,
            }),
        ],
    },
};

vi.mock('react-router', () => ({
    href: (path: string) => path,
    createContext: vi.fn().mockImplementation(() => ({})),
    useFetcher: () => ({
        data: mockStoresData,
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
import * as ListStories from './list.stories';
import { render, cleanup } from '@testing-library/react';
import { StoryTestWrapper } from '../../../../../../.storybook/test-wrapper';

const composed = composeStories(ListStories);

afterEach(() => {
    cleanup();
});

// Mock config with supportedCountries
const mockConfig = {
    supportedCountries: [
        { countryCode: 'US', countryName: 'United States' },
        { countryCode: 'GB', countryName: 'United Kingdom' },
    ],
    radius: 100,
    radiusUnit: 'km',
    limit: 200,
    geoTimeout: 10000,
};

// Mock the store locator hook to simulate a search has been performed
vi.mock('@/extensions/store-locator/providers/store-locator', async () => {
    const actual = await vi.importActual('@/extensions/store-locator/providers/store-locator');
    return {
        ...actual,
        useStoreLocator: (selector: (store: any) => any) => {
            const mockStore = {
                mode: 'input',
                searchParams: { countryCode: 'US', postalCode: '94102' },
                deviceCoordinates: { latitude: null, longitude: null },
                config: mockConfig,
                selectedStoreInfo: null,
                geoError: false,
                shouldSearch: false,
                setShouldSearch: vi.fn(),
                setSelectedStoreInfo: vi.fn(),
            };
            return selector(mockStore);
        },
    };
});

// Mock the use-store-locator-list hook to return hasSearched: true
vi.mock('@/extensions/store-locator/hooks/use-store-locator-list', () => ({
    useStoreLocatorList: () => ({
        mode: 'input',
        searchParams: { countryCode: 'US', postalCode: '94102' },
        config: mockConfig,
        selectedStoreInfo: null,
        setSelectedStoreInfo: vi.fn(),
        geoError: false,
        hasSearched: true, // This is the key - set to true so component renders
        hasError: false,
        isLoading: false,
        stores: mockStoresData.stores.data,
        storesPaginated: mockStoresData.stores.data,
        setPage: vi.fn(),
    }),
}));

describe('StoreLocatorList stories snapshot', () => {
    for (const [storyName, Story] of Object.entries(composed)) {
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
