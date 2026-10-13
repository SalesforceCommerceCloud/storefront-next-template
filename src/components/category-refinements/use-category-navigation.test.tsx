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
import type { PropsWithChildren } from 'react';
import { act, renderHook } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { ConfigProvider } from '@salesforce/storefront-next-runtime/config';
import { SiteProvider } from '@salesforce/storefront-next-runtime/site-context';
import { mockConfig, mockLocale, mockSiteObject } from '@/test-utils/config';
import { useCategoryNavigation } from './use-category-navigation';

const mockNavigate = vi.fn();

vi.mock('@/hooks/use-navigate', () => ({
    useNavigate: () => mockNavigate,
}));

beforeEach(() => {
    mockNavigate.mockClear();
});

function createWrapper(config: typeof mockConfig, initialEntry = '/') {
    return function Wrapper({ children }: PropsWithChildren) {
        return (
            <ConfigProvider config={config}>
                <SiteProvider
                    site={mockSiteObject}
                    locale={mockLocale}
                    language={mockSiteObject.defaultLocale}
                    currency={mockSiteObject.defaultCurrency}>
                    <MemoryRouter initialEntries={[initialEntry]}>{children}</MemoryRouter>
                </SiteProvider>
            </ConfigProvider>
        );
    };
}

describe('useCategoryNavigation', () => {
    test('resolves configured SEO navigation to an executable callback', () => {
        const config = {
            ...mockConfig,
            url: {
                ...mockConfig.url,
                seoRoutes: {
                    [mockSiteObject.id]: {
                        product: { prefix: 'p' },
                        category: { prefix: 'catalog', mode: 'slug-path' as const },
                    },
                },
            },
        };
        const { result } = renderHook(
            () =>
                useCategoryNavigation({
                    id: 'mens',
                    name: 'Men',
                    categories: [{ id: 'mens-tops', name: 'Tops', slug: 'mens/tops' }],
                }),
            { wrapper: createWrapper(config) }
        );

        const navigation = result.current('mens-tops', new URLSearchParams());

        expect(navigation).toEqual(expect.any(Function));
        act(() => navigation?.());
        expect(mockNavigate).toHaveBeenCalledWith('/catalog/mens/tops');
    });

    test('resolves legacy refinement navigation when SEO routes are not configured', () => {
        const { result } = renderHook(() => useCategoryNavigation({ id: 'mens', name: 'Men' }), {
            wrapper: createWrapper(mockConfig, '/category/mens?refine=cgid%3Dmens&sort=best-matches'),
        });
        const searchParams = new URLSearchParams('refine=cgid%3Dmens&sort=best-matches');

        const navigation = result.current('mens-tops', searchParams);

        expect(navigation).toEqual(expect.any(Function));
        act(() => navigation?.());
        expect(mockNavigate).toHaveBeenCalledWith({
            pathname: '/category/mens',
            search: '?sort=best-matches&refine=cgid%3Dmens-tops&offset=0',
        });
    });

    test('returns undefined only when a configured destination is unavailable', () => {
        const config = {
            ...mockConfig,
            url: {
                ...mockConfig.url,
                seoRoutes: {
                    [mockSiteObject.id]: {
                        product: { prefix: 'p' },
                        category: { prefix: 'catalog', mode: 'slug-path' as const },
                    },
                },
            },
        };
        const { result } = renderHook(
            () =>
                useCategoryNavigation({
                    id: 'mens',
                    name: 'Men',
                    categories: [{ id: 'mens-tops', name: 'Tops' }],
                }),
            { wrapper: createWrapper(config) }
        );

        expect(result.current('mens-tops', new URLSearchParams())).toBeUndefined();
    });
});
